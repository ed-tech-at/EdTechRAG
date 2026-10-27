<script lang="ts">
	import { resolve } from '$app/paths';
	import { renderMarkdownWithBlankTargets } from '$lib/markdown';
	import type { PageData } from './$types';

	export let data: PageData;

	const base = () => resolve(`/admin/chatLogs/${encodeURIComponent(data.repository.url)}`);
	const pageHref = (n: number) => `${base()}?page=${n}`;
	const exportHref = () => `${base()}/export`;

	const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<section class="page">
	<header class="header">
		<div>
			<a class="link" href={resolve('/admin/chatLogs')}>← Repositories</a>
			<h1>Gesendete Chats · {data.repository.name}</h1>
			<p class="muted">
				{data.repository.url} · {plural(data.conversationCount, 'Konversation', 'Konversationen')} ·
				{plural(data.requestCount, 'Request', 'Requests')}
			</p>
		</div>
		{#if data.requestCount > 0}
			<div class="header-actions">
				<a class="action" href={exportHref()} download>
					<i class="fas fa-download" aria-hidden="true"></i> Excel-Download
				</a>
			</div>
		{/if}
	</header>

	{#if data.groups.length === 0}
		<p class="muted">No chat requests recorded for this repository.</p>
	{:else}
		<ul class="log-list">
			{#each data.groups as group (group.key)}
				{@const grouped = group.turns.length > 1}
				{@const first = group.turns[0]}
				<li class="conversation" class:grouped>
					{#if grouped}
						<div class="conv-head">
							<span class="conv-title">
								<i class="fas fa-comments" aria-hidden="true"></i>
								Konversation · {plural(group.turns.length, 'Turn', 'Turns')}
							</span>
							<span class="meta">
								{formatDate(group.start)} – {formatDate(group.last)}
								{#if first.username}<span class="tag">{first.username}</span>{/if}
								{#if first.source}<span class="tag">{first.source}</span>{/if}
							</span>
						</div>
					{/if}

					{#each group.turns as item, index (item.id)}
						<article class="log-entry">
							<div class="entry-head">
								<span class="question">
									{#if grouped}<span class="turn-no">{index + 1}</span>{/if}
									{item.question ?? '—'}
								</span>
								<span class="meta">
									{formatDate(item.createdAt)}
									{#if item.endpoint}<span class="tag">{item.endpoint}</span>{/if}
									{#if !grouped && item.username}<span class="tag">{item.username}</span>{/if}
									{#if item.termsAcceptedAt}<span class="tag" title={item.usertermsUrl ?? ''}
											>terms: {formatDate(item.termsAcceptedAt)}</span
										>{/if}
									{#if !grouped && item.source}<span class="tag">{item.source}</span>{/if}
								</span>
							</div>

							{#if !grouped && item.history.length > 0}
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
						</article>
					{/each}
				</li>
			{/each}
		</ul>

		<footer class="pagination">
			<a class="page-btn" class:disabled={data.page <= 1} href={pageHref(data.page - 1)}>← Prev</a>
			<span class="page-info">Page {data.page} of {data.pageCount}</span>
			<a class="page-btn" class:disabled={data.page >= data.pageCount} href={pageHref(data.page + 1)}
				>Next →</a
			>
		</footer>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
		padding-bottom: 2rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.header h1 {
		margin: 0.25rem 0;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action {
		border: 1px solid #d0d7de;
		background: #fff;
		color: #24292f;
		border-radius: 6px;
		padding: 0.35rem 0.9rem;
		font-size: 0.9rem;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.action:hover {
		background: #f3f6fa;
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

	.conversation {
		display: grid;
		gap: 0.5rem;
	}

	.conversation.grouped {
		border: 1px solid #cdddfc;
		border-radius: 10px;
		padding: 0.6rem 0.7rem;
		background: #f4f8fe;
	}

	.conv-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.4rem 1rem;
		padding: 0 0.2rem;
	}

	.conv-title {
		font-weight: 700;
		color: #1f5fb0;
	}

	.log-entry {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem 0.9rem;
		background: #fafafa;
		display: grid;
		gap: 0.5rem;
	}

	.grouped .log-entry {
		background: #fff;
	}

	.entry-head {
		display: grid;
		gap: 0.25rem;
	}

	.question {
		font-weight: 600;
		font-size: 1rem;
	}

	.turn-no {
		display: inline-block;
		min-width: 1.5em;
		margin-right: 0.3rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: #1f5fb0;
		color: #fff;
		font-size: 0.75rem;
		text-align: center;
		line-height: 1.5em;
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
		border-top: 1px solid #e3e3e3;
		padding-top: 0.75rem;
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
