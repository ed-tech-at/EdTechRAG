<script lang="ts">
	import { resolve } from '$app/paths';
	import { renderMarkdownWithBlankTargets } from '$lib/markdown';
	import type { PageData } from './$types';

	export let data: PageData;

	const base = () => resolve(`/admin/chatLogs/${encodeURIComponent(data.repository.url)}`);
	const pageHref = (n: number) => `${base()}?page=${n}`;

	const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
</script>

<section class="page">
	<header class="header">
		<a class="link" href={resolve('/admin/chatLogs')}>← Repositories</a>
		<h1>Gesendete Chats · {data.repository.name}</h1>
		<p class="muted">{data.repository.url} · {data.total} request{data.total === 1 ? '' : 's'}</p>
	</header>

	{#if data.items.length === 0}
		<p class="muted">No chat requests recorded for this repository.</p>
	{:else}
		<ul class="log-list">
			{#each data.items as item}
				<li class="log-entry">
					<div class="entry-head">
						<span class="question">{item.question ?? '—'}</span>
						<span class="meta">
							{formatDate(item.createdAt)}
							{#if item.endpoint}<span class="tag">{item.endpoint}</span>{/if}
							{#if item.username}<span class="tag">{item.username}</span>{/if}
							{#if item.source}<span class="tag">{item.source}</span>{/if}
						</span>
					</div>

					{#if item.history.length > 0}
						<details class="block">
							<summary>History ({item.history.length})</summary>
							<div class="block-body">
								{#each item.history as turn}
									<p class="turn"><strong>{turn.role}:</strong> {turn.content}</p>
								{/each}
							</div>
						</details>
					{/if}

					<details class="block">
						<summary>Answer</summary>
						<div class="block-body markdown">
							{#if item.answer}
								{@html renderMarkdownWithBlankTargets(item.answer)}
							{:else}
								<span class="muted">—</span>
							{/if}
						</div>
					</details>

					<details class="block">
						<summary>Context</summary>
						<div class="block-body">
							<pre>{item.context ?? '—'}</pre>
						</div>
					</details>
				</li>
			{/each}
		</ul>

		<nav class="pagination">
			<a class="page-btn" class:disabled={data.page <= 1} href={pageHref(data.page - 1)}>← Prev</a>
			<span class="page-info">Page {data.page} of {data.pageCount}</span>
			<a class="page-btn" class:disabled={data.page >= data.pageCount} href={pageHref(data.page + 1)}
				>Next →</a
			>
		</nav>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
		padding-bottom: 2rem;
	}

	.header h1 {
		margin: 0.25rem 0;
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
		margin: 0;
	}

	.log-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	.log-entry {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem 0.9rem;
		background: #fafafa;
		display: grid;
		gap: 0.5rem;
	}

	.entry-head {
		display: grid;
		gap: 0.25rem;
	}

	.question {
		font-weight: 600;
		font-size: 1rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		color: #666;
		font-size: 0.85rem;
	}

	.tag {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: #eaf2fd;
		border: 1px solid #cdddfc;
		color: #1f5fb0;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.block > summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		color: #2f3b52;
	}

	.block-body {
		margin-top: 0.4rem;
		padding: 0.6rem;
		background: white;
		border: 1px solid #e7ebf1;
		border-radius: 6px;
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.block-body pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: inherit;
	}

	.turn {
		margin: 0 0 0.4rem;
	}

	.turn:last-child {
		margin-bottom: 0;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.page-btn {
		padding: 0.45rem 0.85rem;
		border-radius: 6px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		text-decoration: none;
	}

	.page-btn.disabled {
		pointer-events: none;
		opacity: 0.45;
	}

	.page-info {
		color: #444;
		font-weight: 600;
	}
</style>
