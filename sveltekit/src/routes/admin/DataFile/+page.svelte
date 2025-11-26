<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';
</script>

<section class="data-files">
	<h1>Data files</h1>

	{#if form?.message}
		<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
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
					<th>Last seen</th>
					<th>Created</th>
				</tr>
			</thead>
			<tbody>
				{#each data.dataFiles as file}
					<tr>
						<td>
							<div class="repo-name">{file.repository?.name ?? 'Unknown repo'}</div>
							<div class="muted">{file.repositoryUrl}</div>
						</td>
						<td>{file.remoteUrl ?? '—'}</td>
						<td>
							<a class="link" href={`/admin/DataFile/${file.id}`}>
								<code>{file.id}</code>
							</a>
						</td>
						<td class="number">{file._count?.dataChunks ?? 0}</td>
						<td>{formatDate(file.lastSeen)}</td>
						<td>{formatDate(file.createdAt)}</td>
					</tr>
					<tr class="form-row">
						<td colspan="6">
							<form method="POST" action="?/ingest" class="chunk-form">
								<input type="hidden" name="dataFileId" value={file.id} />
								<label>
									Paste text to split into chunks (lines starting with <code>#</code> start new chunks)
									<textarea name="content" rows="4" required></textarea>
								</label>
								<div class="form-actions">
									<button type="submit">Create chunks</button>
									<span class="muted">Existing chunks: {file._count?.dataChunks ?? 0}</span>
								</div>
							</form>
						</td>
					</tr>
					{#if file.meta}
						<tr class="meta-row">
							<td colspan="6">
								<div class="meta-label">Meta</div>
								<pre>{JSON.stringify(file.meta, null, 2)}</pre>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.data-files {
		display: grid;
		gap: 1rem;
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

	.notice {
		padding: 0.75rem 1rem;
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

	.form-row td {
		padding-top: 0;
	}

	.chunk-form {
		display: grid;
		gap: 0.5rem;
	}

	.chunk-form textarea {
		width: 100%;
		min-height: 120px;
		margin-top: 0.35rem;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
	}

	.chunk-form button {
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
</style>
