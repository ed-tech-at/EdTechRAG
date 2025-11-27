<script lang="ts">
	import type { ActionData } from './$types';

	export let form: ActionData;
	let username = '';
	let password = '';
</script>

<section class="page">
	<h1>Login</h1>
	{#if form?.message}
		<p class={`notice ${form?.success ? 'success' : 'error'}`}>{form.message}</p>
	{/if}
	<form method="POST" class="login-form">
		<label>
			Username
			<input name="username" bind:value={username} required />
		</label>
		<label>
			Password
			<input name="password" type="password" bind:value={password} required />
		</label>
		<button type="submit">Login</button>
	</form>
</section>

<style>
	.page {
		max-width: 420px;
		margin: 2rem auto;
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.login-form {
		display: grid;
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-weight: 600;
	}

	input {
		width: 100%;
		padding: 0.5rem;
		border-radius: 6px;
		border: 1px solid #cfd6e0;
		font-size: 1rem;
	}

	button {
		padding: 0.55rem 0.95rem;
		border-radius: 6px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	.notice {
		padding: 0.6rem;
		border-radius: 6px;
	}

	.notice.success {
		background: #e7f6ec;
		color: #1b6b3a;
		border: 1px solid #b7e0c2;
	}

	.notice.error {
		background: #fff0f0;
		color: #8a1c1c;
		border: 1px solid #f2c7c7;
	}
</style>
