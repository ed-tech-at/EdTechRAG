<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<section class="page">
	<header class="header">
		<h1>Search vectors</h1>
		<p class="muted">Select a repository to search chunks by vector similarity.</p>
	</header>

	{#if data.repositories.length === 0}
		<p class="muted">No repositories found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>URL</th>
					<th class="number">Files</th>
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
							<a class="link" href={resolve(`/admin/search-vectors/${encodeURIComponent(repo.url)}`)}>
								Search
							</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page,
	.header {
		display: grid;
		gap: 0.75rem;
	}

	h1,
	p {
		margin: 0;
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
		font-weight: 600;
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
