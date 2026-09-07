<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type UsageItem = PageData['items'][number];
	type ChatLogDetail = {
		id: number;
		repositoryUrl: string | null;
		endpoint: string | null;
		question: string | null;
		context: string | null;
		answer: string | null;
		username: string | null;
		history: unknown;
		source: string | null;
		termsAcceptedAt: string | null;
		usertermsUrl: string | null;
		createdAt: string;
	};

	const MAX_SERIES = 7; // slots 1–7 for repositories, slot 8 for "Other"
	const OTHER = 'Other';

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '—';
	const formatNumber = (value: number | null | undefined) =>
		typeof value === 'number' ? value.toLocaleString() : '0';
	const truncate = (value: string | null | undefined, length = 120) => {
		if (!value) return '—';
		return value.length > length ? `${value.slice(0, length)}…` : value;
	};
	// '/api/chat-parameter/[repoUrl]' → 'chat-parameter', '/admin/ragView/[repoUrl]' → 'admin/ragView'
	const endpointLabel = (endpoint: string | null) =>
		endpoint ? endpoint.replace(/^\/api\//, '').replace(/^\//, '').replace(/\/\[repoUrl\]$/, '') : '—';
	const repoLabel = (url: string) =>
		data.repositories.find((repo) => repo.repositoryUrl === url)?.name ?? url;

	const dayKey = (date: Date) =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

	// ── Time series: hour buckets (UTC) → local days, top repositories + Other ──
	const days = $derived.by(() => {
		const list: { key: string; date: Date }[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		for (let i = data.days - 1; i >= 0; i -= 1) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			list.push({ key: dayKey(date), date });
		}
		return list;
	});

	const series = $derived.by(() => {
		const totals = new Map<string, number>();
		for (const bucket of data.buckets) {
			totals.set(bucket.repositoryUrl, (totals.get(bucket.repositoryUrl) ?? 0) + bucket.count);
		}
		const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
		const named = ordered.slice(0, MAX_SERIES).map(([url, total]) => ({ key: url, total }));
		const rest = ordered.slice(MAX_SERIES);
		if (rest.length) {
			named.push({ key: OTHER, total: rest.reduce((sum, [, count]) => sum + count, 0) });
		}
		return named;
	});

	const seriesIndex = $derived(new Map(series.map((entry, index) => [entry.key, index])));

	const matrix = $derived.by(() => {
		// matrix[dayIndex][seriesIndex] = count
		const dayIndex = new Map(days.map((day, index) => [day.key, index]));
		const grid = days.map(() => series.map(() => 0));
		for (const bucket of data.buckets) {
			const di = dayIndex.get(dayKey(new Date(bucket.hour)));
			if (di === undefined) continue;
			const si = seriesIndex.get(bucket.repositoryUrl) ?? seriesIndex.get(OTHER);
			if (si === undefined) continue;
			grid[di][si] += bucket.count;
		}
		return grid;
	});

	const dayTotals = $derived(matrix.map((row) => row.reduce((sum, value) => sum + value, 0)));
	const rangeTotal = $derived(dayTotals.reduce((sum, value) => sum + value, 0));
	const activeRepos = $derived(data.repositories.filter((repo) => repo.inRange > 0).length);
	const rangeUsers = $derived(data.repositories.reduce((sum, repo) => sum + repo.users, 0));

	// ── Chart geometry ────────────────────────────────────────────────────────
	const W = 840;
	const H = 260;
	const M = { top: 12, right: 12, bottom: 28, left: 40 };
	const plotW = W - M.left - M.right;
	const plotH = H - M.top - M.bottom;
	const GAP = 2;

	const niceMax = (value: number) => {
		if (value <= 0) return 4;
		const magnitude = 10 ** Math.floor(Math.log10(value));
		const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value / 4) ?? 10;
		return Math.ceil(value / (step * magnitude)) * step * magnitude;
	};
	const yMax = $derived(niceMax(Math.max(0, ...dayTotals)));
	const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * yMax));
	const yScale = (value: number) => M.top + plotH - (value / yMax) * plotH;
	const slotW = $derived(plotW / Math.max(days.length, 1));
	const barW = $derived(Math.max(2, slotW - Math.max(GAP, slotW * 0.25)));
	const barX = (index: number) => M.left + index * slotW + (slotW - barW) / 2;
	// x labels: every day for a week, otherwise about six evenly spaced ones
	const labelEvery = $derived(Math.max(1, Math.round(days.length / 6)));
	const xLabel = (date: Date) =>
		date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

	// Top segment gets 4px rounded ends, inner segments stay square (the 2px gap separates them).
	const topRounded = (x: number, y: number, w: number, h: number) => {
		const r = Math.min(4, h, w / 2);
		return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
	};

	let hoverDay = $state<number | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let chartEl = $state<HTMLDivElement | null>(null);

	const onColumnHover = (index: number, event: PointerEvent) => {
		hoverDay = index;
		const rect = chartEl?.getBoundingClientRect();
		if (rect) {
			tooltipX = event.clientX - rect.left;
			tooltipY = event.clientY - rect.top;
		}
	};

	// ── Detail modal ──────────────────────────────────────────────────────────
	let detailDialog = $state<HTMLDialogElement | null>(null);
	let detail = $state<ChatLogDetail | null>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let showContext = $state(false);

	const openDetail = async (item: UsageItem) => {
		detail = null;
		detailError = null;
		showContext = false;
		detailLoading = true;
		detailDialog?.showModal();
		try {
			const res = await fetch(resolve(`/admin/last-100-usages/${item.id}`));
			if (!res.ok) throw new Error(`Failed to load chat log (${res.status})`);
			detail = (await res.json()) as ChatLogDetail;
		} catch (err) {
			console.error('Failed to load chat log detail', err);
			detailError = 'Failed to load chat log.';
		} finally {
			detailLoading = false;
		}
	};

	type HistoryMessage = { role: string; content: string };
	// History is stored as whatever the endpoint sent; render role/content pairs when
	// that is what it is, otherwise fall back to pretty-printed JSON.
	const historyMessages = (history: unknown): HistoryMessage[] | null => {
		if (!Array.isArray(history) || history.length === 0) return null;
		const messages: HistoryMessage[] = [];
		for (const entry of history) {
			if (!entry || typeof entry !== 'object') return null;
			const { role, content } = entry as Record<string, unknown>;
			if (typeof role !== 'string' || typeof content !== 'string') return null;
			messages.push({ role, content });
		}
		return messages;
	};

	const closeOnBackdrop = (event: MouseEvent) => {
		if (event.target === detailDialog) detailDialog?.close();
	};
