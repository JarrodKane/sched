<script lang="ts">
	import { page } from '$app/state';
	import './layout.css';

	let { data, children } = $props();

	let theme = $state('bumblebee');

	$effect(() => {
		const saved = localStorage.getItem('ig-theme');
		if (saved === 'abyss' || saved === 'bumblebee') theme = saved;
	});

	$effect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('ig-theme', theme);
	});

	function toggleTheme() {
		theme = theme === 'bumblebee' ? 'abyss' : 'bumblebee';
	}

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

{#if data.session && data.profile}
	<div class="navbar bg-base-100 border-b border-base-300 px-4 shadow-sm">
		<div class="navbar-start gap-2">
			<a href="/dashboard" class="flex items-center gap-2 px-1">
				<span class="text-primary font-black text-xl leading-none">●</span>
				<span class="font-bold text-sm">IG Scheduler</span>
			</a>
			<ul class="menu menu-horizontal menu-sm px-0">
				<li>
					<a href="/dashboard" class={isActive('/dashboard') ? 'menu-active' : ''}>Dashboard</a>
				</li>
				{#if data.profile.isAdmin}
					<li>
						<a href="/admin/accounts" class={isActive('/admin/accounts') ? 'menu-active' : ''}>Accounts</a>
					</li>
					<li>
						<a href="/admin/users" class={isActive('/admin/users') ? 'menu-active' : ''}>Users</a>
					</li>
				{/if}
			</ul>
		</div>
		<div class="navbar-end gap-2">
			<span class="text-sm text-base-content/50 hidden sm:inline">{data.profile.name}</span>
			<button
				type="button"
				onclick={toggleTheme}
				class="btn btn-ghost btn-sm btn-square"
				title="Toggle theme"
				aria-label="Toggle theme"
			>
				{#if theme === 'abyss'}
					<!-- sun -->
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					</svg>
				{:else}
					<!-- moon -->
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
					</svg>
				{/if}
			</button>
			<form method="POST" action="/login?/logout">
				<button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
			</form>
		</div>
	</div>
{/if}

<main class="min-h-screen bg-base-200">
	<div class="mx-auto max-w-6xl px-4 py-8">
		{@render children()}
	</div>
</main>
