<script lang="ts">
	import { resolve } from '$app/paths';

	export type AdminBreadcrumb = {
		label: string;
		href?: string;
	};

	let { breadcrumbs }: { breadcrumbs: AdminBreadcrumb[] } = $props();

	const resolveHref = (href: string) => (resolve as (path: string) => string)(href);
</script>

{#if breadcrumbs.length}
	<ol class="breadcrumbs" aria-label="Breadcrumb">
		{#each breadcrumbs as breadcrumb, index}
			<li>
				{#if breadcrumb.href && index < breadcrumbs.length - 1}
					<a href={resolveHref(breadcrumb.href)}>{breadcrumb.label}</a>
				{:else}
					<span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
						{breadcrumb.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		color: rgba(255, 255, 255, 0.78);
		font-size: 0.95rem;
	}

	li {
		display: flex;
		align-items: center;
		min-width: 0;
	}

	li:not(:last-child)::after {
		content: "/";
		margin-left: 0.45rem;
		color: rgba(255, 255, 255, 0.5);
	}

	a,
	span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a {
		color: white;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
