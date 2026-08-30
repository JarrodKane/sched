// Supabase Edge Function — triggered by pg_cron every 5 minutes
// Fetches ticket data from Humanitix/Eventbrite for active shows and caches in ticket_snapshots.
// Uses Melbourne-time-aware polling: quiet midnight–6am, hourly off-peak, every 5 min at show time.
//
// ?backfill=1  — one-time historical fetch: 180-day lookback, bypasses throttle, fetches Eventbrite
//                for past dates. Run once after initial setup to populate historical data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HUMANITIX_BASE = 'https://api.humanitix.com/v1';
const EVENTBRITE_BASE = 'https://www.eventbriteapi.com/v3';
const MELB_TZ = 'Australia/Melbourne';

interface Show {
	id: string;
	account_id: string;
	name: string;
	humanitix_event_id: string | null;
	eventbrite_event_id: string | null;
}

interface TicketType {
	id: string;
	name: string;
	sold: number;
	capacity: number;
	price: number;
}

interface TicketData {
	date_id: string;
	total_sold: number;
	total_capacity: number;
	ticket_types: TicketType[];
}

interface EbOccurrence {
	id: string;
	ticketClasses: EbTicketClass[];
}

interface EbTicketClass {
	id: string;
	name: string;
	quantity_sold: number | null;
	quantity_total: number | null;
	cost?: { value: number };
	donation: boolean;
	hidden?: boolean;
}

function getMelbourneHour(): number {
	return parseInt(
		new Intl.DateTimeFormat('en-AU', { timeZone: MELB_TZ, hour: 'numeric', hour12: false }).format(new Date()),
		10
	);
}

function toMelbourneDate(utcStr: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: MELB_TZ,
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date(utcStr));
}

function todayMelbourne(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: MELB_TZ,
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());
}

// Decide whether to refetch based on Melbourne hour and how long since last fetch
function shouldFetch(hour: number, lastFetchedAt: string | null): boolean {
	if (hour >= 0 && hour < 6) return false;
	if (!lastFetchedAt) return true;

	const minsAgo = (Date.now() - new Date(lastFetchedAt).getTime()) / 60_000;

	if (hour >= 6 && hour < 15) return minsAgo >= 60;
	if (hour >= 15 && hour < 17) return minsAgo >= 10;
	if (hour >= 17 && hour < 20) return minsAgo >= 5;
	if (hour >= 20 && hour < 21) return minsAgo >= 10;
	return minsAgo >= 60; // 21–23
}

// Find event dates within the relevant window.
// Normal mode: today + 30 days forward (no past lookback — avoids overwriting past Eventbrite data with null).
// Backfill mode: lookbackDays back + 30 days forward.
function relevantDates(
	dates: Array<{ _id: string; startDate: string; deleted: boolean; disabled?: boolean }>,
	todayStr: string,
	lookbackDays = 0
): Array<{ id: string; date: string }> {
	const today = new Date(todayStr + 'T00:00:00');
	const past = lookbackDays > 0 ? new Date(today.getTime() - lookbackDays * 86_400_000) : today;
	const future = new Date(today.getTime() + 30 * 86_400_000);

	return dates
		.filter((d) => !d.deleted && !d.disabled)
		.map((d) => ({ id: d._id, date: toMelbourneDate(d.startDate) }))
		.filter((d) => {
			const dt = new Date(d.date + 'T00:00:00');
			return dt >= past && dt <= future;
		});
}