</script>

<section class="usages">
	<header class="header">
		<div>
			<h1>Last 100 usages</h1>
			<p class="muted">
				Which chatbots are actually being used: the {formatNumber(data.items.length)} most recent chats and
				the usage over the selected range.
			</p>
		</div>
	</header>

	<div class="filters" role="group" aria-label="Time range">
		<span class="muted">Range</span>
		{#each data.rangeDays as range}
			<a class="preset" class:active={range === data.days} href={`?days=${range}`}>Last {range} days</a>
		{/each}
	</div>

	<div class="stats-grid">
		<div class="stat-card">
			<div class="label">Chats, last {data.days} days</div>
			<div class="value">{formatNumber(rangeTotal)}</div>
		</div>
		<div class="stat-card">
			<div class="label">Active chatbots</div>
			<div class="value">{formatNumber(activeRepos)} <span class="of">of {formatNumber(data.repositories.length)}</span></div>
		</div>
		<div class="stat-card">
			<div class="label">Distinct users</div>
			<div class="value">{formatNumber(rangeUsers)}</div>
		</div>
	</div>

	<section class="card">
		<h2>Chats per day</h2>
		{#if rangeTotal === 0}
			<p class="muted">No chats in the last {data.days} days.</p>
		{:else}
			<div class="chart" bind:this={chartEl}>
				<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chats per day for the last ${data.days} days`}>
					{#each yTicks as tick}
						<line class="grid" x1={M.left} x2={W - M.right} y1={yScale(tick)} y2={yScale(tick)} />
						<text class="axis" x={M.left - 6} y={yScale(tick)} text-anchor="end" dominant-baseline="middle">
							{formatNumber(tick)}
						</text>
					{/each}
					<line class="baseline" x1={M.left} x2={W - M.right} y1={yScale(0)} y2={yScale(0)} />

					{#each days as day, di}
						{@const x = barX(di)}
						{@const segments = matrix[di]}
						{@const lastVisible = segments.reduce((last, value, index) => (value > 0 ? index : last), -1)}
						<g class="column" class:dimmed={hoverDay !== null && hoverDay !== di}>
							{#each segments as value, si}
								{#if value > 0}
									{@const previous = segments.slice(0, si).reduce((sum, entry) => sum + entry, 0)}
									{@const y0 = yScale(previous)}
									{@const y1 = yScale(previous + value)}
									{@const gap = si === 0 ? 0 : GAP}
									{@const h = Math.max(0, y0 - y1 - gap)}
									{#if si === lastVisible}
										<path d={topRounded(x, y1, barW, h)} style={`fill: var(--series-${si + 1})`} />
									{:else}
										<rect {x} y={y1} width={barW} height={h} style={`fill: var(--series-${si + 1})`} />
									{/if}
								{/if}
							{/each}
						</g>
						{#if di % labelEvery === 0 || days.length <= 10}
							<text class="axis" x={x + barW / 2} y={H - 8} text-anchor="middle">{xLabel(day.date)}</text>
						{/if}
						<!-- hit target: the whole column, wider than the bar; keyboard readers get the same numbers from the tables -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<rect
							class="hit"
							x={M.left + di * slotW}
							y={M.top}
							width={slotW}
							height={plotH}
							onpointermove={(event) => onColumnHover(di, event)}
							onpointerleave={() => (hoverDay = null)}
						/>
					{/each}
				</svg>

				{#if hoverDay !== null}
					{@const day = days[hoverDay]}
					<div
						class="tooltip"
						style={`left: ${tooltipX}px; top: ${tooltipY}px; transform: translate(${tooltipX > 560 ? 'calc(-100% - 12px)' : '12px'}, -50%)`}
					>
						<div class="tooltip-title">
							{day.date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
							· <strong>{formatNumber(dayTotals[hoverDay])}</strong>
						</div>
						{#each series as entry, si}
							{#if matrix[hoverDay][si] > 0}
								<div class="tooltip-row">
									<span class="key" style={`background: var(--series-${si + 1})`}></span>
									<strong>{formatNumber(matrix[hoverDay][si])}</strong>
									<span class="muted">{entry.key === OTHER ? OTHER : repoLabel(entry.key)}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>

			<ul class="legend">
				{#each series as entry, si}
					<li>
						<span class="swatch" style={`background: var(--series-${si + 1})`}></span>
						<span>{entry.key === OTHER ? `${OTHER} (${data.repositories.filter((r) => r.inRange > 0).length - MAX_SERIES} chatbots)` : repoLabel(entry.key)}</span>
						<span class="muted">{formatNumber(entry.total)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card">
		<h2>Per chatbot</h2>
		{#if data.repositories.length === 0}
			<p class="muted">No chat logs yet.</p>
		{:else}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>Chatbot</th>
							<th>Repository</th>
							<th class="num">Last {data.days} days</th>
							<th class="num">Users</th>
							<th class="num">Total</th>
							<th>Last used</th>
						</tr>
					</thead>
					<tbody>
						{#each data.repositories as repo}
							{@const si = seriesIndex.get(repo.repositoryUrl)}
							<tr class:inactive={repo.inRange === 0}>
								<td>
									{#if si !== undefined}
										<span class="swatch" style={`background: var(--series-${si + 1})`}></span>
									{/if}
									{repo.name ?? '—'}
								</td>
								<td><code>{repo.repositoryUrl}</code></td>
								<td class="num">{formatNumber(repo.inRange)}</td>
								<td class="num">{formatNumber(repo.users)}</td>
								<td class="num">{formatNumber(repo.total)}</td>
								<td>{formatDate(repo.lastUsed)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="card">
		<h2>Most recent chats</h2>
		{#if data.items.length === 0}
			<p class="muted">No chat logs found.</p>
		{:else}
			<div class="table-wrapper">
				<table class="clickable">
					<thead>
						<tr>
							<th>Time</th>
							<th>Chatbot</th>
							<th>Endpoint</th>
							<th>User</th>
							<th>Question</th>
							<th>Answer</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each data.items as item}
							<tr onclick={() => openDetail(item)}>
								<td class="nowrap">{formatDate(item.createdAt)}</td>
								<td>{repoLabel(item.repositoryUrl)}</td>
								<td><code>{endpointLabel(item.endpoint)}</code></td>
								<td>{item.username ?? '—'}</td>
								<td class="text">{truncate(item.question)}</td>
								<td class="text muted">{truncate(item.answerPreview, 90)}</td>
								<td class="nowrap">
									{#if item.historyLength}
										<span class="pill" title="Messages in history">{item.historyLength} msg</span>
									{/if}
									{#if item.hasContext}
										<span class="pill" title="RAG context stored">ctx</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</section>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog class="modal" bind:this={detailDialog} onclick={closeOnBackdrop}>
	<div class="modal-body">
		{#if detailLoading}
			<p class="muted">Loading…</p>
		{:else if detailError}
			<p class="error">{detailError}</p>
		{:else if detail}
			<header class="detail-header">
				<div>
					<h2>Chat #{detail.id}</h2>
					<p class="muted">
						{formatDate(detail.createdAt)} · {detail.repositoryUrl ? repoLabel(detail.repositoryUrl) : '—'} ·
						<code>{endpointLabel(detail.endpoint)}</code>
					</p>
				</div>
				<button type="button" class="reload" onclick={() => detailDialog?.close()}>Close</button>
			</header>

			<dl class="meta">
				<dt>User</dt>
				<dd>{detail.username ?? '—'}</dd>
				<dt>Source</dt>
				<dd>{detail.source ?? '—'}</dd>
				<dt>Terms</dt>
				<dd>
					{#if detail.termsAcceptedAt}
						accepted {formatDate(detail.termsAcceptedAt)}{detail.usertermsUrl ? ` (${detail.usertermsUrl})` : ''}
					{:else}
						—
					{/if}
				</dd>
			</dl>

			{#if historyMessages(detail.history)}
				<h3>History</h3>
				<ol class="history">
					{#each historyMessages(detail.history) ?? [] as message}
						<li class={message.role}>
							<span class="role">{message.role}</span>
							<pre>{message.content}</pre>
						</li>
					{/each}
				</ol>
			{:else if detail.history !== null && detail.history !== undefined}
				<h3>History</h3>
				<pre class="block">{JSON.stringify(detail.history, null, 2)}</pre>
			{/if}

			<h3>Question</h3>
			<pre class="block">{detail.question ?? '—'}</pre>

			<h3>Answer</h3>
			<pre class="block">{detail.answer ?? '—'}</pre>

			{#if detail.context}
				<h3>
					RAG context
					<button type="button" class="reload small" onclick={() => (showContext = !showContext)}>
						{showContext ? 'Hide' : `Show (${formatNumber(detail.context.length)} chars)`}
					</button>
				</h3>
				{#if showContext}
					<pre class="block">{detail.context}</pre>
				{/if}
			{/if}
		{/if}
	</div>
</dialog>

<style>
	.usages {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		/* validated categorical palette (light surface), fixed order: never cycled */
		--series-1: #2a78d6;
		--series-2: #eb6834;
		--series-3: #1baf7a;
		--series-4: #eda100;
		--series-5: #e87ba4;
		--series-6: #008300;
		--series-7: #4a3aa7;
		--series-8: #e34948;
		--text-secondary: #666;
		--grid: #ececec;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
	}

	h1 {
		margin: 0;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}

	h3 {
		margin: 0.75rem 0 0.25rem;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.muted {
		color: var(--text-secondary);
		font-size: 0.95rem;
		margin: 0.25rem 0 0;
	}

	.filters {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.preset {
		border: 1px solid #d0d7de;
		background: #fff;
		border-radius: 6px;
		padding: 0.3rem 0.8rem;
		font-size: 0.9rem;
		color: #1f1f1f;
		text-decoration: none;
	}

	.preset.active {
		border-color: #1f7ae0;
		background: #1f7ae0;
		color: #fff;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.stat-card,
	.card {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		background: #fff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.stat-card .label {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-card .value {
		font-size: 1.5rem;
		font-weight: 600;
		color: #1f1f1f;
	}

	.stat-card .of {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--text-secondary);
	}

	/* chart */
	.chart {
		position: relative;
	}

	svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}

	.baseline {
		stroke: #c9c9c9;
		stroke-width: 1;
	}

	.axis {
		fill: var(--text-secondary);
		font-size: 11px;
	}

	.column {
		transition: opacity 0.1s ease;
	}

	.column.dimmed {
		opacity: 0.45;
	}

	.hit {
		fill: transparent;
		cursor: crosshair;
	}

	.tooltip {
		position: absolute;
		pointer-events: none;
		background: #fff;
		border: 1px solid #d0d7de;
		border-radius: 6px;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
		white-space: nowrap;
		z-index: 2;
	}

	.tooltip-title {
		margin-bottom: 0.25rem;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.tooltip-row .key {
		display: inline-block;
		width: 12px;
		height: 2px;
		border-radius: 1px;
	}

	.legend {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		font-size: 0.9rem;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 0.35rem;
		vertical-align: middle;
	}

	.legend .swatch {
		margin-right: 0;
	}

	/* tables */
	.table-wrapper {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}

	th,
	td {
		padding: 0.5rem 0.5rem;
		border-bottom: 1px solid #e3e3e3;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-weight: 600;
		background: #fafafa;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.nowrap {
		white-space: nowrap;
	}

	.text {
		max-width: 360px;
		word-break: break-word;
	}

	tr.inactive td {
		color: #999;
	}

	table.clickable tbody tr {
		cursor: pointer;
	}

	table.clickable tbody tr:hover {
		background: #f4f8fd;
	}

	code {
		font-size: 0.85rem;
	}

	.pill {
		display: inline-block;
		border: 1px solid #d0d7de;
		border-radius: 999px;
		padding: 0 0.45rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-right: 0.25rem;
	}

	.reload {
		border: 1px solid #d0d7de;
		background: #fff;
		border-radius: 6px;
		padding: 0.35rem 0.9rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.reload.small {
		padding: 0.1rem 0.6rem;
		font-size: 0.8rem;
	}

	.error {
		color: #b42318;
		font-size: 0.9rem;
		margin: 0;
	}

	/* modal */
	.modal {
		border: 1px solid #d0d7de;
		border-radius: 10px;
		padding: 0;
		width: min(860px, calc(100vw - 2rem));
		max-height: calc(100vh - 2rem);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}

	.modal-body {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.detail-header h2 {
		margin: 0;
	}

	.meta {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2rem 1rem;
		margin: 0.5rem 0 0;
		font-size: 0.9rem;
	}

	.meta dt {
		color: var(--text-secondary);
	}

	.meta dd {
		margin: 0;
		word-break: break-all;
	}

	pre {
		margin: 0;
		font-family: inherit;
		font-size: 0.9rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	pre.block {
		background: #f6f8fa;
		border: 1px solid #e3e3e3;
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
		max-height: 320px;
		overflow-y: auto;
	}

	.history {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.history li {
		border: 1px solid #e3e3e3;
		border-radius: 6px;
		padding: 0.45rem 0.7rem;
		background: #f6f8fa;
	}

	.history li.user {
		background: #eef5ff;
		border-color: #cfe0f7;
	}

	.history .role {
		display: block;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin-bottom: 0.15rem;
	}
</style>
