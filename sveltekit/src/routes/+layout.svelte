<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
  import './fonts.css';


</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<main>
{@render children()}
</main>
<footer>
	<a href='https://www.tugraz.at/go/impressum' target="_blank">Impressum</a>
	<a href="https://www.tugraz.at/go/flaait" target="_blank">FLAAIT Group at LLT at TU Graz</a>
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
	nav a, footer a {
		color: white;
	}
	main {
		padding: 20px;
		min-height: calc(100dvh - 70px);
	}
	nav, footer {
		display: flex;
		position: sticky;
		width: 100%;
		justify-content: space-between;
		background-color: #F70146;
		color: white;
		padding: 20px;
		height: 70px;

	}
	footer {
		background-color: #263B48;
		height: 70px;
	}
</style>