// Paginate the Humanitix dates endpoint to get ALL event dates (past + future).
// Falls back to the dates[] embedded in the event object if the endpoint isn't supported.
// Returns Map<melbDateStr, eventDateId> for all non-deleted, non-disabled dates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchHumanitixDateMap(
	eventId: string,
	apiKey: string,
	fallbackDates: Array<{ _id: string; startDate: string; deleted: boolean; disabled?: boolean }>
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	let page = 1;
	let fetched = 0;
	let total = Infinity;
	let paginationWorked = false;

	while (fetched < total) {
		const res = await fetch(
			`${HUMANITIX_BASE}/events/${eventId}/dates?page=${page}&pageSize=100`,
			{ headers: { 'x-api-key': apiKey } }
		);
		if (!res.ok) {
			if (page === 1) {
				console.log(`[fetch-tickets] Humanitix /dates endpoint unavailable for ${eventId} (${res.status}), falling back to event.dates`);
			}
			break;
		}
		const data = await res.json();
		paginationWorked = true;
		total = data.total ?? 0;
		const dates: Array<{ _id: string; startDate: string; deleted?: boolean; disabled?: boolean }> = data.dates ?? [];
		if (!dates.length) break;

		for (const d of dates) {
			if (d.deleted || d.disabled) continue;
			result.set(toMelbourneDate(d.startDate), d._id);
		}

		fetched += dates.length;
		page++;
	}

	if (!paginationWorked) {
		// Endpoint not available — use what came back in the event object
		for (const d of fallbackDates) {
			if (d.deleted || d.disabled) continue;
			result.set(toMelbourneDate(d.startDate), d._id);
		}
	} else {
		console.log(`[fetch-tickets] Humanitix dateMap for ${eventId}: ${result.size} dates`);
	}

	return result;
}

// Fetch ALL tickets for a Humanitix event (no date filter — the API's eventDateId query param
// doesn't work; it returns 0 results). Returns a map of eventDateId → valid ticket list.
// Max pageSize is 100 — anything higher returns HTTP 400.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllHumanitixTickets(eventId: string, apiKey: string): Promise<Map<string, any[]>> {
	const byDate = new Map<string, any[]>();
	let page = 1;
	let fetched = 0;
	let total = Infinity;

	while (fetched < total) {
		const res = await fetch(
			`${HUMANITIX_BASE}/events/${eventId}/tickets?page=${page}&pageSize=100`,
			{ headers: { 'x-api-key': apiKey } }
		);
		if (!res.ok) {
			console.error(`Humanitix tickets fetch failed for ${eventId}: ${res.status}`);
			break;
		}
		const data = await res.json();
		total = data.total ?? 0;
		const tickets = data.tickets ?? [];
		if (!tickets.length) break;

		for (const t of tickets) {
			const invalidStatus = t.status === 'cancelled' || t.status === 'refunded' ||
				t.status === 'awaiting_payment' || t.status === 'voided' || t.status === 'expired';
			if (invalidStatus || t.isDonation) continue;
			const dateId = t.eventDateId as string | undefined;
			if (!dateId) continue;
			const arr = byDate.get(dateId) ?? [];
			arr.push(t);
			byDate.set(dateId, arr);
		}

		fetched += tickets.length;
		page++;
	}

	return byDate;
}

// Build TicketData for a specific date using pre-fetched event metadata, ticket map, and date map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHumanitixData(event: Record<string, any>, targetDate: string, ticketsByDate: Map<string, any[]>, dateMap: Map<string, string>): TicketData | null {
	const dateId = dateMap.get(targetDate);
	if (!dateId) return null;

	const capacityMap: Record<string, { name: string; capacity: number; price: number }> = {};
	for (const t of event.ticketTypes ?? []) {
		if (t.deleted || t.isDonation) continue;
		capacityMap[t._id] = { name: t.name, capacity: t.quantity ?? 0, price: t.price ?? 0 };
	}

	const soldMap: Record<string, number> = {};
	for (const t of ticketsByDate.get(dateId) ?? []) {
		soldMap[t.ticketTypeId] = (soldMap[t.ticketTypeId] ?? 0) + 1;
	}

	const ticketTypes: TicketType[] = Object.entries(capacityMap).map(([id, info]) => ({
		id,
		name: info.name,
		sold: soldMap[id] ?? 0,
		capacity: info.capacity,
		price: info.price
	}));

	const totalSold = Object.values(soldMap).reduce((a, b) => a + b, 0);
	const totalCapacity = Object.values(capacityMap).reduce((a, b) => a + b.capacity, 0);

	return { date_id: dateId, total_sold: totalSold, total_capacity: totalCapacity, ticket_types: ticketTypes };
}

