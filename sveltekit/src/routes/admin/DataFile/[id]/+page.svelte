<script lang="ts">
	import type { ActionData, PageData } from './$types';
    import { resolve } from '$app/paths';

	export let data: PageData;
	export let form: ActionData;

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';

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
		<a class="link" href={resolve('/admin/DataFile')}>← Back to data files</a>
		<h1>Data file chunks</h1>
		{#if form?.message}
			<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
		{/if}
		<p class="muted">
			Repository: {data.dataFile.repository?.name ?? 'Unknown'} ({data.dataFile.repositoryUrl})
		</p>
		<p class="muted">Remote URL: {data.dataFile.remoteUrl ?? '—'}</p>
		{#if data.dataFile.meta}
			<p class="muted">Meta: <code>{JSON.stringify(data.dataFile.meta)}</code></p>
		{/if}
		<p class="muted">
			Last seen: {formatDate(data.dataFile.lastSeen)} · Created: {formatDate(data.dataFile.createdAt)}
		</p>
		<p class="muted">Total chunks: {data.dataFile._count?.dataChunks ?? 0}</p>
		<form
			method="POST"
			action="?/delete"
			class="delete-form"
			on:submit={(event) => {
				if (!confirm('Delete this data file and its chunks?')) event.preventDefault();
			}}
		>
			<button type="submit" class="danger">Delete data file</button>
		</form>
	</div>

	<section class="ingest">
		<h2>Replace chunks</h2>
		<form method="POST" action="?/ingest" class="ingest-form">
			<label>
				Paste text to split into chunks (uses LangChain recursive splitter)
				<textarea name="content" rows="6" required></textarea>
			</label>
			<div class="form-actions">
				<button type="submit">Replace chunks</button>
				<span class="muted">Existing chunks will be removed before inserting.</span>
			</div>
		</form>
	</section>

	<section class="search">
		<form method="POST" action="?/search" class="search-form">
			<label>
				Search chunks (vector similarity)
				<input type="text" name="query" placeholder="Ask a question or paste text" required />
			</label>
			<button type="submit">Search</button>
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

	<section class="chunks">
		{#if data.dataChunks.length === 0}
			<p class="muted">No chunks for this data file yet.</p>
		{:else}
			{#each data.dataChunks as chunk, idx}
				<article class="chunk">
					<header class="chunk-header">
						<div>
							<strong>Chunk {chunk.chunkNr ?? idx + 1}</strong>
						</div>
						<div class="muted">
							Created: {formatDate(chunk.createdAt)} · Last seen: {formatDate(chunk.lastSeen)}
						</div>
					</header>
					<pre>{chunk.content}</pre>
					{#if chunk.embeddingModel}
						<p class="muted">Embedding model: {chunk.embeddingModel} · Length: {chunk.content?.length ?? 0} chars</p>
					{:else}
						<form method="POST" action="?/embed" class="embed-form">
							<input type="hidden" name="chunkId" value={chunk.id} />
							<button type="submit">Generate embedding</button>
						</form>
					{/if}
				</article>
			{/each}
		{/if}
	</section>
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.header h1 {
		margin: 0.35rem 0;
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

	.search {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.ingest {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.ingest-form {
		display: grid;
		gap: 0.5rem;
	}

	.ingest-form textarea {
		width: 100%;
		min-height: 140px;
		margin-top: 0.35rem;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
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

	.chunks {
		display: grid;
		gap: 1rem;
	}

	.chunk {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem;
		background: #fafafa;
		display: grid;
		gap: 0.5rem;
	}

	.chunk-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	pre {
		margin: 0;
		overflow: auto;
		font-size: 0.95rem;
		background: #f7f7f7;
		border-radius: 6px;
		padding: 0.65rem;
		border: 1px solid #e3e3e3;
		white-space: pre-line;
	}

	.embed-form {
		display: flex;
		justify-content: flex-start;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.delete-form {
		margin-top: 0.5rem;
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

	button.danger {
		border-color: #c12f2f;
		background: #c12f2f;
	}

	button.danger:hover {
		border-color: #a52727;
		background: #a52727;
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
</style>
