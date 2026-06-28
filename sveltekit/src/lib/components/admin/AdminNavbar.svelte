<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AdminBreadcrumbs, { type AdminBreadcrumb } from './AdminBreadcrumbs.svelte';

	let { breadcrumbs }: { breadcrumbs: AdminBreadcrumb[] } = $props();

	const adminHref = resolve('/admin');
	const logoutHref = resolve('/logout');

	const handleLogout = () => {
		void invalidate('auth:user');
	};
</script>

<nav class="admin-nav">
	<div class="left">
		<a class="brand" href={adminHref}>EdTechRAG</a>
		<a class="home-link" href={adminHref} aria-label="Admin home" title="Admin home">
			<i class="fas fa-home" aria-hidden="true"></i>
			<span>Admin</span>
		</a>
		{#if breadcrumbs.length}
			<span class="separator" aria-hidden="true">/</span>
			<AdminBreadcrumbs {breadcrumbs} />
		{/if}
	</div>
	<form class="logout-form" method="POST" action={logoutHref} onsubmit={handleLogout}>
		<button class="logout" type="submit">Logout</button>
	</form>
</nav>

<style>
	.admin-nav {
		gap: 1rem;
		width: 100%;
		margin: 0;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}

	.left {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		min-width: 0;
	}

	.logout-form {
		margin: 0;
	}

	.brand,
	.home-link,
	.logout {
		color: white;
		text-decoration: none;
		white-space: nowrap;
	}

	.brand {
		font-weight: 700;
	}

	.home-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.6rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.12);
	}

	.logout {
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		cursor: pointer;
	}

	.separator {
		color: rgba(255, 255, 255, 0.5);
	}

	.brand:hover,
	.home-link:hover,
	.logout:hover {
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.admin-nav {
			align-items: flex-start;
			height: auto;
			min-height: 70px;
		}

		.left {
			flex-wrap: wrap;
		}
	}
</style>
