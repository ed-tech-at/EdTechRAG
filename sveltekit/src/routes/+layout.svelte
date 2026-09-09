<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { env } from '$env/dynamic/public';
	import { page } from '$app/state';

	let { children } = $props();
	import './fonts.css';

	/* The footer is admin-authored HTML, complete with its own <footer> element
	   (colours, padding and links included). A page may supply its own via
	   `footerHtml` in its load data (the webview does, per repository); otherwise
	   the instance-wide PUBLIC_FOOTER_HTML applies, and without that an empty
	   <footer></footer>. */
	const DEFAULT_FOOTER_HTML = '<footer></footer>';
	const footerHtml = $derived(
		(typeof page.data.footerHtml === 'string' && page.data.footerHtml.trim()
			? page.data.footerHtml
			: env.PUBLIC_FOOTER_HTML?.trim()) || DEFAULT_FOOTER_HTML
	);

	/* Measured so pages can size themselves to the viewport minus the footer. */
	let footerHeight = $state(0);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<main style="--footer-height: {footerHeight}px">
{@render children()}
</main>
<div class="footer-slot" bind:clientHeight={footerHeight}>
	{@html footerHtml}
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		font-family: 'Jost', sans-serif;
	}
	:global(*) {
		box-sizing: border-box;
	}

	:global(nav a) {
		color: white;
	}
	main {
		padding: 20px;
		min-height: calc(100dvh - var(--footer-height, 0px));
	}
	:global(nav) {
		display: flex;
		position: sticky;
		width: 100%;
		justify-content: space-between;
		background-color: #39515f;
		color: white;
		padding: 20px;
		height: 70px;
	}
</style>
