function calendarDaysDiff(a: Date, b: Date): number {
	const midnight = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
	return Math.round((midnight(a).getTime() - midnight(b).getTime()) / 86_400_000);
}

export function relativeTimePast(date: string | Date): string {
	const d = new Date(date);
	const diff = Date.now() - d.getTime();
	if (diff < 60_000) return 'just now';
	const mins = Math.round(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = calendarDaysDiff(new Date(), d);
	if (days < 30) return `${days}d ago`;
	return d.toLocaleDateString();
}

export function relativeTimeFuture(date: string | Date): string {
	const d = new Date(date);
	const diff = d.getTime() - Date.now();
	const abs = Math.abs(diff);
	const past = diff < 0;
	if (abs < 60_000) return past ? 'just now' : 'in less than a minute';
	const mins = Math.round(abs / 60_000);
	if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;
	const hours = Math.floor(mins / 60);
	const remMins = mins % 60;
	if (hours < 24) return past ? `${hours}h ${remMins}m ago` : `in ${hours}h${remMins > 0 ? ` ${remMins}m` : ''}`;
	const days = past ? calendarDaysDiff(new Date(), d) : calendarDaysDiff(d, new Date());
	return past ? `${days}d ago` : `in ${days}d`;
}
