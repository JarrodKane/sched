<!--
  +page.svelte — /login
  Login page. Renders a centred card with email and password fields. Tracks a
  loading state to disable the submit button and show a spinner while the
  Supabase Auth call is in flight.

  Svelte features:
    $state    — loading (true while the login action is in flight)
    $props()  — receives form (action result: { error? })
    use:enhance — intercepts submit: sets loading = true, then resets it in the
                  callback so the button re-enables if the login fails
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>Sign in — Sched</title></svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
	<div class="card bg-base-100 w-full max-w-sm shadow-xl">
		<div class="card-body gap-5">
			<div class="flex items-center gap-2 mb-1">
					<span class="text-primary font-black text-2xl leading-none">●</span>
					<h1 class="card-title text-2xl">Sched</h1>
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
						autocorrect="off"
						autocapitalize="off"
						spellcheck="false"
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
