<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let prompt = '';
	let answer = '';
	let loading = false;
	let errorMessage = '';

	const send = async () => {
		if (!prompt.trim()) {
			errorMessage = 'Please enter a prompt.';
			return;
		}

		errorMessage = '';
		answer = '';
		loading = true;

		try {
			const res = await fetch(`/api/chat/${encodeURIComponent(data.repository.url)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt })
			});

			const body = await res.json();

			if (!res.ok || body?.success === false) {
				throw new Error(body?.message ?? 'Request failed');
			}

			answer = body?.answer ?? '';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Request failed';
		} finally {
			loading = false;
		}
	};
</script>

<section class="page">
	<h1>Simple Chat · {data.repository.name}</h1>
	<p class="muted">Repository: {data.repository.url}</p>

	<div class="card">
		<label>
			Prompt
			<textarea
				bind:value={prompt}
				placeholder="Ask your question..."
				rows="4"
				on:keydown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						send();
					}
				}}
			></textarea>
		</label>
		<div class="actions">
			<button on:click={send} disabled={loading}>{loading ? 'Sending…' : 'Send'}</button>
			{#if errorMessage}
				<span class="error">{errorMessage}</span>
			{/if}
		</div>
	</div>

	{#if answer}
		<div class="card answer">
			<h2>Answer</h2>
			<pre>{answer}</pre>
		</div>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
	}

	.muted {
		color: #666;
	}

	.card {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem;
		display: grid;
		gap: 0.5rem;
		background: #fafafa;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-weight: 600;
	}

	textarea {
		width: 100%;
		border: 1px solid #cfd6e0;
		border-radius: 6px;
		padding: 0.5rem;
		font-family: inherit;
		font-size: 1rem;
		min-height: 120px;
		resize: vertical;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	button {
		padding: 0.55rem 0.95rem;
		border-radius: 6px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
		min-width: 110px;
	}

	.error {
		color: #8a1c1c;
		font-size: 0.95rem;
	}

	.answer pre {
		margin: 0;
		background: white;
		border: 1px solid #e3e3e3;
		border-radius: 6px;
		padding: 0.65rem;
		white-space: pre-wrap;
	}
</style>