// Build TicketData from an Eventbrite ticket_classes array.
// Skip donation and hidden ticket types.
function ticketDataFromEbClasses(eventId: string, ticketClasses: EbTicketClass[]): TicketData {
	const ticketTypes: TicketType[] = [];
	for (const tc of ticketClasses) {
		if (tc.donation || tc.hidden) continue;
		ticketTypes.push({
			id: tc.id,
			name: tc.name,
			sold: tc.quantity_sold ?? 0,
			capacity: tc.quantity_total ?? 0,
			price: tc.cost ? (tc.cost.value ?? 0) / 100 : 0
		});
	}
	const totalSold = ticketTypes.reduce((a, t) => a + t.sold, 0);
	const totalCapacity = ticketTypes.reduce((a, t) => a + t.capacity, 0);
	return { date_id: eventId, total_sold: totalSold, total_capacity: totalCapacity, ticket_types: ticketTypes };
}

// For series events: fetch all occurrences and return a Melbourne-date → occurrence map.
// Uses expand=ticket_classes so we get sold counts in one call per page.
async function fetchEbSeriesOccurrences(seriesId: string, token: string): Promise<Map<string, EbOccurrence>> {
	const result = new Map<string, EbOccurrence>();
	let continuation = '';

	while (true) {
		const url = `${EVENTBRITE_BASE}/series/${seriesId}/events/?page_size=50&expand=ticket_classes${continuation ? `&continuation=${continuation}` : ''}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		if (!res.ok) {
			console.error(`Eventbrite series fetch failed for ${seriesId}: ${res.status}`);
			break;
		}
		const data = await res.json();

		for (const ev of data.events ?? []) {
			const evDate = ev.start?.utc ? toMelbourneDate(ev.start.utc) : null;
			if (evDate) result.set(evDate, { id: ev.id, ticketClasses: ev.ticket_classes ?? [] });
		}

		const pg = data.pagination ?? {};
		if (!pg.has_more_items) break;
		continuation = pg.continuation ?? '';
		if (!continuation) break;
	}

	return result;
}

// Fetch Eventbrite ticket data for a specific date.
// Pass seriesOccurrences (pre-fetched) to avoid redundant API calls per date on series events.
async function fetchEventbriteTickets(
	eventId: string,
	token: string,
	targetDate: string,
	seriesOccurrences?: Map<string, EbOccurrence>
): Promise<TicketData | null> {
	// If pre-fetched series map is available, use it directly — no extra API call needed
	if (seriesOccurrences) {
		const occ = seriesOccurrences.get(targetDate);
		return occ ? ticketDataFromEbClasses(occ.id, occ.ticketClasses) : null;
	}

	// Fetch the event to check if it's a series parent or single event
	const eventRes = await fetch(`${EVENTBRITE_BASE}/events/${eventId}/`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!eventRes.ok) {
		console.error(`Eventbrite event fetch failed for ${eventId}: ${eventRes.status}`);
		return null;
	}
	const event = await eventRes.json();

	if (event.is_series_parent) {
		// Fallback path — should not reach here if pre-fetched correctly
		const occurrences = await fetchEbSeriesOccurrences(eventId, token);
		const occ = occurrences.get(targetDate);
		return occ ? ticketDataFromEbClasses(occ.id, occ.ticketClasses) : null;
	}

	// Single event — always use UTC for date conversion
	const eventDate = event.start?.utc ? toMelbourneDate(event.start.utc) : null;
	if (eventDate && eventDate !== targetDate) return null;

	// ticket_classes already includes quantity_sold — no attendee pagination needed
	const tcRes = await fetch(`${EVENTBRITE_BASE}/events/${eventId}/ticket_classes/`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!tcRes.ok) {
		console.error(`Eventbrite ticket_classes fetch failed for ${eventId}: ${tcRes.status}`);
		return null;
	}
	const tcData = await tcRes.json();
	return ticketDataFromEbClasses(eventId, tcData.ticket_classes ?? []);
}

Deno.serve(async (req) => {
	const reqUrl = new URL(req.url);
	const backfill = reqUrl.searchParams.get('backfill') === '1';
	const lookbackDays = backfill ? 180 : 0;

	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const humanitixKey = Deno.env.get('HUMANITIX_API_KEY');
	const eventbriteToken = Deno.env.get('EVENTBRITE_TOKEN');
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	const hour = getMelbourneHour();
	if (!backfill && hour >= 0 && hour < 6) {
		console.log(`[fetch-tickets] Quiet hours (${hour}:xx Melbourne), skipping`);
		return new Response('ok: quiet hours', { status: 200 });
	}

	if (backfill) {
		console.log('[fetch-tickets] Running in backfill mode — 180-day lookback, throttle bypassed');
	}

	// Load all active shows
	const { data: shows, error: showsError } = await supabase
		.from('shows')
		.select('id, account_id, name, humanitix_event_id, eventbrite_event_id')
		.eq('is_active', true);

	if (showsError) {
		console.error('[fetch-tickets] Failed to load shows:', showsError);
		return new Response('error', { status: 500 });
	}
	if (!shows?.length) {
		return new Response('ok: no active shows', { status: 200 });
	}

	const today = todayMelbourne();
	const showIds = shows.map((s: Show) => s.id);

	// Load latest snapshot fetched_at per (show_id, show_date) for the relevant window
	const pastBound = lookbackDays > 0
		? new Date(new Date(today).getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10)
		: today;
	const futureBound = new Date(new Date(today).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

	const { data: snapshots } = await supabase
		.from('ticket_snapshots')
		.select('show_id, show_date, fetched_at')
		.in('show_id', showIds)
		.gte('show_date', pastBound)
		.lte('show_date', futureBound);

	const snapshotMap = new Map<string, string>();
	for (const s of snapshots ?? []) {
		snapshotMap.set(`${s.show_id}::${s.show_date}`, s.fetched_at);
	}

	let fetched = 0;
	let skipped = 0;

	for (const show of shows as Show[]) {
		if (!show.humanitix_event_id && !show.eventbrite_event_id) continue;

		let datesToFetch: string[] = [];
		let ebSeriesOccurrences: Map<string, EbOccurrence> | undefined;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let humanitixEvent: Record<string, any> | undefined;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let humanitixTickets: Map<string, any[]> | undefined;
		let humanitixDateMap: Map<string, string> | undefined; // melbDate → eventDateId

		// Step 1: Determine dates to fetch — Humanitix is source of truth when present.
		// Fetch event metadata and ALL tickets once (API doesn't support per-date filtering).
		// Also paginate the dates endpoint to get the full history (event.dates only has upcoming).
		if (show.humanitix_event_id && humanitixKey) {
			try {
				const eventRes = await fetch(`${HUMANITIX_BASE}/events/${show.humanitix_event_id}`, {
					headers: { 'x-api-key': humanitixKey }
				});
				if (eventRes.ok) {
					humanitixEvent = await eventRes.json();
					humanitixDateMap = await fetchHumanitixDateMap(
						show.humanitix_event_id,
						humanitixKey,
						humanitixEvent!.dates ?? []
					);
					// Build datesToFetch from the full date map, filtered to the relevant window
					const todayDate = new Date(today + 'T00:00:00');
					const pastBoundDate = lookbackDays > 0
						? new Date(todayDate.getTime() - lookbackDays * 86_400_000)
						: todayDate;
					const futureBoundDate = new Date(todayDate.getTime() + 30 * 86_400_000);
					datesToFetch = [...humanitixDateMap.keys()].filter((d) => {
						const dt = new Date(d + 'T00:00:00');
						return dt >= pastBoundDate && dt <= futureBoundDate;
					});
					humanitixTickets = await fetchAllHumanitixTickets(show.humanitix_event_id, humanitixKey);
				}
			} catch (e) {
				console.error(`[fetch-tickets] Error fetching Humanitix data for ${show.humanitix_event_id}:`, e);
			}
		}

		// Step 2: Pre-check Eventbrite — needed to detect series events and for Eventbrite-only shows.
		// For series events, pre-fetches ALL occurrences (past + future) in one paginated call.
		if (show.eventbrite_event_id && eventbriteToken) {
			try {
				const eventRes = await fetch(`${EVENTBRITE_BASE}/events/${show.eventbrite_event_id}/`, {
					headers: { Authorization: `Bearer ${eventbriteToken}` }
				});
				if (eventRes.ok) {
					const event = await eventRes.json();

					if (event.is_series_parent) {
						// Pre-fetch all series occurrences once — used for every date in this show's loop
						ebSeriesOccurrences = await fetchEbSeriesOccurrences(show.eventbrite_event_id, eventbriteToken);

						if (!show.humanitix_event_id) {
							// Eventbrite-only series: use the occurrence dates within the window
							const todayDate = new Date(today + 'T00:00:00');
							const startBound = lookbackDays > 0
								? new Date(todayDate.getTime() - lookbackDays * 86_400_000)
								: todayDate;
							const windowEnd = new Date(todayDate.getTime() + 30 * 86_400_000);
							datesToFetch = [...ebSeriesOccurrences.keys()].filter((d) => {
								const dt = new Date(d + 'T00:00:00');
								return dt >= startBound && dt <= windowEnd;
							});
						}
					} else if (!show.humanitix_event_id) {
						// Single Eventbrite event, Eventbrite-only show
						// Only fetch present/future in normal mode; all in backfill mode
						const eventDate = event.start?.utc ? toMelbourneDate(event.start.utc) : null;
						if (eventDate) {
							const todayDate = new Date(today + 'T00:00:00');
							const startBound = lookbackDays > 0
								? new Date(todayDate.getTime() - lookbackDays * 86_400_000)
								: todayDate;
							const windowEnd = new Date(todayDate.getTime() + 30 * 86_400_000);
							const dt = new Date(eventDate + 'T00:00:00');
							if (dt >= startBound && dt <= windowEnd) datesToFetch = [eventDate];
						}
					}
				}
			} catch (e) {
				console.error(`[fetch-tickets] Error fetching Eventbrite event ${show.eventbrite_event_id}:`, e);
			}
		}

		// Step 3: Fetch data for each date and upsert snapshot
		for (const showDate of datesToFetch) {
			const key = `${show.id}::${showDate}`;
			const lastFetched = snapshotMap.get(key) ?? null;

			if (!backfill && !shouldFetch(hour, lastFetched)) {
				skipped++;
				continue;
			}

			let humanitixData: TicketData | null = null;
			let eventbriteData: TicketData | null = null;

			if (humanitixEvent && humanitixTickets && humanitixDateMap) {
				try {
					humanitixData = buildHumanitixData(humanitixEvent, showDate, humanitixTickets, humanitixDateMap);
				} catch (e) {
					console.error(`[fetch-tickets] Humanitix error for show ${show.name} on ${showDate}:`, e);
				}
			}

			// In normal mode: skip Eventbrite for past dates — counts are final and we don't want to
			// overwrite previously stored good Eventbrite data with null.
			// In backfill mode: fetch Eventbrite for all dates (series occurrences are already pre-fetched).
			const fetchEb = show.eventbrite_event_id && eventbriteToken && (showDate >= today || backfill);
			if (fetchEb) {
				try {
					eventbriteData = await fetchEventbriteTickets(
						show.eventbrite_event_id!,
						eventbriteToken!,
						showDate,
						ebSeriesOccurrences
					);
				} catch (e) {
					console.error(`[fetch-tickets] Eventbrite error for show ${show.name} on ${showDate}:`, e);
				}
			}

			if (!humanitixData && !eventbriteData) continue;

			// Sum sold and capacity — each platform has its own allocation of seats
			const totalSold = (humanitixData?.total_sold ?? 0) + (eventbriteData?.total_sold ?? 0);
			const totalCapacity = (humanitixData?.total_capacity ?? 0) + (eventbriteData?.total_capacity ?? 0);

			// Only include eventbrite_data in the upsert when we actually fetched it.
			// Excluding it on past-date upserts preserves existing stored Eventbrite data.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const payload: Record<string, any> = {
				show_id: show.id,
				show_date: showDate,
				total_sold: totalSold,
				total_capacity: totalCapacity,
				humanitix_data: humanitixData ?? null,
				fetched_at: new Date().toISOString()
			};
			if (fetchEb) {
				payload.eventbrite_data = eventbriteData ?? null;
			}

			const { error: upsertError } = await supabase
				.from('ticket_snapshots')
				.upsert(payload, { onConflict: 'show_id,show_date', ignoreDuplicates: false });

			if (upsertError) {
				console.error(`[fetch-tickets] Upsert error for show ${show.name} on ${showDate}:`, upsertError);
			} else {
				console.log(`[fetch-tickets] Updated ${show.name} on ${showDate}: ${totalSold}/${totalCapacity} sold`);
				fetched++;
				snapshotMap.set(key, new Date().toISOString());
			}
		}
	}

	return new Response(`ok: fetched=${fetched} skipped=${skipped}${backfill ? ' (backfill)' : ''}`, { status: 200 });
});
