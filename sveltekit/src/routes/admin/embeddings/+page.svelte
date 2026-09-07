<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	type Stats = {
		total: number;
		invalidated: number;
		missingVector: number;
		cacheDonors: number;
	};

	type ImportSummary = {
		received: number;
		inserted: number;
		duplicates: number;
		filled: number;
		invalid: number;
		errors: string[];
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

	type VectorItem = PageData['items'][number];

	// Three states: no vector yet, a freshly computed one, or one copied from an
	// identical chunk. Rows embedded before the source column existed have no
	// bookkeeping and therefore read as "New Stored".
	const vectorState = (item: VectorItem) => {
		if (!item.hasVector) return { label: 'Missing', className: 'status muted' };
		if (item.cacheSourceId === null) return { label: 'New Stored', className: 'status ok' };
		return { label: `Cache Hit (Old ID ${item.cacheSourceId})`, className: 'status cached' };
	};

	const pageLink = (target: number) => {
		const next = Math.min(Math.max(target, 1), data.pagination.totalPages);
		return `?page=${next}`;
	};

	let stats: Stats | null = null;
	let statsLoading = false;
	let statsError: string | null = null;
	let isEmbedding = false;
	let embeddingError: string | null = null;
	let embeddingMessage: string | null = null;

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

	const runEmbeddingOnce = async () => {
		const res = await fetch(resolve('/admin/embeddings/run'), { method: 'POST' });
		if (!res.ok) {
			throw new Error(`Embedding request failed (${res.status})`);
		}
		return (await res.json()) as
			| { status: 'empty' }
			| { status: 'embedded'; chunkId: number }
			| { status: 'error'; message: string };
	};

	const startEmbedding = async () => {
		if (isEmbedding) return;
		isEmbedding = true;
		embeddingError = null;
		embeddingMessage = null;

		while (isEmbedding) {
			try {
				const result = await runEmbeddingOnce();
				await fetchStats();

				if (result.status === 'empty') {
					embeddingMessage = 'No pending embeddings.';
					isEmbedding = false;
					break;
				}

				if (result.status === 'error') {
					embeddingError = result.message || 'Embedding failed. Please check server logs.';
					isEmbedding = false;
					break;
				}

				if (result.status === 'embedded') {
					embeddingMessage = `Embedded chunk #${result.chunkId}`;
				}
			} catch (err) {
				console.error('Embedding loop failed', err);
				embeddingError = 'Embedding failed. Please check logs.';
				isEmbedding = false;
				break;
			}

			if (!isEmbedding) {
				break;
			}
		}
	};

	const stopEmbedding = () => {
		isEmbedding = false;
	};

	const toggleEmbedding = () => {
		if (isEmbedding) {
			stopEmbedding();
		} else {
			void startEmbedding();
		}
	};

	// ── Export ────────────────────────────────────────────────────────────────
	let exportDialog: HTMLDialogElement;
	let exportScope: 'all' | 'repo' = 'all';
	let exportRepo = data.repositories[0]?.url ?? '';
	let exportModel = '';
	let exportFrom = '';
	let exportTo = '';
	let exportIncludeInvalidated = true;
	let exportCount: number | null = null;
	let exportCountLoading = false;
	let exportCountTimer: ReturnType<typeof setTimeout> | null = null;

	// datetime-local yields wall-clock time without zone; send it as an instant.
	const toIso = (local: string) => {
		if (!local) return '';
		const date = new Date(local);
		return Number.isFinite(date.getTime()) ? date.toISOString() : '';
	};

	const exportParams = () => {
		const params = new URLSearchParams();
		if (exportScope === 'repo' && exportRepo) params.set('repo', exportRepo);
		if (exportModel) params.set('model', exportModel);
		const from = toIso(exportFrom);
		const to = toIso(exportTo);
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		if (!exportIncludeInvalidated) params.set('invalidated', '0');
		return params;
	};

	const refreshExportCount = () => {
		if (exportCountTimer) clearTimeout(exportCountTimer);
		exportCountLoading = true;
		exportCountTimer = setTimeout(async () => {
			const params = exportParams();
			params.set('count', '1');
			try {
				const res = await fetch(`${resolve('/admin/embeddings/export')}?${params}`);
				exportCount = res.ok ? ((await res.json()) as { count: number }).count : null;
			} catch (err) {
				console.error('Failed to count export rows', err);
				exportCount = null;
			} finally {
				exportCountLoading = false;
			}
		}, 250);
	};

	const openExport = () => {
		exportDialog.showModal();
		refreshExportCount();
	};

	const startExport = () => {
		window.location.assign(`${resolve('/admin/embeddings/export')}?${exportParams()}`);
		exportDialog.close();
	};

	// ── Import ────────────────────────────────────────────────────────────────
	// Rows are streamed from the file and posted in byte-bounded batches, so a
	// multi-hundred-MB export never sits in memory and stays under the server's
	// body limit. A 413 halves the batch and retries.
	const IMPORT_BATCH_BYTES = 4 * 1024 * 1024;
	const IMPORT_BATCH_ROWS = 500;

	let importDialog: HTMLDialogElement;
	let importFiles: FileList | null = null;
	let importFillPending = true;
	let importRunning = false;
	let importDone = false;
	let importError: string | null = null;
	let importBytesRead = 0;
	let importBytesTotal = 0;
	let importLinesRead = 0;
	let importExpectedCount: number | null = null;
	let importSummary: ImportSummary = emptySummary();
	let importLocalErrors: string[] = [];

	function emptySummary(): ImportSummary {
		return { received: 0, inserted: 0, duplicates: 0, filled: 0, invalid: 0, errors: [] };
	}

	const resetImport = () => {
		importDone = false;
		importError = null;
		importBytesRead = 0;
		importBytesTotal = 0;
		importLinesRead = 0;
		importExpectedCount = null;
		importSummary = emptySummary();
		importLocalErrors = [];
	};

	const openImport = () => {
		resetImport();
		importDialog.showModal();
	};

	async function* readLines(file: File) {
		const reader = file.stream().getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			importBytesRead += value.byteLength;
			buffer += decoder.decode(value, { stream: true });
			let newline = buffer.indexOf('\n');
			while (newline >= 0) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (line.trim()) yield line;
				newline = buffer.indexOf('\n');
			}
		}
		buffer += decoder.decode();
		if (buffer.trim()) yield buffer;
	}

	const mergeSummary = (partial: ImportSummary) => {
		importSummary = {
			received: importSummary.received + partial.received,
			inserted: importSummary.inserted + partial.inserted,
			duplicates: importSummary.duplicates + partial.duplicates,
			filled: importSummary.filled + partial.filled,
			invalid: importSummary.invalid + partial.invalid,
			errors: [...importSummary.errors, ...partial.errors].slice(0, 50)
		};
	};

	const sendBatch = async (rows: unknown[]): Promise<void> => {
		if (rows.length === 0) return;
		const res = await fetch(resolve('/admin/embeddings/import'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rows, fillPending: importFillPending })
		});
		if (res.status === 413 && rows.length > 1) {
			const half = Math.ceil(rows.length / 2);
			await sendBatch(rows.slice(0, half));
			await sendBatch(rows.slice(half));
			return;
		}
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`Import request failed (${res.status}) ${text}`.trim());
		}
		mergeSummary((await res.json()) as ImportSummary);
	};

	const startImport = async () => {
		const file = importFiles?.[0];
		if (!file || importRunning) return;
		resetImport();
		importRunning = true;
		importBytesTotal = file.size;

		let batch: unknown[] = [];
		let batchBytes = 0;
		try {
			for await (const line of readLines(file)) {
				importLinesRead += 1;
				let parsed: unknown;
				try {
					parsed = JSON.parse(line);
				} catch {
					importSummary = { ...importSummary, invalid: importSummary.invalid + 1 };
					if (importLocalErrors.length < 20) {
						importLocalErrors = [...importLocalErrors, `line ${importLinesRead}: not valid JSON`];
					}
					continue;
				}
				if (
					parsed &&
					typeof parsed === 'object' &&
					(parsed as { type?: unknown }).type === 'edtechrag-embeddings'
				) {
					const count = (parsed as { count?: unknown }).count;
					importExpectedCount = typeof count === 'number' ? count : null;
					continue;
				}

				batch.push(parsed);
				batchBytes += line.length;
				if (batch.length >= IMPORT_BATCH_ROWS || batchBytes >= IMPORT_BATCH_BYTES) {
					await sendBatch(batch);
					batch = [];
					batchBytes = 0;
				}
			}
			await sendBatch(batch);
			importDone = true;
			await fetchStats();
		} catch (err) {
			console.error('Import failed', err);
			importError = err instanceof Error ? err.message : 'Import failed.';
		} finally {
			importRunning = false;
		}
	};

	const closeOnBackdrop = (event: MouseEvent, dialog: HTMLDialogElement) => {
		if (event.target === dialog && !importRunning) dialog.close();
	};

	$: importProgress =
		importBytesTotal > 0 ? Math.min(100, Math.round((importBytesRead / importBytesTotal) * 100)) : 0;

	onMount(() => {
		void fetchStats();
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
		integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
		crossorigin="anonymous"
		referrerpolicy="no-referrer"
	/>
</svelte:head>

<section class="embeddings">
	<header class="header">
		<div>
			<h1>Embeddings</h1>
			<p class="muted">
				Showing {formatNumber(data.items.length)} of {formatNumber(data.pagination.totalCount)} entries (page
				{data.pagination.page} / {data.pagination.totalPages})
			</p>
		</div>
		{#if data.canManageUsers}
			<div class="header-actions">
				<button class="reload" on:click={openExport}>
					<i class="fa-solid fa-download" aria-hidden="true"></i> Export
				</button>
				<button class="reload" on:click={openImport}>
					<i class="fa-solid fa-upload" aria-hidden="true"></i> Import
				</button>
			</div>
		{/if}
	</header>

	<section class="stats-section">
		<div class="stats-header">
			<h2>Stats</h2>
			<div class="stats-actions">
				<button class="reload" on:click={() => location.reload()} disabled={statsLoading}>
					{statsLoading ? 'Loading…' : 'Reload'}
				</button>
				<button class="embed-toggle" on:click={toggleEmbedding}>
					{#if isEmbedding}
						<i class="fa-solid fa-spinner fa-spin spinner-icon" aria-hidden="true"></i>
						Stop Embedding
					{:else}
						Run Embedding
					{/if}
				</button>
			</div>
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
					<div class="label">Active Missing vector</div>
					<div class="value">{formatNumber(stats.missingVector)}</div>
				</div>
				<div class="stat-card">
					<div class="label">Imported cache rows</div>
					<div class="value">{formatNumber(stats.cacheDonors)}</div>
				</div>
			</div>
		{/if}

		{#if embeddingError}
			<p class="error">{embeddingError}</p>
		{:else if embeddingMessage}
			<p class="success">{embeddingMessage}</p>
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
							<td class={vectorState(item).className}>
								{vectorState(item).label}
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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog class="modal" bind:this={exportDialog} on:click={(e) => closeOnBackdrop(e, exportDialog)}>
	<form class="modal-body" on:submit|preventDefault={startExport}>
		<h2>Export embeddings</h2>
		<p class="muted">
			Writes a <code>.jsonl</code> file: one header line, then one embedding per line
			(content, model, vector). Only rows that already have a vector are exported.
		</p>

		<fieldset>
			<legend>Repository</legend>
			<label class="radio">
				<input type="radio" bind:group={exportScope} value="all" on:change={refreshExportCount} />
				All repositories
			</label>
			<label class="radio">
				<input type="radio" bind:group={exportScope} value="repo" on:change={refreshExportCount} />
				Single repository
			</label>
			<select
				bind:value={exportRepo}
				disabled={exportScope !== 'repo'}
				on:change={refreshExportCount}
			>
				{#each data.repositories as repo}
					<option value={repo.url}>{repo.name} — {repo.url}</option>
				{/each}
			</select>
		</fieldset>

		<label class="field">
			<span>Embedding model</span>
			<select bind:value={exportModel} on:change={refreshExportCount}>
				<option value="">All models</option>
				{#each data.models as model}
					<option value={model}>{model}</option>
				{/each}
			</select>
		</label>

		<div class="field-row">
			<label class="field">
				<span>Embedded from</span>
				<input type="datetime-local" bind:value={exportFrom} on:input={refreshExportCount} />
			</label>
			<label class="field">
				<span>Embedded until</span>
				<input type="datetime-local" bind:value={exportTo} on:input={refreshExportCount} />
			</label>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={exportIncludeInvalidated} on:change={refreshExportCount} />
			Include invalidated chunks (their vectors still serve as cache)
		</label>

		<p class="count">
			{#if exportCountLoading}
				Counting…
			{:else if exportCount === null}
				Count unavailable
			{:else}
				<strong>{formatNumber(exportCount)}</strong> embeddings match
			{/if}
		</p>

		<div class="modal-actions">
			<button type="button" class="reload" on:click={() => exportDialog.close()}>Cancel</button>
			<button type="submit" class="embed-toggle" disabled={exportCount === 0 || (exportScope === 'repo' && !exportRepo)}>
				<i class="fa-solid fa-download" aria-hidden="true"></i> Download
			</button>
		</div>
	</form>
</dialog>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog class="modal" bind:this={importDialog} on:click={(e) => closeOnBackdrop(e, importDialog)}>
	<form class="modal-body" on:submit|preventDefault={startImport}>
		<h2>Import embeddings</h2>
		<p class="muted">
			Reads a <code>.jsonl</code> export. Rows whose content + model already have a vector here are
			skipped as duplicates; new ones are stored as cache rows (no repository) so future
			embedding runs reuse them. Existing vectors are never overwritten.
		</p>

		<label class="field">
			<span>File</span>
			<input type="file" accept=".jsonl,application/x-ndjson,application/jsonl" bind:files={importFiles} disabled={importRunning} />
		</label>

		<label class="check">
			<input type="checkbox" bind:checked={importFillPending} disabled={importRunning} />
			Fill pending chunks now (chunks without a vector get the imported one and show as Cache Hit)
		</label>

		{#if importRunning || importDone || importError}
			<div class="progress">
				<div class="progress-bar" style={`width: ${importProgress}%`}></div>
			</div>
			<p class="muted">
				{importProgress}% · {formatNumber(importLinesRead)} lines read
				{#if importExpectedCount !== null}
					of ~{formatNumber(importExpectedCount)}
				{/if}
			</p>
			<dl class="summary">
				<dt>Inserted as cache rows</dt>
				<dd>{formatNumber(importSummary.inserted)}</dd>
				<dt>Skipped (already present)</dt>
				<dd>{formatNumber(importSummary.duplicates)}</dd>
				<dt>Pending chunks filled</dt>
				<dd>{formatNumber(importSummary.filled)}</dd>
				<dt>Invalid rows</dt>
				<dd>{formatNumber(importSummary.invalid)}</dd>
			</dl>
			{#if importLocalErrors.length || importSummary.errors.length}
				<ul class="error-list">
					{#each [...importLocalErrors, ...importSummary.errors] as message}
						<li>{message}</li>
					{/each}
				</ul>
			{/if}
		{/if}

		{#if importError}
			<p class="error">{importError}</p>
		{:else if importDone}
			<p class="success">Import finished. Reload the page to see the updated table.</p>
		{/if}

		<div class="modal-actions">
			<button type="button" class="reload" on:click={() => importDialog.close()} disabled={importRunning}>
				{importDone ? 'Close' : 'Cancel'}
			</button>
			<button type="submit" class="embed-toggle" disabled={importRunning || !importFiles?.length}>
				{#if importRunning}
					<i class="fa-solid fa-spinner fa-spin spinner-icon" aria-hidden="true"></i> Importing…
				{:else}
					<i class="fa-solid fa-upload" aria-hidden="true"></i> Import
				{/if}
			</button>
		</div>
	</form>
</dialog>

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

	.header-actions {
		display: flex;
		gap: 0.5rem;
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

	.stats-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.reload {
		border: 1px solid #d0d7de;
		background: #fff;
		border-radius: 6px;
		padding: 0.35rem 0.9rem;
		font-size: 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.reload.small {
		padding: 0.2rem 0.7rem;
		font-size: 0.85rem;
	}

	.reload:disabled {
		cursor: progress;
		opacity: 0.6;
	}

	.embed-toggle {
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: #fff;
		border-radius: 6px;
		padding: 0.35rem 0.9rem;
		font-size: 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.embed-toggle:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.spinner-icon {
		font-size: 0.9rem;
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

	.error {
		color: #b42318;
		font-size: 0.9rem;
		margin: 0;
	}

	.success {
		color: #0d7a2a;
		font-size: 0.9rem;
		margin: 0;
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

	.status.cached {
		color: #8a5a00;
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

	/* Modals */
	.modal {
		border: 1px solid #d0d7de;
		border-radius: 10px;
		padding: 0;
		width: min(560px, calc(100vw - 2rem));
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.25rem 1.5rem;
	}

	.modal-body h2 {
		margin: 0;
		font-size: 1.15rem;
	}

	fieldset {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.6rem 0.9rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	legend {
		font-size: 0.85rem;
		color: #666;
		padding: 0 0.3rem;
	}

	.radio,
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.9rem;
		flex: 1;
	}

	.field span {
		color: #666;
	}

	.field-row {
		display: flex;
		gap: 0.75rem;
	}

	select,
	input[type='datetime-local'],
	input[type='file'] {
		border: 1px solid #d0d7de;
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
		font-size: 0.9rem;
		background: #fff;
		width: 100%;
		box-sizing: border-box;
	}

	select:disabled {
		background: #f6f8fa;
		color: #999;
	}

	.count {
		margin: 0;
		font-size: 0.95rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.progress {
		height: 8px;
		background: #eef1f4;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: #1f7ae0;
		transition: width 0.15s ease;
	}

	.summary {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: 0.9rem;
	}

	.summary dt {
		color: #666;
	}

	.summary dd {
		margin: 0;
		font-weight: 600;
		text-align: right;
	}

	.error-list {
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.85rem;
		color: #b42318;
		max-height: 120px;
		overflow-y: auto;
	}
</style>
