<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<section class="page">
	<h1>Repositories</h1>
	{#if data.repositories.length === 0}
		<p class="muted">No repositories found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>URL</th>
					<th>Files</th>
					<th>Chunks</th>
				</tr>
			</thead>
			<tbody>
				{#each data.repositories as repo}
					<tr>
						<td>
							<a class="link" href={`/admin/repositories/${encodeURIComponent(repo.url)}`}>
								{repo.name}
							</a>
						</td>
						<td class="muted">{repo.url}</td>
						<td class="number">{repo.fileCount}</td>
						<td class="number">{repo.chunkCount}</td>
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
