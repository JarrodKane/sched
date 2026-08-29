<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>Sign in — IG Scheduler</title></svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
	<div class="card bg-base-100 w-full max-w-sm shadow-xl">
		<div class="card-body gap-5">
			<div class="flex items-center gap-2 mb-1">
					<span class="text-primary font-black text-2xl leading-none">●</span>
					<h1 class="card-title text-2xl">IG Scheduler</h1>
				</div>

			<form
				method="POST"
				action="?/login"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="flex flex-col gap-4"
			>
				{#if form?.error}
					<div role="alert" class="alert alert-error alert-soft text-sm">
						{form.error}
					</div>
				{/if}

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Email</legend>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="input w-full"
						placeholder="you@example.com"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Password</legend>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="input w-full"
					/>
				</fieldset>

				<button type="submit" disabled={loading} class="btn btn-primary btn-block mt-1">
					{#if loading}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					{loading ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		</div>
	</div>
</div>
