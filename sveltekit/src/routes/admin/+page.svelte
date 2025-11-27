<script lang="ts">
	const links = [
		{ href: '/admin/DataFile', label: 'Data files' },
		{ href: '/admin/repositories', label: 'Repositories' },
		{ href: '/admin/ragView', label: 'RAG VIEW' }
	];
</script>

<section class="admin-home">
	<h1>Admin</h1>
	<ul>
		{#each links as link}
			<li>
				<a class="link" href={link.href}>{link.label}</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.admin-home {
		display: grid;
		gap: 0.75rem;
		max-width: 480px;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.35rem;
	}

	.link {
		color: #1f7ae0;
		text-decoration: none;
		font-weight: 600;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>
