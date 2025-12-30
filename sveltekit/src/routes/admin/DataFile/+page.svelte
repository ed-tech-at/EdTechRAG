<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	export let data: PageData;

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';
	const formatNumber = (value: number | null | undefined) =>
		typeof value === 'number' ? value.toLocaleString() : '0';

	const pageLink = (target: number) => {
		const next = Math.min(Math.max(target, 1), data.pagination.totalPages);
		return `?page=${next}`;
	};

	let isChunking = false;
	let chunkError: string | null = null;
	let chunkMessage: string | null = null;

	const runChunkOnce = async () => {
		const res = await fetch(resolve('/admin/DataFile/run'), { method: 'POST' });
		if (!res.ok) {
			throw new Error(`Chunk request failed (${res.status})`);
		}
		return (await res.json()) as
			| { status: 'empty' }
			| { status: 'chunked'; fileId: number; chunks: number }
			| { status: 'error'; message: string };
	};

	const startChunking = async () => {
		if (isChunking) return;
		isChunking = true;
		chunkError = null;
		chunkMessage = null;

		while (isChunking) {
			try {
				const result = await runChunkOnce();

				if (result.status === 'empty') {
					chunkMessage = 'No files waiting to be chunked.';
					isChunking = false;
					break;
				}

				if (result.status === 'error') {
					chunkError = result.message;
					isChunking = false;
					break;
				}

				if (result.status === 'chunked') {
					chunkMessage = `Chunked file #${result.fileId} (${result.chunks} chunk${
						result.chunks === 1 ? '' : 's'
					}).`;
				}
			} catch (err) {
				console.error('Chunking loop failed', err);
				chunkError = 'Chunking failed. Please check logs.';
				isChunking = false;
				break;
			}
		}
	};

	const stopChunking = () => {
		isChunking = false;
	};

	const toggleChunking = () => {
		if (isChunking) {
			stopChunking();
		} else {
			void startChunking();
		}
	};
</script>

<section class="data-files">
	<header class="header">
		<div>
			<h1>Data files</h1>
			<p class="muted">
				Showing {formatNumber(data.dataFiles.length)} of {formatNumber(data.pagination.totalCount)} files (page
				{data.pagination.page} / {data.pagination.totalPages})
			</p>
		</div>
		<div class="stats-grid">
			<div class="stat-card">
				<div class="label">Total files</div>
				<div class="value">{formatNumber(data.stats.totalFiles)}</div>
			</div>
			<div class="stat-card">
				<div class="label">Active files</div>
				<div class="value">{formatNumber(data.stats.totalActiveFiles)}</div>
			</div>
			<div class="stat-card">
				<div class="label">Not active chunked</div>
				<div class="value">{formatNumber(data.stats.notChunked)}</div>
			</div>
			<button class="chunk-toggle" on:click={toggleChunking}>
				{#if isChunking}
					Stop chunking
				{:else}
					Run chunking
				{/if}
			</button>
		</div>
	</header>

	{#if chunkError}
		<p class="error">{chunkError}</p>
	{:else if chunkMessage}
		<p class="success">{chunkMessage}</p>
	{/if}

	{#if data.dataFiles.length === 0}
		<p class="muted">No data files have been ingested yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Repository</th>
					<th>Remote URL</th>
					<th>File ID</th>
					<th>Chunks</th>
					<th>Chunked At</th>
					<th>Invalidated At</th>
					<th>Created</th>
				</tr>
			</thead>
			<tbody>
				{#each data.dataFiles as file}
					<tr>
						<td>
							<!-- <div class="repo-name">{file.repository?.name ?? 'Unknown repo'}</div> -->
							<div class="muted">{file.repositoryUrl}</div>
						</td>
						<td>{file.remoteUrl ?? '—'}</td>
						<td>
							<a class="link" href={resolve(`/admin/DataFile/${file.id}`)}>
								<code>{file.id}</code>
							</a>
						</td>
						<td class="number">{file._count?.dataChunks ?? 0}</td>
						<td>{formatDate(file.chunkedAt)}</td>
						<td>{formatDate(file.invalidatedAt)}</td>
						<td>{formatDate(file.createdAt)}</td>
					</tr>
					{#if file.meta}
						<tr class="meta-row">
							<td colspan="7">
								<div class="meta-label">Meta</div>
								<pre>{JSON.stringify(file.meta, null, 2)}</pre>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}

	<footer class="pagination">
		<div class="paging-info">Page {data.pagination.page} of {data.pagination.totalPages}</div>
		<div class="paging-controls">
			<a
				class:disabled={data.pagination.page === 1}
				href={pageLink(data.pagination.page - 1)}
				aria-disabled={data.pagination.page === 1}
				>Previous</a
			>
			<a
				class:disabled={data.pagination.page >= data.pagination.totalPages}
				href={pageLink(data.pagination.page + 1)}
				aria-disabled={data.pagination.page >= data.pagination.totalPages}
				>Next</a
			>
		</div>
	</footer>
</section>

<style>
	.data-files {
		display: grid;
		gap: 1rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.stats-grid {
		display: flex;
		/* grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); */
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.stat-card {
		background: #f7f7f7;
		border-radius: 10px;
		padding: 0.75rem 1rem;
		min-width: 160px;
	}

	.stat-card .label {
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 0.35rem;
	}

	.stat-card .value {
		font-size: 1.25rem;
		font-weight: 600;
		color: #111;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		border-bottom: 1px solid #e3e3e3;
		padding: 0.75rem 0.5rem;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-weight: 600;
		color: #333;
	}

	code {
		font-size: 0.9rem;
	}

	.link {
		color: #1f7ae0;
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.repo-name {
		font-weight: 600;
		color: #111;
	}

	.muted {
		color: #666;
		font-size: 0.95rem;
	}

	.number {
		text-align: right;
	}

	.meta-row td {
		background: #fafafa;
	}

	.meta-label {
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: #444;
	}

	pre {
		margin: 0;
		font-size: 0.9rem;
		background: #f1f1f1;
		padding: 0.5rem;
		border-radius: 4px;
		overflow: auto;
	}

	.chunk-toggle {
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: #fff;
		border-radius: 999px;
		padding: 0.5rem 1rem;
		font-weight: 600;
		cursor: pointer;
		align-self: center;
	}

	.chunk-toggle:hover {
		background: #1765bb;
		border-color: #1765bb;
	}

	.chunk-toggle:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.success {
		color: #0f7a4f;
		font-weight: 600;
	}

	.error {
		color: #b42318;
		font-weight: 600;
	}

	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		border-top: 1px solid #e3e3e3;
		padding-top: 0.75rem;
	}

	.paging-controls {
		display: flex;
		gap: 0.75rem;
	}

	.paging-controls a {
		color: #1f7ae0;
		text-decoration: none;
	}

	.paging-controls a:hover {
		text-decoration: underline;
	}

	.paging-controls a.disabled {
		color: #999;
		pointer-events: none;
	}

	td {
word-wrap: break-word;
}
table {
max-width: 100vw;
display: block;
}
pre {
word-wrap: break-word;
max-width: 100vw;
white-space: pre-wrap;
}

</style>
