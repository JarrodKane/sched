import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

// Lazy-initialized so module import doesn't fail during build analysis
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (!_db) {
		const url = env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is not set');
		// prepare: false required for pgBouncer transaction mode (Supabase pooler)
		const client = postgres(url, { prepare: false });
		_db = drizzle(client, { schema });
	}
	return _db;
}

// Convenience re-export for callers that prefer direct import
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
	get(_target, prop) {
		return getDb()[prop as keyof ReturnType<typeof drizzle>];
	}
});
