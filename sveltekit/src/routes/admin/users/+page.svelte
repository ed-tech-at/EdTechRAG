<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	const PREVIEW_LIMIT = 8;
	const EXAMPLE_PAGE_SIZE = 10;

	type Repository = PageData['repositories'][number];

	let createAllowRegex = '';
	let createExampleUrls: string[] = [];
	let createExampleSearch = '';
	let createExampleLimit = EXAMPLE_PAGE_SIZE;
	let userAllowRegex: Record<string, string> = {};
	let userExampleUrls: Record<string, string[]> = {};
	let userExampleSearch: Record<string, string> = {};
	let userExampleLimit: Record<string, number> = {};

	const formatDate = (value: string | Date | null | undefined) =>
		value ? new Date(value).toLocaleString() : '-';

	const formMessage = (key: 'createMessage' | 'updateMessage' | 'passwordMessage') =>
		form && typeof form === 'object' && key in form ? String(form[key] ?? '') : '';

	const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const repoTail = (repository: Repository) => {
		const cleaned = repository.url.replace(/\/$/, '').replace(/\.git$/, '');
		return cleaned.split('/').filter(Boolean).pop() ?? repository.url;
	};

	const repoPatternSource = (repository: Repository) => repoTail(repository).trim();

	const commonPrefix = (values: string[]) => {
		if (values.length === 0) return '';
		let prefix = values[0];
		for (const value of values.slice(1)) {
			while (prefix && !value.toLowerCase().startsWith(prefix.toLowerCase())) {
				prefix = prefix.slice(0, -1);
			}
		}
		return prefix;
	};

	const regexFromExamples = (repositoryUrls: string[]) => {
		const repositories = repositoryUrls
			.map((url) => data.repositories.find((repository) => repository.url === url))
			.filter((repository): repository is Repository => Boolean(repository));
		const sources = repositories.map(repoPatternSource).filter(Boolean);

		if (sources.length === 0) return '';

		if (sources.length === 1) {
			return escapeRegex(sources[0]);
		}

		const prefix = commonPrefix(sources);
		if (prefix.length >= 3) {
			return `${escapeRegex(prefix)}.*`;
		}

		return `(${sources.map(escapeRegex).join('|')})`;
	};

	const regexError = (pattern: string) => {
		if (!pattern.trim()) return '';
		try {
			new RegExp(pattern);
			return '';
		} catch {
			return 'Invalid regex';
		}
	};

	const regexForPreview = (pattern: string) => {
		if (!pattern.trim()) return null;
		try {
			return new RegExp(pattern);
		} catch {
			return null;
		}
	};

	const matchingRepositories = (pattern: string) => {
		const regex = regexForPreview(pattern);
		return regex ? data.repositories.filter((repository) => regex.test(repository.url)) : [];
	};

	const missingRepositories = (pattern: string) => {
		const matches = new Set(matchingRepositories(pattern).map((repository) => repository.url));
		return data.repositories.filter((repository) => !matches.has(repository.url));
	};

	const shortUrl = (url: string) => (url.length > 68 ? `...${url.slice(-65)}` : url);

	const filteredExampleRepositories = (query: string) => {
		const search = query.trim().toLowerCase();
		if (!search) return data.repositories;

		return data.repositories.filter(
			(repository) =>
				repository.name.toLowerCase().includes(search) ||
				repository.url.toLowerCase().includes(search) ||
				repoTail(repository).toLowerCase().includes(search)
		);
	};

	const visibleExampleRepositories = (query: string, limit: number) =>
		filteredExampleRepositories(query).slice(0, limit);

	const moreExampleCount = (query: string, limit: number) =>
		Math.max(0, filteredExampleRepositories(query).length - limit);

	const updateCreateExampleSearch = (event: Event) => {
		createExampleSearch = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		createExampleLimit = EXAMPLE_PAGE_SIZE;
	};

	const updateUserExampleSearch = (userId: string, event: Event) => {
		const value = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		userExampleSearch = { ...userExampleSearch, [userId]: value };
		userExampleLimit = { ...userExampleLimit, [userId]: EXAMPLE_PAGE_SIZE };
	};

	const toggleUrl = (urls: string[], url: string) =>
		urls.includes(url) ? urls.filter((item) => item !== url) : [...urls, url];

	const toggleCreateExample = (url: string) => {
		createExampleUrls = toggleUrl(createExampleUrls, url);
		createAllowRegex = regexFromExamples(createExampleUrls);
	};

	const toggleUserExample = (userId: string, url: string) => {
		const nextExamples = toggleUrl(userExampleUrls[userId] ?? [], url);
		userExampleUrls = { ...userExampleUrls, [userId]: nextExamples };
		userAllowRegex = { ...userAllowRegex, [userId]: regexFromExamples(nextExamples) };
	};

	const updateUserRegex = (userId: string, event: Event) => {
		const value = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		userAllowRegex = { ...userAllowRegex, [userId]: value };
	};

	const showMoreUserExamples = (userId: string) => {
		userExampleLimit = {
			...userExampleLimit,
			[userId]: (userExampleLimit[userId] ?? EXAMPLE_PAGE_SIZE) + EXAMPLE_PAGE_SIZE
		};
	};

	$: {
		let changed = false;
		const nextUserRegex = { ...userAllowRegex };
		const nextUserExamples = { ...userExampleUrls };
		const nextUserSearch = { ...userExampleSearch };
		const nextUserLimit = { ...userExampleLimit };

		for (const user of data.users) {
			if (!(user.id in nextUserRegex)) {
				nextUserRegex[user.id] = user.allowRegex;
				changed = true;
			}
			if (!(user.id in nextUserExamples)) {
				nextUserExamples[user.id] = [];
				changed = true;
			}
			if (!(user.id in nextUserSearch)) {
				nextUserSearch[user.id] = '';
				changed = true;
			}
			if (!(user.id in nextUserLimit)) {
				nextUserLimit[user.id] = EXAMPLE_PAGE_SIZE;
				changed = true;
			}
		}

		if (changed) {
			userAllowRegex = nextUserRegex;
			userExampleUrls = nextUserExamples;
			userExampleSearch = nextUserSearch;
			userExampleLimit = nextUserLimit;
		}
	}
