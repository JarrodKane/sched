import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

// Lazy-initialized so module import doesn't fail during build analysis
let _client: SupabaseClient | null = null;

// Service role client — never use client-side, only in server routes/actions
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
	get(_target, prop) {
		if (!_client) {
			const url = env.PUBLIC_SUPABASE_URL;
			const key = env.SUPABASE_SERVICE_ROLE_KEY;
			if (!url || !key) throw new Error('Supabase env vars not set');
			_client = createClient(url, key, {
				auth: { autoRefreshToken: false, persistSession: false }
			});
		}
		return _client[prop as keyof SupabaseClient];
	}
});
