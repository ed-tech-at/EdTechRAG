<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import {resolve} from '$app/paths';

	type Stats = {
		total: number;
		invalidated: number;
		missingVector: number;
	};

	export let data: PageData;

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';
	const formatNumber = (value: number | null | undefined) =>
		typeof value === 'number' ? value.toLocaleString() : '0';

	const truncate = (value: string | null | undefined, length = 160) => {
		if (!value) return '—';
		return value.length > length ? `${value.slice(0, length)}…` : value;
	};

	const pageLink = (target: number) => {
		const next = Math.min(Math.max(target, 1), data.pagination.totalPages);
		return `?page=${next}`;
	};

	let stats: Stats | null = null;
	let statsLoading = false;
	let statsError: string | null = null;

	const fetchStats = async () => {
		statsLoading = true;
		statsError = null;
		try {
			const res = await fetch(resolve('/admin/embeddings/stats'));
			if (!res.ok) {
				throw new Error(`Failed to load stats (${res.status})`);
			}
			stats = await res.json();
		} catch (err) {
			console.error('Failed to fetch stats', err);
			statsError = 'Failed to load stats.';
			stats = null;
		} finally {
			statsLoading = false;
		}
	};

	onMount(fetchStats);
</script>

<section class="embeddings">
	<header class="header">
		<div>
			<h1>Embeddings</h1>
			<p class="muted">
				Showing {formatNumber(data.items.length)} of {formatNumber(data.pagination.totalCount)} entries (page
				{data.pagination.page} / {data.pagination.totalPages})
			</p>
		</div>
	</header>

	<section class="stats-section">
		<div class="stats-header">
			<h2>Stats</h2>
			<button class="reload" on:click={fetchStats} disabled={statsLoading}>
				{statsLoading ? 'Loading…' : 'Reload'}
			</button>
		</div>

		{#if statsLoading && !stats}
			<p class="muted">Loading stats…</p>
		{:else if statsError}
			<div class="stats-error">
				<span>{statsError}</span>
				<button class="reload small" on:click={fetchStats} disabled={statsLoading}>Retry</button>
			</div>
		{:else if stats}
			<div class="stats-grid">
				<div class="stat-card">
					<div class="label">Total embeddings</div>
					<div class="value">{formatNumber(stats.total)}</div>
				</div>
				<div class="stat-card">
					<div class="label">Invalidated</div>
					<div class="value">{formatNumber(stats.invalidated)}</div>
				</div>
				<div class="stat-card">
					<div class="label">Missing vector</div>
					<div class="value">{formatNumber(stats.missingVector)}</div>
				</div>
			</div>
		{/if}
	</section>

	{#if data.items.length === 0}
		<p class="muted">No embeddings found.</p>
	{:else}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>ID</th>
						<th>Repository</th>
						<th>Data file</th>
						<th>Chunk</th>
						<th>Model</th>
						<th>Vector?</th>
						<th>Embedded</th>
						<th>Created</th>
						<th>Invalidated</th>
						<th>Content</th>
						<th>Vector preview</th>
					</tr>
				</thead>
				<tbody>
					{#each data.items as item}
						<tr>
							<td><code>{item.id}</code></td>
							<td>{item.repositoryUrl ?? '—'}</td>
							<td>{item.dataFileId ?? '—'}</td>
							<td>{item.chunkNr ?? '—'}</td>
							<td>{item.embeddingModel ?? '—'}</td>
							<td class={item.hasVector ? 'status ok' : 'status muted'}>
								{item.hasVector ? 'Stored' : 'Missing'}
							</td>
							<td>{formatDate(item.embeddedAt)}</td>
							<td>{formatDate(item.createdAt)}</td>
							<td>{formatDate(item.invalidatedAt)}</td>
							<td class="content">{truncate(item.content)}</td>
							<td class="vector-preview">{truncate(item.vectorPreview)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<footer class="pagination">
		<div class="paging-info">
			Page {data.pagination.page} of {data.pagination.totalPages}
		</div>
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
	.embeddings {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
	}

	.muted {
		color: #666;
		font-size: 0.95rem;
		margin: 0.25rem 0 0;
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.stats-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stats-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.reload {
		border: 1px solid #d0d7de;
		background: #fff;
		border-radius: 6px;
		padding: 0.35rem 0.9rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.reload.small {
		padding: 0.2rem 0.7rem;
		font-size: 0.85rem;
	}

	.reload:disabled {
		cursor: progress;
		opacity: 0.6;
	}

	.stats-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #b42318;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.stat-card {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		background: #fff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.stat-card .label {
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-card .value {
		font-size: 1.5rem;
		font-weight: 600;
		color: #1f1f1f;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}

	th,
	td {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid #e3e3e3;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-weight: 600;
		background: #fafafa;
		position: sticky;
		top: 0;
	}

	code {
		font-size: 0.9rem;
	}

	.status {
		font-weight: 600;
	}

	.status.ok {
		color: #0d7a2a;
	}

	.status.muted {
		color: #999;
	}

	.content,
	.vector-preview {
		max-width: 320px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.5rem;
	}

	.paging-controls {
		display: flex;
		gap: 0.75rem;
	}

	a {
		color: #1f7ae0;
		text-decoration: none;
	}

	a.disabled {
		color: #999;
		pointer-events: none;
	}
</style>
