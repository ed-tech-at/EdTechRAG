<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<section class="page">
	<header class="header">
		<h1>Gesendete Chats</h1>
	</header>
	<p class="muted">Select a repository to browse the chat requests that were sent to it.</p>

	{#if data.repositories.length === 0}
		<p class="muted">No repositories found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>URL</th>
					<th class="number">Chats</th>
					<th class="number">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each data.repositories as repo}
					<tr>
						<td>{repo.name}</td>
						<td class="muted">{repo.url}</td>
						<td class="number">{repo.chatCount}</td>
						<td class="number">
							<a class="link" href={resolve(`/admin/chatLogs/${encodeURIComponent(repo.url)}`)}>Open →</a>
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

	.header h1 {
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
