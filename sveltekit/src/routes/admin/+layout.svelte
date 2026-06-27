<script lang="ts">
	import { asset } from '$app/paths';
	import AdminNavbar from '$lib/components/admin/AdminNavbar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<link rel="stylesheet" href={asset('/fonts/fontawesome-free-5.15.3-web/css/all.min.css')} />
</svelte:head>

<AdminNavbar breadcrumbs={data.breadcrumbs} />
<div class="page-content">{@render children()}</div>

<style>
	:global(main) {
		padding: 0 !important;
	}

	.page-content {
		padding: 20px;
	}
</style>
