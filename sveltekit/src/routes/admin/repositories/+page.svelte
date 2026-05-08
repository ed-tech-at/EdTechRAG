<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: formMessage =
		form && typeof form === 'object' && 'message' in form ? ((form as { message?: string }).message ?? '') : '';
</script>

<section class="page">
	<header class="header">
		<h1>Repositories</h1>
		<form method="POST" action="?/createRepository" class="create-form">
			<input
				name="repositoryUrl"
				placeholder="Repository URL"
				value={form && typeof form === 'object' && 'repositoryUrl' in form
					? ((form as { repositoryUrl?: string }).repositoryUrl ?? '')
					: ''}
				required
			/>
			<button type="submit">Add repository</button>
		</form>
	</header>
	{#if formMessage}
		<p class="notice error">{formMessage}</p>
	{/if}
	{#if data.repositories.length === 0}
		<p class="muted">No repositories found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>URL</th>
					<th>Files</th>
				</tr>
			</thead>
			<tbody>
				{#each data.repositories as repo}
					<tr>
						<td>
							<a class="link" href={resolve(`/admin/repositories/${encodeURIComponent(repo.url)}`)}>
								{repo.name}
							</a>
						</td>
						<td class="muted">{repo.url}</td>
						<td class="number">{repo.fileCount}</td>
						<!-- <td class="number">{repo.chunkCount}</td> -->
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

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	h1 {
		margin: 0;
	}

	.create-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	input {
		width: min(24rem, 55vw);
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font: inherit;
	}

	button {
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.notice {
		margin: 0;
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
	}

	.notice.error {
		background: #fff0f0;
		color: #8a1c1c;
		border: 1px solid #f2c7c7;
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

	.number {
		text-align: right;
	}
</style>
