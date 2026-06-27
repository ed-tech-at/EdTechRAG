<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

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

	let searching = false;
	$: if (form) {
		searching = false;
	}
	$: searchResults =
		form && typeof form === 'object' && 'results' in form
			? (form as { results?: SearchResult[] }).results
			: undefined;
	$: query =
		form && typeof form === 'object' && 'query' in form ? ((form as { query?: string }).query ?? '') : '';
	$: formMessage =
		form && typeof form === 'object' && 'message' in form ? ((form as { message?: string }).message ?? '') : '';
	$: formSuccess =
		form && typeof form === 'object' && 'results' in form
			? true
			: form && typeof form === 'object' && 'success' in form
				? Boolean((form as { success?: boolean }).success)
				: false;

	const metaValue = (result: SearchResult, key: string) => {
		const meta = (result.meta ?? {}) as Record<string, unknown>;
		const value = meta[key];
		return typeof value === 'string' ? value : undefined;
	};
</script>

<section class="page">
	<header class="header">
		<a class="link" href={resolve('/admin/search-vectors')}>Back to search vectors</a>
		<div class="title-row">
			<div>
				<p class="eyebrow">Vector search</p>
				<h1>{data.repository.name}</h1>
				<p class="muted">EdTechRAG URL: {data.repository.url}</p>
			</div>
			<a
				class="secondary-button"
				href={resolve(`/admin/repositories/${encodeURIComponent(data.repository.url)}`)}
			>
				Configure repository
			</a>
		</div>
		{#if formMessage}
			<p class={`notice ${formSuccess ? 'success' : 'error'}`}>{formMessage}</p>
		{/if}
	</header>

	<section class="panel">
		<div class="panel-head">
			<div>
				<h2>Search</h2>
				<p class="muted">Search chunks in this repository by vector similarity.</p>
			</div>
		</div>
		<form method="POST" action="?/search" class="search-form" on:submit={() => (searching = true)}>
			<label>
				Query
				<input
					type="text"
					name="query"
					value={query}
					placeholder="Ask a question or paste text"
					disabled={!data.repositoryExists}
					required
				/>
			</label>
			<div class="actions">
				<button type="submit" disabled={searching || !data.repositoryExists}>
					{searching ? 'Searching...' : 'Search'}
				</button>
				{#if searching}
					<span class="loader" aria-live="polite">Working...</span>
				{/if}
			</div>
		</form>
		{#if !data.repositoryExists}
			<p class="notice error">Create the repository before searching.</p>
		{/if}
	</section>

	{#if searchResults}
		<section class="results">
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
							{#if metaValue(result, 'url') || result.remoteUrl}
								<span class="muted">
									URL:
									<a
										class="link"
										href={metaValue(result, 'url') ?? result.remoteUrl}
										target="_blank"
										rel="noreferrer"
									>
										{metaValue(result, 'url') ?? result.remoteUrl}
									</a>
								</span>
							{/if}
							{#if metaValue(result, 'folder')}
								<span class="muted">Folder: {metaValue(result, 'folder')}</span>
							{/if}
						</div>
						<pre>{result.content ?? '-'}</pre>
					</article>
				{/each}
			{/if}
		</section>
	{/if}
</section>

<style>
	.page,
	.header,
	.panel,
	.search-form,
	.results,
	.result {
		display: grid;
	}

	.page {
		gap: 1rem;
	}

	.header {
		gap: 0.75rem;
	}

	.title-row,
	.panel-head,
	.actions,
	.result-meta {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.title-row,
	.panel-head {
		justify-content: space-between;
		align-items: flex-start;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		margin-top: 0.15rem;
	}

	h2 {
		font-size: 1.1rem;
	}

	.eyebrow {
		color: #666;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0;
		font-weight: 700;
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
	}

	.notice {
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
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

	.panel,
	.result {
		gap: 0.9rem;
		border: 1px solid #e3e3e3;
		background: #fafafa;
	}

	.panel {
		padding: 0.85rem;
		border-radius: 8px;
	}

	.search-form,
	.results {
		gap: 0.85rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
		color: #333;
		font-weight: 600;
	}

	input {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font: inherit;
		font-weight: 400;
		background: white;
	}

	button,
	.secondary-button {
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
	}

	button:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.loader {
		color: #1f7ae0;
		font-size: 0.95rem;
	}

	.result {
		border-radius: 6px;
		padding: 0.65rem;
		background: white;
		gap: 0.35rem;
	}

	.result-meta {
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
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

	@media (max-width: 640px) {
		.title-row {
			display: grid;
		}
	}
</style>
