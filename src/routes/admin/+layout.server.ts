import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');
	if (!profile.isAdmin) redirect(303, '/dashboard');
};
