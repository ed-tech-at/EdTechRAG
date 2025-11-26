<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let ingesting = false;

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';
</script>

<section class="page">
	<div class="header">
		<a class="link" href={`/admin/repositories/${encodeURIComponent(data.repository.url)}`}>← Back to repository</a>
		<h1>{data.repository.name} · Files</h1>
		<p class="muted">URL: {data.repository.url}</p>
	</div>

	{#if form?.message}
		<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
	{/if}

	<section class="ingest">
		<form method="POST" action="?/ingestUrl" class="ingest-form" on:submit={() => (ingesting = true)}>
			<label>
				Load and embed a file from URL
				<input type="url" name="url" placeholder="https://example.com/file.txt" required />
			</label>
			<div class="actions">
				<button type="submit" disabled={ingesting}>
					{ingesting ? 'Processing…' : 'Fetch & ingest'}
				</button>
				{#if ingesting}
					<span class="loader" aria-live="polite">Working…</span>
				{/if}
			</div>
			<p class="muted">Content is split at lines starting with #, then embedded chunk by chunk.</p>
		</form>
	</section>

	{#if data.files.length === 0}
		<p class="muted">No files for this repository.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>File ID</th>
					<th>Remote URL</th>
					<th>Chunks</th>
					<th>Last seen</th>
					<th>Created</th>
					<th class="number">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.files as file}
					<tr>
						<td>
							<a class="link" href={`/admin/DataFile/${file.id}`}>
								<code>{file.id}</code>
							</a>
						</td>
						<td class="muted">{file.remoteUrl ?? '—'}</td>
						<td class="number">{file._count?.dataChunks ?? 0}</td>
						<td>{formatDate(file.lastSeen)}</td>
						<td>{formatDate(file.createdAt)}</td>
						<td class="number">
							<form
								method="POST"
								action="?/delete"
								on:submit={(event) => {
									if (!confirm('Delete this file and its chunks?')) event.preventDefault();
								}}
							>
								<input type="hidden" name="fileId" value={file.id} />
								<button type="submit" class="danger">Delete</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.header h1 {
		margin: 0.25rem 0;
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

	.link {
		color: #1f7ae0;
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.muted {
		color: #666;
		font-size: 0.95rem;
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

	.number {
		text-align: right;
	}

	code {
		font-size: 0.95rem;
	}

	form {
		display: inline;
	}

	button {
		padding: 0.4rem 0.6rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	button.danger {
		border-color: #c62828;
		background: #c62828;
	}

	.ingest {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #f7fbff;
	}

	.ingest-form {
		display: grid;
		gap: 0.5rem;
	}

	.ingest-form input {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font-size: 1rem;
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
</style>
