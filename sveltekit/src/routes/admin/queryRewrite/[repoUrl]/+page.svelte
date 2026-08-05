<script lang="ts">
	import { tick } from 'svelte';
	import { marked } from 'marked';
	import type { PageData } from './$types';
	import { formatRagContext, getRagContextUrl, getRagMetadataJson } from '$lib/ragContext';
	import { resolve } from '$app/paths';

	export let data: PageData;

	type SearchResult = {
		id: string;
		dataFileId: string;
		chunkNr: number | null;
		content: string | null;
		similarity: number;
		embeddingModel: string | null;
		remoteUrl?: string;
		meta?: Record<string, unknown>;
	};

	type Interaction = {
		id: string;
		prompt: string;
		queries: string[];
		results: SearchResult[];
		answer: string;
		status: 'searching' | 'answering' | 'done' | 'error';
	};

	let interactions: Interaction[] = [];
	let promptInput = '';
	let searching = false;
	let generating = false;
	let errorMessage = '';
	let transcriptEl: HTMLElement | null = null;

	const renderMarkdown = (md?: string) => (md ? marked.parse(md) : '');
	const contextString = (results: SearchResult[]) => formatRagContext(results);
	const metadataJsonString = (result: SearchResult) => JSON.stringify(getRagMetadataJson(result));

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		errorMessage = '';

		const prompt = promptInput.trim();
		if (!prompt) {
			errorMessage = 'Please enter a prompt.';
			return;
		}
		promptInput = '';
		searching = true;
		generating = false;

		const newInteraction: Interaction = {
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			prompt,
			queries: [],
			results: [],
			answer: '',
			status: 'searching'
		};
		interactions = [...interactions, newInteraction];
		const currentIdx = interactions.length - 1;
		await tick();
		transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight, behavior: 'smooth' });

		let results: SearchResult[] = [];
		let queries: string[] = [];
		try {
			const priorHistory = interactions.slice(0, currentIdx).flatMap((item) => [
				{ role: 'user', content: item.prompt },
				{ role: 'assistant', content: item.answer }
			]);
			const res = await fetch(resolve('/api/rag/search'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repoUrl: data.repository.url,
					query: prompt,
					history: priorHistory,
					// Force rewrite so admins can test even before enabling it on the repo.
					rewrite: true
				})
			});
			const payload = await res.json();
			if (!res.ok || payload?.success === false) {
				throw new Error(payload?.message ?? 'Search failed');
			}
			results = payload?.results ?? [];
			queries = Array.isArray(payload?.queries) ? payload.queries : [];
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			interactions = interactions.map((item, idx) =>
				idx === currentIdx ? { ...item, status: 'error' } : item
			);
			searching = false;
			return;
		}

		interactions = interactions.map((item, idx) =>
			idx === currentIdx ? { ...item, results, queries, status: 'answering' } : item
		);
		searching = false;
		generating = true;
		await tick();
		transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight, behavior: 'smooth' });

		try {
			const history = interactions.slice(0, currentIdx).flatMap((item) => [
				{ role: 'user', content: item.prompt },
				{ role: 'assistant', content: item.answer }
			]);
			const res = await fetch(resolve('/api/chat/llm'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					context: contextString(results),
					history,
					repositoryUrl: data.repository.url
				})
			});

			if (!res.ok || !res.body) {
				throw new Error('LLM request failed');
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let answer = '';
			let done = false;
			while (!done) {
				const chunk = await reader.read();
				done = chunk.done;
				const text = decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
				if (text) {
					answer += text;
					interactions = interactions.map((item, idx) =>
						idx === currentIdx ? { ...item, answer } : item
					);
				}
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'LLM request failed';
			interactions = interactions.map((item, idx) =>
				idx === currentIdx ? { ...item, status: 'error' } : item
			);
			generating = false;
			return;
		}

		interactions = interactions.map((item, idx) =>
			idx === currentIdx ? { ...item, status: 'done' } : item
		);
		generating = false;
		await tick();
		transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight, behavior: 'smooth' });
	};
</script>

