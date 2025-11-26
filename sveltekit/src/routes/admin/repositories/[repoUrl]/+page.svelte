<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let searching = false;

	const searchResults =
		form && typeof form === 'object' && 'results' in form
			? (form as { results?: SearchResult[] }).results
			: undefined;

	type SearchResult = {
		id: string;
		dataFileId: string;
		chunkNr: number | null;
		content: string | null;
		similarity: number;
		embeddingModel: string | null;
	};
</script>

<section class="page">
	<div class="header">
		<a class="link" href="/admin/repositories">← Back to repositories</a>
		<h1>{data.repository.name}</h1>
		<p class="muted">URL: {data.repository.url}</p>
		<p>
			<a class="link" href={`/admin/repositories/${encodeURIComponent(data.repository.url)}/files`}>
				View files →
			</a>
		</p>
		{#if form?.message}
			<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
		{/if}
	</div>

	<section class="search">
		<form method="POST" action="?/search" class="search-form" on:submit={() => (searching = true)}>
			<label>
				Search chunks in this repository (vector similarity)
				<input type="text" name="query" placeholder="Ask a question or paste text" required />
			</label>
			<div class="actions">
				<button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
				{#if searching}
					<span class="loader" aria-live="polite">Working…</span>
				{/if}
			</div>
		</form>
		{#if searchResults}
			<div class="results">
				{#if searchResults.length === 0}
					<p class="muted">No results.</p>
				{:else}
					{#each searchResults as result}
						<article class="result">
							<div class="result-meta">
								<strong>Chunk {result.chunkNr ?? '-'}</strong>
								<span class="muted">DataFile: {result.dataFileId}</span>
								<span class="muted">Similarity: {(result.similarity * 100).toFixed(1)}%</span>
								{#if result.embeddingModel}
									<span class="muted">Model: {result.embeddingModel}</span>
								{/if}
							</div>
							<pre>{result.content ?? '—'}</pre>
						</article>
					{/each}
				{/if}
			</div>
		{/if}
	</section>
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
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

	.notice {
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
		margin: 0.25rem 0 0.5rem;
	}

	.notice.success {
		background: #e7f6ec;
		color: #1b6b3a;
		border: 1px solid #b7e0c2;
	}

	.notice.error {
		background: #fff0f0;
		color: #8a1c1c;
		border: 1px solid #f2c7c7;
	}

	.search {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.search-form {
		display: grid;
		gap: 0.5rem;
	}

	.search-form input {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font-size: 1rem;
	}

	button {
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.loader {
		color: #1f7ae0;
		font-size: 0.95rem;
	}

	.results {
		display: grid;
		gap: 0.75rem;
	}

	.result {
		border: 1px solid #e3e3e3;
		border-radius: 6px;
		padding: 0.65rem;
		background: white;
		display: grid;
		gap: 0.35rem;
	}

	.result-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: center;
	}

	pre {
		margin: 0;
		overflow: auto;
		font-size: 0.95rem;
		background: #f7f7f7;
		border-radius: 6px;
		padding: 0.65rem;
		border: 1px solid #e3e3e3;
	}
</style>
