<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	export let data: PageData;
</script>

<section class="page">
	<h1>Query Rewrite</h1>
	<p class="muted">Select a repository to test query rewriting and multi-query retrieval.</p>

	{#if data.repositories.length === 0}
		<p class="muted">No repositories found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>URL</th>
					<th>Files</th>
					<th class="number">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each data.repositories as repo}
					<tr>
						<td>{repo.name}</td>
						<td class="muted">{repo.url}</td>
						<td class="number">{repo.fileCount}</td>
						<td class="number">
							<a class="link" href={resolve(`/admin/queryRewrite/${encodeURIComponent(repo.url)}`)}
								>Open →</a
							>
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
		gap: 0.75rem;
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

	.number {
		text-align: right;
	}

	.muted {
		color: #666;
	}

	.link {
		color: #1f7ae0;
		text-decoration: none;
		font-weight: 600;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>