<section class="page">
	<header class="header">
		<a class="link" href={resolve('/admin/queryRewrite')}>← Repositories</a>
		<h1>Query Rewrite · {data.repository.name}</h1>
		<p class="muted">{data.repository.url}</p>
	</header>

	<section class="config-panel">
		<h2>Configuration</h2>
		{#if !data.rewrite.enabled}
			<p class="notice">
				Query rewrite is currently <strong>disabled</strong> for this repository. This view forces it
				on so you can test it, but the live chat views will not rewrite until you enable it in the
				repository settings.
			</p>
		{/if}
		<div class="config-grid">
			<div><span class="label">Model</span>{data.rewrite.model || 'default chat model'}</div>
			<div><span class="label">Searches</span>{data.rewrite.count}</div>
			<div><span class="label">Docs / search</span>{data.rewrite.docsPerSearch}</div>
			<div>
				<span class="label">Include history</span>{data.rewrite.includeHistory ? 'yes' : 'no'}
			</div>
			<div>
				<span class="label">API language</span>{data.rewrite.apiLanguage || 'default (chat)'}
			</div>
			<div>
				<span class="label">Reasoning effort</span>{data.rewrite.reasoningEffort || 'default (chat)'}
			</div>
			<div>
				<span class="label">Text verbosity</span>{data.rewrite.textVerbosity || 'default (chat)'}
			</div>
		</div>
		{#if data.rewrite.context}
			<div class="context-line">
				<span class="label">Context</span>{data.rewrite.context}
			</div>
		{/if}
	</section>

	<section class="transcript" bind:this={transcriptEl}>
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
		{#if interactions.length === 0}
			<p class="muted">Send a prompt below to see the rewritten searches and retrieved context.</p>
		{:else}
			{#each interactions as item}
				<article class="interaction">
					<div class="prompt-row">
						<span class="label">PROMPT</span>
						<div class="bubble user">{item.prompt}</div>
					</div>

					<div class="searches-row">
						<span class="label">GENERATED SEARCHES</span>
						{#if item.status === 'searching'}
							<span class="muted">Rewriting query…</span>
						{:else if item.queries.length === 0}
							<span class="muted">No queries.</span>
						{:else}
							<div class="search-bubbles">
								{#each item.queries as q}
									<span class="search-chip">🔍 Suche: {q}</span>
								{/each}
							</div>
						{/if}
					</div>

					<div class="context-row">
						<span class="label">MERGED CONTEXT ({item.results.length})</span>
						<div class="bubble">
							{#if item.status === 'searching'}
								<span class="muted">Searching…</span>
							{:else if item.results.length === 0}
								<span class="muted">No context found.</span>
							{:else}
								{#each item.results as result, rIdx}
									URL:
									{#if getRagContextUrl(result) !== '—'}
										<a class="link" href={getRagContextUrl(result)} target="_blank" rel="noreferrer">
											{getRagContextUrl(result)}
										</a>
									{:else}
										<span>—</span>
									{/if}
									<br />
									similarity: {result.similarity.toFixed(4)}
									<br />
									METADATA_JSON:
									<br />
									{metadataJsonString(result)}
									<br />
									CONTENT:
									<br />
									{result.content ?? '—'}
									{#if rIdx !== item.results.length - 1}
										<br /><br />
									{/if}
								{/each}
							{/if}
						</div>
					</div>

					<div class="answer-row">
						<span class="label">AI ANSWER</span>
						<div class="bubble" class:loading={item.status === 'answering'}>
							{#if item.status === 'searching'}
								<span class="muted">Waiting for context…</span>
							{:else if item.status === 'answering' && !item.answer}
								<span class="muted">Loading…</span>
							{:else}
								{@html renderMarkdown(item.answer || '—')}
							{/if}
						</div>
					</div>
				</article>
			{/each}
		{/if}
	</section>
</section>

<form class="prompt-bar" on:submit|preventDefault={handleSubmit}>
	<input
		type="text"
		name="query"
		placeholder="Ask a question to test query rewrite..."
		required
		autocomplete="off"
		bind:value={promptInput}
	/>
	<button type="submit" disabled={searching || generating}>
		{searching ? 'Searching…' : generating ? 'Generating…' : 'Send'}
	</button>
</form>

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		display: grid;
		gap: 1rem;
		padding: 1rem 1rem 5rem;
	}

	.header h1 {
		margin: 0.25rem 0;
	}

	.link {
		color: #1f7ae0;
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.muted {
		color: #666;
		margin: 0;
	}

	.config-panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.config-panel h2 {
		margin: 0;
	}

	.config-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.config-grid div {
		display: grid;
		gap: 0.2rem;
	}

	.context-line {
		display: grid;
		gap: 0.2rem;
	}

	.notice {
		margin: 0;
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		background: #fff6e6;
		border: 1px solid #f2d79b;
		color: #7a5300;
	}

	.transcript {
		display: grid;
		gap: 1rem;
		max-height: 62vh;
		overflow-y: auto;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.interaction {
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem;
		border: 1px solid #e7ebf1;
		border-radius: 8px;
		background: white;
	}

	.prompt-row,
	.searches-row,
	.context-row,
	.answer-row {
		display: grid;
		gap: 0.35rem;
	}

	.label {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: #2f3b52;
	}

	.bubble {
		background: white;
		border: 1px solid #dfe6f0;
		border-radius: 6px;
		padding: 0.65rem;
		font-size: 0.95rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}

	.bubble.user {
		background: #eef4ff;
		border-color: #cdddfc;
	}

	.bubble.loading {
		opacity: 0.85;
	}

	.search-bubbles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.search-chip {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: #eaf2fd;
		border: 1px solid #cdddfc;
		color: #1f5fb0;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.error {
		color: #8a1c1c;
		margin: 0;
	}

	.prompt-bar {
		position: sticky;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: white;
		border-top: 1px solid #e3e3e3;
		box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.06);
	}

	.prompt-bar input {
		width: 100%;
		padding: 0.65rem 0.75rem;
		border-radius: 6px;
		border: 1px solid #cfd6e0;
		font-size: 1rem;
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

	@media (max-width: 900px) {
		.config-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
