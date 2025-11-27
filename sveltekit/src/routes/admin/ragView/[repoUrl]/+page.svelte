<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let searching = false;
	let generating = false;
	let aiAnswer = '';
	let errorMessage = '';

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

	const initialResults =
		form && typeof form === 'object' && 'results' in form
			? (form as { results?: SearchResult[] }).results
			: [];
	let currentResults: SearchResult[] = initialResults ?? [];
	let lastQuery =
		form && typeof form === 'object' && 'query' in form
			? (form as { query?: string }).query
			: undefined;
	let promptInput = '';

	const metaValue = (result: SearchResult, key: string) => {
		const meta = (result.meta ?? {}) as Record<string, unknown>;
		const value = meta[key];
		return typeof value === 'string' ? value : undefined;
	};

	const contextString = (results: SearchResult[]) =>
		results
			.map((result) => {
				const url = metaValue(result, 'url') ?? result.remoteUrl ?? '—';
				return `CONTENT:\n${result.content ?? '—'}\nURL: ${url}`;
			})
			.join('\n\n');

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		errorMessage = '';
		aiAnswer = '';
		generating = false;
		searching = true;

		const formEl = event.currentTarget as HTMLFormElement;
		const formData = new FormData(formEl);
		const prompt = (formData.get('query') as string)?.trim();

		if (!prompt) {
			errorMessage = 'Please enter a prompt.';
			searching = false;
			return;
		}

		lastQuery = prompt;

		try {
			const res = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repoUrl: data.repository.url,
					query: prompt
				})
			});
			const payload = await res.json();

			if (!res.ok || payload?.success === false) {
				throw new Error(payload?.message ?? 'Search failed');
			}
			currentResults = payload?.results ?? [];
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			searching = false;
			return;
		}

		searching = false;
		generating = true;

		try {
			const res = await fetch('/api/chat/llm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					context: contextString(currentResults)
				})
			});

			if (!res.ok || !res.body) {
				throw new Error('LLM request failed');
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let done = false;
			while (!done) {
				const chunk = await reader.read();
				done = chunk.done;
				const text = decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
				if (text) {
					aiAnswer += text;
				}
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'LLM request failed';
		} finally {
			generating = false;
		}
	};
</script>

<section class="page">
	<header class="header">
		<div>
			<a class="link" href="/admin/ragView">← Repositories</a>
			<h1>RAG view · {data.repository.name}</h1>
			<p class="muted">URL: {data.repository.url}</p>
		</div>
	</header>

	<!-- <section class="repo-list">
		<h2>Active repositories</h2>
		{#if data.repositories.length === 0}
			<p class="muted">No repositories found.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>URL</th>
						<th>Files</th>
						<th>Chunks</th>
					</tr>
				</thead>
				<tbody>
					{#each data.repositories as repo}
						<tr class={repo.url === data.repository.url ? 'current' : ''}>
							<td>
								<a class="link" href={`/admin/ragView/${encodeURIComponent(repo.url)}`}>
									{repo.name}
								</a>
							</td>
							<td class="muted">{repo.url}</td>
							<td class="number">{repo.fileCount}</td>
							<td class="number">{repo.chunkCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section> -->

	<section class="context-panel">
		<h2>Context</h2>
		<div class="context-scroll single-block">
			{#if errorMessage}
				<p class="error">{errorMessage}</p>
			{/if}
			{#if currentResults.length === 0 && !lastQuery}
				<p class="muted">Send a prompt below to fetch context from the database.</p>
			{:else if currentResults.length === 0}
				<p class="muted">No context found for this prompt.</p>
			{:else}
				{#if lastQuery}
					<p class="label">PROMPT: {lastQuery}</p>
					<br />
				{/if}
        <span class="label">CONTEXT FROM DATABASE</span><br />
				{#each currentResults as result, idx}
					{result.content ?? '—'}<br />
					URL:
					{#if metaValue(result, 'url')}
						<a
							class="link"
							href={metaValue(result, 'url')}
							target="_blank"
							rel="noreferrer"
						>
							{metaValue(result, 'url')}
						</a>
					{:else if result.remoteUrl}
						<a class="link" href={result.remoteUrl} target="_blank" rel="noreferrer">
							{result.remoteUrl}
						</a>
					{:else}
						<span>—</span>
					{/if}
					{#if idx !== currentResults.length - 1}
						<br /><br />
					{/if}
				{/each}
				{#if aiAnswer}
					<br /><br />
					<span class="label">AI ANSWER</span><br />
					{aiAnswer}
				{:else if generating}
					<br />
					<p class="muted">Generating answer…</p>
				{/if}
			{/if}
		</div>
	</section>
</section>

<form
	class="prompt-bar"
	on:submit|preventDefault={handleSubmit}
>
	<input
		type="text"
		name="query"
		placeholder="Ask for context..."
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

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		border-bottom: 1px solid #e3e3e3;
		padding: 0.6rem 0.4rem;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-weight: 600;
		color: #333;
	}

	tr.current {
		background: #f0f6ff;
	}

	.number {
		text-align: right;
	}

	.context-panel {
		display: grid;
		gap: 0.5rem;
	}

	.context-scroll {
		max-height: 55vh;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem;
		overflow-y: auto;
		background: #fafafa;
		display: block;
		white-space: pre-wrap;
	}

	.context-scroll.single-block {
		font-size: 0.95rem;
		line-height: 1.45;
	}

	.label {
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		margin: 0;
		color: #2f3b52;
	}

	.error {
		color: #8a1c1c;
		margin: 0 0 0.35rem;
	}

	.prompt-bar {
		position: fixed;
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
</style>
