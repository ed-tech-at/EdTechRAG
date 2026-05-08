<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { env } from '$env/dynamic/public';

	let { children } = $props();
	import './fonts.css';

	const defaultFooterHtml =
		'<a href="https://github.com/ed-tech-at/edtechrag" target="_blank">Code @ GitHub</a>';
	const footerHtml = `${env.PUBLIC_FOOTER_HTML || ''}${defaultFooterHtml}`;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<main>
{@render children()}
</main>
<footer>
	{@html footerHtml}
</footer>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		font-family: 'Jost', sans-serif;
	}
	:global(*) {
		box-sizing: border-box;
	}

	footer {
		background-color: #263B48;
		height: 70px;
	}
	:global(nav a),
	footer :global(a) {
		color: white;
	}
	main {
		padding: 20px;
		min-height: calc(100dvh - 70px);
	}
	:global(nav),
	footer {
		display: flex;
		position: sticky;
		width: 100%;
		justify-content: space-between;
		background-color: #39515f;
		color: white;
		padding: 20px;
		height: 70px;

	}
	footer {
		background-color: #263B48;
		height: 70px;
	}
</style>
