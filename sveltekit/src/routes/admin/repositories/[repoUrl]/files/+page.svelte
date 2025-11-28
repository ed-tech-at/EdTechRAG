<script lang="ts">
    import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let ingesting = false;
	let urlsInput = '';
	type Status = { url: string; status: 'pending' | 'success' | 'error'; message?: string };
	let statuses: Status[] = [];

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';

	const parseUrls = (input: string) =>
		input
			.replace(/\r\n/g, '\n')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

	const ingestSequentially = async (event: Event) => {
		event.preventDefault();
		let urls = parseUrls(urlsInput);
		if (urls.length === 0) {
			return;
		}

		ingesting = true;
		statuses = urls.map((url) => ({ url, status: 'pending' }));

		for (const url of urls) {
			const idx = statuses.findIndex((s) => s.url === url && s.status === 'pending');
			try {
				const formData = new FormData();
				formData.set('url', url);
				const res = await fetch('?/ingestUrl', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				const body = await res.json();
				const success = res.ok && body?.success !== false;
				statuses[idx] = {
					url,
					status: success ? 'success' : 'error',
					message: body?.message ?? (success ? 'Done' : 'Failed')
				};
			} catch (err) {
				statuses[idx] = {
					url,
					status: 'error',
					message: err instanceof Error ? err.message : 'Unknown error'
				};
			}
			urls = urls.slice(1);
			urlsInput = urls.join('\n');
		}

		ingesting = false;
	};
</script>

<section class="page">
	<div class="header">
		<a class="link" href={resolve(`/admin/repositories/${encodeURIComponent(data.repositoryUrl)}`)}>← Back to repository</a>
		<h1>{data.repositoryName} · Files</h1>
		<p class="muted">URL: {data.repositoryUrl}</p>
	</div>

	{#if form?.message}
		<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
	{/if}

	<section class="ingest">
		<form
			method="POST"
			action="?/ingestUrl"
			class="ingest-form"
			on:submit|preventDefault={ingestSequentially}
		>
			<label>
				Load and embed files from URLs or GitLab paths (one per line, processed top to bottom)
				<textarea
					name="urls"
					placeholder="https://example.com/file.txt&#10;README.md"
					required
					bind:value={urlsInput}
				></textarea>
			</label>
			<div class="actions">
				<button type="submit" disabled={ingesting}>
					{ingesting ? 'Processing…' : 'Fetch & ingest all'}
				</button>
				{#if ingesting}
					<span class="loader" aria-live="polite">Working…</span>
				{/if}
			</div>
			<p class="muted">
				Each URL is fetched and ingested sequentially. Content is split into LangChain chunks and embedded.
			</p>
			{#if statuses.length}
				<ul class="status-list">
					{#each statuses as item}
						<li class={item.status}>
							<strong>{item.url}</strong> — {item.message ?? item.status}
						</li>
					{/each}
				</ul>
			{/if}
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
					<th>Path</th>
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
							<a class="link" href={resolve(`/admin/DataFile/${file.id}`)}>
								<code>{file.id}</code>
							</a>
						</td>
						<td class="muted">{file.remoteUrl ?? '—'}</td>
						<td class="muted">{file.meta?.path ?? '—'}</td>
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

	.ingest-form textarea {
		width: 100%;
		min-height: 120px;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font-size: 1rem;
		font-family: inherit;
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

	.status-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: grid;
		gap: 0.25rem;
		font-size: 0.95rem;
	}

	.status-list li {
		padding: 0.35rem 0.4rem;
		border-radius: 4px;
		background: #f5f7fa;
	}

	.status-list li.success {
		border: 1px solid #b7e0c2;
		background: #e7f6ec;
		color: #1b6b3a;
	}

	.status-list li.error {
		border: 1px solid #f2c7c7;
		background: #fff0f0;
		color: #8a1c1c;
	}
</style>
