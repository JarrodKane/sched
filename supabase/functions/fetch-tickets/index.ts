// Supabase Edge Function — triggered by pg_cron every 5 minutes
// Fetches ticket data from Humanitix/Eventbrite for active shows and caches in ticket_snapshots.
// Uses Melbourne-time-aware polling: quiet midnight–6am, hourly off-peak, every 5 min at show time.

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

// Find event dates within ±7 days of today (prev week + this/next week)
function relevantDates(
	dates: Array<{ _id: string; startDate: string; deleted: boolean; disabled?: boolean }>,
	todayStr: string
): Array<{ id: string; date: string }> {
	const today = new Date(todayStr + 'T00:00:00');
	const past = new Date(today.getTime() - 7 * 86_400_000);
	const future = new Date(today.getTime() + 14 * 86_400_000);

	return dates
		.filter((d) => !d.deleted && !d.disabled)
		.map((d) => ({ id: d._id, date: toMelbourneDate(d.startDate) }))
		.filter((d) => {
			const dt = new Date(d.date + 'T00:00:00');
			return dt >= past && dt <= future;
		});
}

async function fetchHumanitixTickets(
	eventId: string,
	apiKey: string,
	targetDate: string
): Promise<TicketData | null> {
	// Get event metadata (dates + ticket type capacity)
	const eventRes = await fetch(`${HUMANITIX_BASE}/events/${eventId}`, {
		headers: { 'x-api-key': apiKey }
	});
	if (!eventRes.ok) {
		console.error(`Humanitix event fetch failed for ${eventId}: ${eventRes.status}`);
		return null;
	}
	const event = await eventRes.json();

	// Find the date entry for targetDate
	const dateEntry = (event.dates ?? []).find(
		(d: { _id: string; startDate: string; deleted: boolean; disabled?: boolean }) =>
			!d.deleted && !d.disabled && toMelbourneDate(d.startDate) === targetDate
	);
	if (!dateEntry) return null;

	// Build capacity map from ticket types (exclude donations, deleted, disabled)
	const capacityMap: Record<string, { name: string; capacity: number; price: number }> = {};
	for (const t of event.ticketTypes ?? []) {
		if (t.deleted || t.isDonation) continue;
		capacityMap[t._id] = { name: t.name, capacity: t.quantity ?? 0, price: t.price ?? 0 };
	}

	// Fetch all tickets for this date (paginate)
	const soldMap: Record<string, number> = {};
	let page = 1;
	let fetched = 0;
	let total = Infinity;

	while (fetched < total) {
		const res = await fetch(
			`${HUMANITIX_BASE}/events/${eventId}/tickets?eventDateId=${dateEntry._id}&page=${page}&pageSize=200`,
			{ headers: { 'x-api-key': apiKey } }
		);
		if (!res.ok) break;
		const data = await res.json();
		total = data.total ?? 0;
		const tickets = data.tickets ?? [];
		if (!tickets.length) break;

		for (const t of tickets) {
			if (t.status !== 'complete' || t.isDonation) continue;
			soldMap[t.ticketTypeId] = (soldMap[t.ticketTypeId] ?? 0) + 1;
		}
		fetched += tickets.length;
		page++;
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

	return { date_id: dateEntry._id, total_sold: totalSold, total_capacity: totalCapacity, ticket_types: ticketTypes };
}

async function fetchEventbriteTickets(
	eventId: string,
	token: string,
	targetDate: string
): Promise<TicketData | null> {
	// Get event details to confirm date
	const eventRes = await fetch(`${EVENTBRITE_BASE}/events/${eventId}/`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!eventRes.ok) {
		console.error(`Eventbrite event fetch failed for ${eventId}: ${eventRes.status}`);
		return null;
	}
	const event = await eventRes.json();

	// Check event date matches targetDate
	const eventDate = event.start?.local ? toMelbourneDate(event.start.utc ?? event.start.local) : null;
	if (eventDate && eventDate !== targetDate) return null;

	// Get ticket classes (capacity)
	const tcRes = await fetch(`${EVENTBRITE_BASE}/events/${eventId}/ticket_classes/`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	const tcData = tcRes.ok ? await tcRes.json() : { ticket_classes: [] };
	const capacityMap: Record<string, { name: string; capacity: number; price: number }> = {};
	for (const tc of tcData.ticket_classes ?? []) {
		capacityMap[tc.id] = {
			name: tc.name,
			capacity: tc.quantity_total ?? 0,
			price: tc.cost ? (tc.cost.value ?? 0) / 100 : 0
		};
	}

	// Get attendees (paginate)
	const soldMap: Record<string, number> = {};
	let continuation = '';
	while (true) {
		const url = `${EVENTBRITE_BASE}/events/${eventId}/attendees/?status=attending&page_size=200${continuation ? `&continuation=${continuation}` : ''}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		if (!res.ok) break;
		const data = await res.json();
		for (const a of data.attendees ?? []) {
			const tcId = a.ticket_class_id;
			soldMap[tcId] = (soldMap[tcId] ?? 0) + 1;
		}
		const pg = data.pagination ?? {};
		if (!pg.has_more_items) break;
		continuation = pg.continuation ?? '';
		if (!continuation) break;
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

	return { date_id: eventId, total_sold: totalSold, total_capacity: totalCapacity, ticket_types: ticketTypes };
}

Deno.serve(async () => {
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const humanitixKey = Deno.env.get('HUMANITIX_API_KEY');
	const eventbriteToken = Deno.env.get('EVENTBRITE_TOKEN');
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	const hour = getMelbourneHour();
	if (hour >= 0 && hour < 6) {
		console.log(`[fetch-tickets] Quiet hours (${hour}:xx Melbourne), skipping`);
		return new Response('ok: quiet hours', { status: 200 });
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
	const past = new Date(new Date(today).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
	const future = new Date(new Date(today).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

	const { data: snapshots } = await supabase
		.from('ticket_snapshots')
		.select('show_id, show_date, fetched_at')
		.in('show_id', showIds)
		.gte('show_date', past)
		.lte('show_date', future);

	const snapshotMap = new Map<string, string>();
	for (const s of snapshots ?? []) {
		snapshotMap.set(`${s.show_id}::${s.show_date}`, s.fetched_at);
	}

	let fetched = 0;
	let skipped = 0;

	for (const show of shows as Show[]) {
		// Determine dates to fetch from Humanitix (source of truth for dates)
		if (!show.humanitix_event_id && !show.eventbrite_event_id) continue;

		// Get relevant dates for this show from Humanitix event
		let datesToFetch: string[] = [];

		if (show.humanitix_event_id && humanitixKey) {
			try {
				const eventRes = await fetch(`${HUMANITIX_BASE}/events/${show.humanitix_event_id}`, {
					headers: { 'x-api-key': humanitixKey }
				});
				if (eventRes.ok) {
					const event = await eventRes.json();
					datesToFetch = relevantDates(event.dates ?? [], today).map((d) => d.date);
				}
			} catch (e) {
				console.error(`[fetch-tickets] Error fetching Humanitix event ${show.humanitix_event_id}:`, e);
			}
		} else if (show.eventbrite_event_id) {
			// For Eventbrite-only shows, use the event date
			datesToFetch = [today]; // simplified: just try today/nearby
		}

		for (const showDate of datesToFetch) {
			const key = `${show.id}::${showDate}`;
			const lastFetched = snapshotMap.get(key) ?? null;

			if (!shouldFetch(hour, lastFetched)) {
				skipped++;
				continue;
			}

			let humanitixData: TicketData | null = null;
			let eventbriteData: TicketData | null = null;

			if (show.humanitix_event_id && humanitixKey) {
				try {
					humanitixData = await fetchHumanitixTickets(show.humanitix_event_id, humanitixKey, showDate);
				} catch (e) {
					console.error(`[fetch-tickets] Humanitix error for show ${show.name} on ${showDate}:`, e);
				}
			}

			if (show.eventbrite_event_id && eventbriteToken) {
				try {
					eventbriteData = await fetchEventbriteTickets(show.eventbrite_event_id, eventbriteToken, showDate);
				} catch (e) {
					console.error(`[fetch-tickets] Eventbrite error for show ${show.name} on ${showDate}:`, e);
				}
			}

			if (!humanitixData && !eventbriteData) continue;

			const totalSold = (humanitixData?.total_sold ?? 0) + (eventbriteData?.total_sold ?? 0);
			const totalCapacity = Math.max(
				humanitixData?.total_capacity ?? 0,
				eventbriteData?.total_capacity ?? 0
			);

			const { error: upsertError } = await supabase
				.from('ticket_snapshots')
				.upsert(
					{
						show_id: show.id,
						show_date: showDate,
						total_sold: totalSold,
						total_capacity: totalCapacity,
						humanitix_data: humanitixData ?? null,
						eventbrite_data: eventbriteData ?? null,
						fetched_at: new Date().toISOString()
					},
					{ onConflict: 'show_id,show_date', ignoreDuplicates: false }
				);

			if (upsertError) {
				console.error(`[fetch-tickets] Upsert error for show ${show.name} on ${showDate}:`, upsertError);
			} else {
				console.log(`[fetch-tickets] Updated ${show.name} on ${showDate}: ${totalSold}/${totalCapacity} sold`);
				fetched++;
				snapshotMap.set(key, new Date().toISOString());
			}
		}
	}

	return new Response(`ok: fetched=${fetched} skipped=${skipped}`, { status: 200 });
});