</script>

<section class="users-page">
	<header class="page-header">
		<h1>User management</h1>
	</header>

	<section class="create-panel" aria-labelledby="create-user-heading">
		<h2 id="create-user-heading">Add user</h2>
		{#if formMessage('createMessage')}
			<p class="notice error">{formMessage('createMessage')}</p>
		{/if}
		<form method="POST" action="?/createUser" class="create-form">
			<label>
				<span>Email</span>
				<input name="email" type="email" autocomplete="username" required />
			</label>
			<label>
				<span>Password</span>
				<input name="password" type="password" autocomplete="new-password" required />
			</label>
			<label>
				<span>Role</span>
				<select name="role">
					{#each data.roleOptions as role}
						<option value={role.value} selected={role.value === 3}>{role.label}</option>
					{/each}
				</select>
			</label>
			<div class="repo-editor">
				<div class="repo-editor-header">
					<h3>Repository access</h3>
					<label class="regex-field">
						<span>Repository URL regex</span>
						<input
							name="allowRegex"
							bind:value={createAllowRegex}
							placeholder="mooc.*"
							class:invalid={Boolean(regexError(createAllowRegex))}
						/>
					</label>
				</div>
				{#if regexError(createAllowRegex)}
					<p class="field-error">{regexError(createAllowRegex)}</p>
				{/if}
				<div class="builder-grid">
					<section class="example-panel">
						<div class="example-heading">
							<h3>Build from examples</h3>
							<span>{createExampleUrls.length} selected</span>
						</div>
						<input
							class="example-search"
							value={createExampleSearch}
							placeholder="Search repositories"
							on:input={updateCreateExampleSearch}
						/>
						<div class="example-list">
							{#each visibleExampleRepositories(createExampleSearch, createExampleLimit) as repository}
								<label class="check-row">
									<input
										type="checkbox"
										checked={createExampleUrls.includes(repository.url)}
										on:change={() => toggleCreateExample(repository.url)}
									/>
									<span>
										<strong>{repository.name}</strong>
										<small>{shortUrl(repository.url)}</small>
									</span>
								</label>
							{/each}
						</div>
						{#if moreExampleCount(createExampleSearch, createExampleLimit) > 0}
							<button
								class="show-more"
								type="button"
								on:click={() => (createExampleLimit += EXAMPLE_PAGE_SIZE)}
							>
								Show 10 more ({moreExampleCount(createExampleSearch, createExampleLimit)} left)
							</button>
						{/if}
					</section>
					<section class="preview-panel">
						<div class="preview-header">
							<h3>Matching repositories</h3>
							<span>{matchingRepositories(createAllowRegex).length} / {data.repositories.length}</span>
						</div>
						{#if !createAllowRegex.trim()}
							<p class="muted">No regex set.</p>
						{:else if regexError(createAllowRegex)}
							<p class="muted">Fix the regex to preview matches.</p>
						{:else if matchingRepositories(createAllowRegex).length === 0}
							<p class="muted">No repositories match.</p>
						{:else}
							<div class="match-list">
								{#each matchingRepositories(createAllowRegex).slice(0, PREVIEW_LIMIT) as repository}
									<div class="match-row">
										<strong>{repository.name}</strong>
										<small>{shortUrl(repository.url)}</small>
									</div>
								{/each}
							</div>
							{#if matchingRepositories(createAllowRegex).length > PREVIEW_LIMIT}
								<p class="muted">{matchingRepositories(createAllowRegex).length - PREVIEW_LIMIT} more</p>
							{/if}
						{/if}
						<p class="muted">Not matching: {missingRepositories(createAllowRegex).length}</p>
					</section>
				</div>
			</div>
			<button type="submit">Add user</button>
		</form>
	</section>

	{#if formMessage('updateMessage')}
		<p class="notice error">{formMessage('updateMessage')}</p>
	{/if}
	{#if formMessage('passwordMessage')}
		<p class="notice error">{formMessage('passwordMessage')}</p>
	{/if}

	{#if data.users.length === 0}
		<p class="muted">No users found.</p>
	{:else}
		<div class="user-list">
			{#each data.users as user}
				<article class:deleted={user.isDeleted} class="user-card">
					<header class="user-summary">
						<div>
							<h2>{user.email}</h2>
							<p class="muted">Created {formatDate(user.createdAt)}</p>
						</div>
						<div class="status-block">
							<span class="role-pill">{user.roleLabel}</span>
							<span class:inactive={user.isDeleted} class="state-pill">
								{user.isDeleted ? 'Deleted' : 'Active'}
							</span>
							<span class="repo-count">{user.accessSummary}</span>
							{#if !user.canEdit}
								<span class="locked-pill">Read only</span>
							{/if}
						</div>
					</header>

					{#if user.canEdit}
						<form method="POST" action="?/updateUser" class="edit-form">
							<input type="hidden" name="userId" value={user.id} />
							<div class="edit-grid">
								<label>
									<span>Role</span>
									<select name="role">
										{#each data.roleOptions as role}
											<option value={role.value} selected={role.value === user.role}>{role.label}</option>
										{/each}
									</select>
								</label>
								<label>
									<span>Repository URL regex</span>
									<input
										name="allowRegex"
										value={userAllowRegex[user.id] ?? ''}
										class:invalid={Boolean(regexError(userAllowRegex[user.id] ?? ''))}
										placeholder="mooc.*"
										on:input={(event) => updateUserRegex(user.id, event)}
									/>
								</label>
							</div>

							{#if regexError(userAllowRegex[user.id] ?? '')}
								<p class="field-error">{regexError(userAllowRegex[user.id] ?? '')}</p>
							{/if}

							<div class="builder-grid">
								<section class="example-panel">
									<div class="example-heading">
										<h3>Build from examples</h3>
										<span>{(userExampleUrls[user.id] ?? []).length} selected</span>
									</div>
									<input
										class="example-search"
										value={userExampleSearch[user.id] ?? ''}
										placeholder="Search repositories"
										on:input={(event) => updateUserExampleSearch(user.id, event)}
									/>
									<div class="example-list">
										{#each visibleExampleRepositories(userExampleSearch[user.id] ?? '', userExampleLimit[user.id] ?? EXAMPLE_PAGE_SIZE) as repository}
											<label class="check-row">
												<input
													type="checkbox"
													checked={(userExampleUrls[user.id] ?? []).includes(repository.url)}
													on:change={() => toggleUserExample(user.id, repository.url)}
												/>
												<span>
													<strong>{repository.name}</strong>
													<small>{shortUrl(repository.url)}</small>
												</span>
											</label>
										{/each}
									</div>
									{#if moreExampleCount(userExampleSearch[user.id] ?? '', userExampleLimit[user.id] ?? EXAMPLE_PAGE_SIZE) > 0}
										<button class="show-more" type="button" on:click={() => showMoreUserExamples(user.id)}>
											Show 10 more ({moreExampleCount(userExampleSearch[user.id] ?? '', userExampleLimit[user.id] ?? EXAMPLE_PAGE_SIZE)}
											left)
										</button>
									{/if}
								</section>
								<section class="preview-panel">
									<div class="preview-header">
										<h3>Matching repositories</h3>
										<span>
											{matchingRepositories(userAllowRegex[user.id] ?? '').length} /
											{data.repositories.length}
										</span>
									</div>
									{#if !(userAllowRegex[user.id] ?? '').trim()}
										<p class="muted">No regex set.</p>
									{:else if regexError(userAllowRegex[user.id] ?? '')}
										<p class="muted">Fix the regex to preview matches.</p>
									{:else if matchingRepositories(userAllowRegex[user.id] ?? '').length === 0}
										<p class="muted">No repositories match.</p>
									{:else}
										<div class="match-list">
											{#each matchingRepositories(userAllowRegex[user.id] ?? '').slice(0, PREVIEW_LIMIT) as repository}
												<div class="match-row">
													<strong>{repository.name}</strong>
													<small>{shortUrl(repository.url)}</small>
												</div>
											{/each}
										</div>
										{#if matchingRepositories(userAllowRegex[user.id] ?? '').length > PREVIEW_LIMIT}
											<p class="muted">
												{matchingRepositories(userAllowRegex[user.id] ?? '').length - PREVIEW_LIMIT}
												more
											</p>
										{/if}
									{/if}
									<p class="muted">
										Not matching: {missingRepositories(userAllowRegex[user.id] ?? '').length}
									</p>
								</section>
							</div>

							<footer class="actions">
								<button type="submit">Save access</button>
							</footer>
						</form>

						<div class="secondary-actions">
							<form method="POST" action="?/changePassword" class="password-form">
								<input type="hidden" name="userId" value={user.id} />
								<label>
									<span>New password</span>
									<input name="password" type="password" autocomplete="new-password" required />
								</label>
								<button type="submit">Change password</button>
							</form>

							<form method="POST" action="?/toggleDeleted">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="isDeleted" value={user.isDeleted ? 0 : 1} />
								<button class="secondary" type="submit">
									{user.isDeleted ? 'Restore user' : 'Delete user'}
								</button>
							</form>
						</div>
					{:else}
						<div class="repo-editor readonly">
							<div class="repo-editor-header">
								<h3>Repository access</h3>
								<code>{user.allowRegex || 'No regex set'}</code>
							</div>
							<section class="preview-panel">
								<div class="preview-header">
									<h3>Matching repositories</h3>
									<span>{matchingRepositories(user.allowRegex).length} / {data.repositories.length}</span>
								</div>
								{#if !user.allowRegex.trim()}
									<p class="muted">No regex set.</p>
								{:else if user.hasInvalidAllowRegex}
									<p class="field-error">Invalid saved regex.</p>
								{:else if matchingRepositories(user.allowRegex).length === 0}
									<p class="muted">No repositories match.</p>
								{:else}
									<div class="match-list">
										{#each matchingRepositories(user.allowRegex).slice(0, PREVIEW_LIMIT) as repository}
											<div class="match-row">
												<strong>{repository.name}</strong>
												<small>{shortUrl(repository.url)}</small>
											</div>
										{/each}
									</div>
								{/if}
								<p class="muted">Not matching: {missingRepositories(user.allowRegex).length}</p>
							</section>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.users-page {
		display: grid;
		gap: 1rem;
	}

	.page-header,
	.user-summary,
	.repo-editor-header,
	.actions,
	.secondary-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		font-size: 1.8rem;
	}

	h2 {
		font-size: 1.15rem;
	}

	h3 {
		font-size: 0.95rem;
	}

	.create-panel,
	.user-card {
		border: 1px solid #dddddd;
		border-radius: 6px;
		padding: 1rem;
		background: #ffffff;
	}

	.create-panel,
	.create-form,
	.edit-form,
	.user-list,
	.user-card {
		display: grid;
		gap: 1rem;
	}

	.create-form {
		grid-template-columns: repeat(3, minmax(12rem, 1fr));
		align-items: end;
	}

	.create-form .repo-editor {
		grid-column: 1 / -1;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-weight: 600;
		color: #333333;
	}

	input,
	select,
	button {
		font: inherit;
	}

	input,
	select {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid #cfcfcf;
		border-radius: 4px;
		background: white;
	}

	input.invalid {
		border-color: #b42318;
		background: #fff5f5;
	}

	button {
		padding: 0.55rem 0.8rem;
		border: 1px solid #1f7ae0;
		border-radius: 4px;
		background: #1f7ae0;
		color: white;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	button.secondary {
		border-color: #9a3412;
		background: #9a3412;
	}

	button.show-more {
		justify-self: start;
		border-color: #c9d6e5;
		background: #f7fbff;
		color: #174f91;
	}

	.notice {
		padding: 0.7rem 0.85rem;
		border-radius: 6px;
	}

	.notice.error {
		background: #fff0f0;
		border: 1px solid #f2c7c7;
		color: #8a1c1c;
	}

	.muted {
		color: #666666;
		font-size: 0.95rem;
	}

	.status-block {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.role-pill,
	.state-pill,
	.repo-count,
	.locked-pill {
		display: inline-flex;
		align-items: center;
		min-height: 1.8rem;
		border-radius: 4px;
		padding: 0.25rem 0.45rem;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.role-pill {
		background: #e8f1fd;
		color: #174f91;
	}

	.state-pill {
		background: #e9f8ef;
		color: #176a35;
	}

	.state-pill.inactive {
		background: #f4f4f4;
		color: #555555;
	}

	.repo-count {
		background: #f3f0ff;
		color: #4b2d83;
	}

	.locked-pill {
		background: #fff6db;
		color: #7a4b00;
	}

	.user-card.deleted {
		background: #fafafa;
	}

	.builder-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.example-panel,
	.preview-panel {
		display: grid;
		gap: 0.5rem;
		align-content: start;
	}

	.example-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.example-heading span {
		color: #666666;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.example-search {
		min-width: 0;
	}

	.field-error {
		color: #8a1c1c;
		font-weight: 700;
		font-size: 0.9rem;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.edit-grid {
		display: grid;
		grid-template-columns: minmax(10rem, 14rem) minmax(16rem, 1fr);
		gap: 0.75rem;
	}

	.example-list,
	.match-list {
		display: grid;
		gap: 0.35rem;
	}

	.example-list {
		max-height: 18rem;
		overflow: auto;
		padding-right: 0.25rem;
	}

	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.6rem;
		border: 1px solid #e1e1e1;
		border-radius: 4px;
		font-weight: 400;
	}

	.check-row input {
		width: auto;
		margin-top: 0.2rem;
	}

	.check-row span {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.check-row small {
		color: #666666;
		overflow-wrap: anywhere;
	}

	.match-row {
		display: grid;
		gap: 0.1rem;
		padding: 0.45rem 0.55rem;
		border: 1px solid #dfe8df;
		border-radius: 4px;
		background: #f7fbf5;
	}

	.match-row small {
		color: #526052;
		overflow-wrap: anywhere;
	}

	.regex-field {
		min-width: min(34rem, 100%);
	}

	.repo-editor.readonly code {
		overflow-wrap: anywhere;
		padding: 0.35rem 0.45rem;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.password-form {
		display: flex;
		align-items: end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.password-form label {
		min-width: min(18rem, 100%);
	}

	@media (max-width: 760px) {
		.create-form,
		.builder-grid,
		.edit-grid {
			grid-template-columns: 1fr;
		}

		.status-block {
			justify-content: flex-start;
		}
	}
</style>
