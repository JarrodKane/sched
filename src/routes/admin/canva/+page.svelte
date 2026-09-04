<title>Canva Integration</title>

<script lang="ts">
	let { data } = $props();
</script>

<div class="p-6 max-w-lg">
	<h1 class="text-2xl font-bold mb-1">Canva Integration</h1>
	<p class="text-base-content/60 mb-6">Connect your Canva account to enable promo image generation from lineups.</p>

	{#if data.justConnected}
		<div class="alert alert-success mb-4">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
			</svg>
			<span>Successfully connected to Canva!</span>
		</div>
	{:else if data.connected}
		<div class="alert alert-success mb-4">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
			</svg>
			<span>Connected to Canva — token refreshes automatically.</span>
		</div>
	{:else}
		<div class="alert alert-warning mb-4">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
			</svg>
			<span>Not connected — promo image generation won't work until you connect.</span>
		</div>
	{/if}

	<form method="POST" action="?/connect">
		<button type="submit" class="btn btn-primary">
			{data.connected ? 'Reconnect Canva' : 'Connect to Canva'}
		</button>
	</form>
</div>
