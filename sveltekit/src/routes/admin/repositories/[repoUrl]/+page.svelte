<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';

	export let data: PageData;
	export let form: ActionData;

	$: fallbackConfig = data.config;
	$: submittedConfig =
		form && typeof form === 'object' && 'config' in form
			? (form as { config?: typeof fallbackConfig }).config
			: undefined;
	$: config = submittedConfig ?? fallbackConfig;
	$: repositoryExists =
		form && typeof form === 'object' && 'repositoryExists' in form
			? Boolean((form as { repositoryExists?: boolean }).repositoryExists)
			: data.repositoryExists;
	$: configMessage =
		form && typeof form === 'object' && 'configSaved' in form
			? ((form as { message?: string }).message ?? '')
			: '';
	$: formMessage =
		form && typeof form === 'object' && !('configSaved' in form)
			? ((form as { message?: string }).message ?? '')
			: '';
	$: formSuccess =
		form && typeof form === 'object' && 'success' in form
			? Boolean((form as { success?: boolean }).success)
			: false;
	let saving = false;
	let confirmingDelete = false;
	const handleDeleteClick = (event: MouseEvent) => {
		if (!confirmingDelete) {
			event.preventDefault();
			confirmingDelete = true;
		}
	};

	let repositoryName = data.config.repositoryName;
	let repositoryPath = data.config.github.repositoryPath;
	let publicBaseUrl = data.config.github.publicBaseUrl;
	let webhookPath = data.config.github.webhookPath;
	let embedAllowedHostRegexValue = data.config.access.embedAllowedHostRegex;
	let activeSimplePageValue = data.config.access.activeSimplePage;
	let activeSinglePageValue = data.config.access.activeSinglePage;
	let activeParameterPageValue = data.config.access.activeParameterPage;
	let activeEmbedApiValue = data.config.access.activeEmbedApi;
	let openAiApiBaseValue = data.config.llm.openAiApiBase;
	let chatModelValue = data.config.llm.chatModel;
	let apiLanguageValue = data.config.llm.apiLanguage;
	let reasoningEffortValue = data.config.llm.reasoningEffort;
	let textVerbosityValue = data.config.llm.textVerbosity;
	let embeddingBaseValue = data.config.llm.embeddingBase;
	let embeddingModelValue = data.config.llm.embeddingModel;
	let chunkSizeValue = data.config.rag.chunkSize ?? '';
	let chunkOverlapValue = data.config.rag.chunkOverlap ?? '';
	let numberDocumentsValue = data.config.rag.numberDocuments;
	let metaTagsValue = data.config.rag.metaTags.join(', ');
	let systempromptValue = data.config.rag.systemprompt;

	$: if (form) {
		saving = false;
	}
	$: if (config) {
		repositoryName = config.repositoryName;
		repositoryPath = config.github.repositoryPath;
		publicBaseUrl = config.github.publicBaseUrl;
		webhookPath = config.github.webhookPath;
		embedAllowedHostRegexValue = config.access.embedAllowedHostRegex;
		activeSimplePageValue = config.access.activeSimplePage;
		activeSinglePageValue = config.access.activeSinglePage;
		activeParameterPageValue = config.access.activeParameterPage;
		activeEmbedApiValue = config.access.activeEmbedApi;
		openAiApiBaseValue = config.llm.openAiApiBase;
		chatModelValue = config.llm.chatModel;
		apiLanguageValue = config.llm.apiLanguage;
		reasoningEffortValue = config.llm.reasoningEffort;
		textVerbosityValue = config.llm.textVerbosity;
		embeddingBaseValue = config.llm.embeddingBase;
		embeddingModelValue = config.llm.embeddingModel;
		chunkSizeValue = config.rag.chunkSize ?? '';
		chunkOverlapValue = config.rag.chunkOverlap ?? '';
		numberDocumentsValue = config.rag.numberDocuments;
		metaTagsValue = config.rag.metaTags.join(', ');
		systempromptValue = config.rag.systemprompt;
	}
	$: webhookUrl = webhookPath.trim()
		? `${publicBaseUrl.replace(/\/$/, '')}/webhook?path=${encodeURIComponent(webhookPath.trim())}`
		: `${publicBaseUrl.replace(/\/$/, '')}/webhook`;
</script>

<section class="page">
	<header class="header">
		<a class="link" href={resolve('/admin/repositories')}>Back to repositories</a>
		<div class="title-row">
			<div>
				<p class="eyebrow">{repositoryExists ? 'Repository config' : 'Create repository'}</p>
				<h1>{config.repositoryName}</h1>
				<p class="muted">EdTechRAG URL: {config.repositoryUrl}</p>
			</div>
			{#if repositoryExists}
				<div class="header-actions">
					
					<a
						class="secondary-button"
						href={resolve(`/admin/repositories/${encodeURIComponent(config.repositoryUrl)}/files`)}
					>
						View files
					</a>
				</div>
			{/if}
		</div>
		{#if configMessage}
			<p class="notice success">{configMessage}</p>
		{:else if formMessage}
			<p class={`notice ${formSuccess ? 'success' : 'error'}`}>{formMessage}</p>
		{/if}
	</header>

	<form
		method="POST"
		action="?/saveConfig"
		id="repository-config-form"
		class="config-form"
		on:submit={() => (saving = true)}
	>
		<p class="form-note">Secrets are write-only. Leave password fields empty to keep existing values.</p>

		<section class="config-section" aria-labelledby="configuration-heading">
			<div class="section-head">
				<h2 id="configuration-heading">Configuration</h2>
				<p class="muted">Repository identity and source mapping.</p>
			</div>
			<div class="field-grid">
				<label>
					Repository name
					<input name="name" bind:value={repositoryName} />
				</label>
				<label>
					GitHub repository path
					<input name="repository_path" placeholder="owner/repository" bind:value={repositoryPath} />
				</label>
			</div>
		</section>

		<section class="config-section" aria-labelledby="access-heading">
			<div class="section-head">
				<h2 id="access-heading">Access</h2>
				<p class="muted">Public pages and embed API availability.</p>
			</div>
			<div class="checkbox-grid">
				<label class="checkbox-label">
					<input type="checkbox" name="activeSimplePage" bind:checked={activeSimplePageValue} />
					<span>Simple page</span>
				</label>
				<label class="checkbox-label">
					<input type="checkbox" name="activeSinglePage" bind:checked={activeSinglePageValue} />
					<span>Single page</span>
				</label>
				<label class="checkbox-label">
					<input type="checkbox" name="activeParameterPage" bind:checked={activeParameterPageValue} />
					<span>Parameter page</span>
				</label>
				<label class="checkbox-label">
					<input type="checkbox" name="activeEmbedApi" bind:checked={activeEmbedApiValue} />
					<span>/api/embed widget API</span>
				</label>
			</div>
			<label>
				Allowed embed host regex
				<input
					name="embedAllowedHostRegex"
					bind:value={embedAllowedHostRegexValue}
					placeholder="^moodle\\.example\\.org$"
				/>
			</label>
			<p class="muted">The embed regex matches only the browser Origin hostname.</p>
		</section>

		<section class="config-section" aria-labelledby="bridge-heading">
			<div class="section-head">
				<h2 id="bridge-heading">GitHub2EdTechRAG</h2>
				<p class="muted">Webhook bridge settings for repository updates.</p>
			</div>
			<div class="field-grid">
				<label>
					Bridge public base URL
					<input name="github2_public_base_url" bind:value={publicBaseUrl} />
				</label>
				<label>
					Mounted repo path
					<input
						name="github2_webhook_path"
						bind:value={webhookPath}
						placeholder="optional; e.g. my-project"
					/>
				</label>
			</div>
			<label>
				Github shared secret for Github2EdTechRAG
				<input
					type="password"
					name="Github2EdTechRAG_SHARED_SECRET"
					placeholder={config.github.hasSharedSecret ? 'Already set; enter a new value to overwrite' : 'Optional'}
				/>
			</label>
			<p class="readonly">GitHub webhook URL: <code>{webhookUrl}</code></p>
		</section>

		<section class="config-section" aria-labelledby="llm-heading">
			<div class="section-head">
				<h2 id="llm-heading">LLM</h2>
				<p class="muted">Chat model provider and generation settings.</p>
			</div>
			<div class="field-grid">
				<label>
					OpenAI-compatible API key
					<input
						type="password"
						name="OPENAI_API_KEY"
						placeholder={config.llm.hasOpenAiApiKey ? 'Already set; enter a new value to overwrite' : 'Optional'}
						autocomplete="new-password"
					/>
				</label>
				<label>
					Chat API base
					<input name="OPENAI_API_BASE" bind:value={openAiApiBaseValue} />
				</label>
				<label>
					Chat model
					<input name="CHAT_MODEL" bind:value={chatModelValue} />
				</label>
				<label>
					API language
					<select name="API_LANGUAGE" bind:value={apiLanguageValue}>
						<option value="chat/completions">chat/completions</option>
						<option value="responses">responses</option>
					</select>
				</label>
				<label>
					Reasoning effort
					<select name="reasoning_effort" bind:value={reasoningEffortValue}>
						{#each ['none', 'minimal', 'low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<label>
					Text verbosity
					<select name="text_verbosity" bind:value={textVerbosityValue}>
						{#each ['low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			</div>
		</section>

		<section class="config-section" aria-labelledby="embeddings-heading">
			<div class="section-head">
				<h2 id="embeddings-heading">Embeddings</h2>
				<p class="muted">Embedding model provider used for vector search.</p>
			</div>
			<div class="field-grid">
				<label>
					Embedding API key
					<input
						type="password"
						name="OPENAI_API_KEY_EMBEDDING"
						placeholder={config.llm.hasEmbeddingApiKey ? 'Already set; enter a new value to overwrite' : 'Optional; falls back to LLM API key'}
						autocomplete="new-password"
					/>
				</label>
				<label>
					Embedding API base
					<input name="OPENAI_API_BASE_EMBEDDING" bind:value={embeddingBaseValue} />
				</label>
				<label>
					Embedding model
					<input name="EMBEDDING_MODEL" bind:value={embeddingModelValue} />
				</label>
			</div>
		</section>

		<section class="config-section" aria-labelledby="rag-heading">
			<div class="section-head">
				<h2 id="rag-heading">RAG</h2>
				<p class="muted">Retrieval chunking, document count, metadata, and prompt.</p>
			</div>
			<div class="field-grid">
				<label>
					Chunk size
					<input name="chunkSize" type="number" min="1" bind:value={chunkSizeValue} placeholder="4000" />
				</label>
				<label>
					Chunk overlap
					<input name="chunkOverlap" type="number" min="0" bind:value={chunkOverlapValue} placeholder="150" />
				</label>
				<label>
					Number of documents
					<input name="numberDocuments" type="number" min="1" bind:value={numberDocumentsValue} placeholder="4" />
				</label>
				<label>
					Metadata tags
					<input name="metaTags" bind:value={metaTagsValue} placeholder="url, title, folder" />
				</label>
			</div>
			<label>
				System prompt
				<textarea name="systemprompt" rows="6" bind:value={systempromptValue}></textarea>
			</label>
		</section>

	</form>

	{#if repositoryExists}
		<form method="POST" action="?/deleteRepository" id="delete-repository-form" class="display-contents"></form>
	{/if}

	<div class="actions">
		<button type="submit" form="repository-config-form" disabled={saving}>
			{saving ? 'Saving...' : repositoryExists ? 'Save config' : 'Create repository'}
		</button>
		{#if repositoryExists && data.canManageUsers}
			<button
				type="submit"
				form="delete-repository-form"
				class="delete-button"
				class:confirming={confirmingDelete}
				on:click={handleDeleteClick}
			>
				{confirmingDelete ? 'Delete Repository Really!' : 'Delete Repository'}
			</button>
		{/if}
	</div>
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.header {
		display: grid;
		gap: 0.75rem;
	}

	.title-row,
	.section-head,
	.actions,
	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.header-actions {
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.title-row,
	.section-head {
		justify-content: space-between;
		align-items: flex-start;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		margin-top: 0.15rem;
	}

	h2 {
		font-size: 1.1rem;
	}

	.eyebrow {
		color: #666;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0;
		font-weight: 700;
	}

	.link {
		color: #1f7ae0;
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.muted {
		color: #666;
	}

	.notice {
		padding: 0.65rem 0.85rem;
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

	.config-form {
		display: grid;
		gap: 1rem;
	}

	.form-note {
		padding: 0.75rem 0;
		border-top: 1px solid #e3e3e3;
		border-bottom: 1px solid #e3e3e3;
		color: #666;
	}

	.config-section {
		display: grid;
		gap: 0.85rem;
		padding: 1rem 0;
		border-bottom: 1px solid #e3e3e3;
	}

	.section-head {
		flex-wrap: wrap;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 0.5rem 0.75rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
		color: #333;
		font-weight: 600;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
	}

	input,
	select,
	textarea {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #d0d0d0;
		font: inherit;
		font-weight: 400;
		background: white;
	}

	input[type='checkbox'] {
		width: auto;
	}

	textarea {
		resize: vertical;
	}

	button,
	.secondary-button {
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #1f7ae0;
		background: #1f7ae0;
		color: white;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
	}

	button:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.display-contents {
		display: contents;
	}

	.delete-button {
		border-color: #d0342c;
		background: white;
		color: #d0342c;
	}

	.delete-button.confirming {
		background: #d0342c;
		color: white;
	}

	.readonly {
		padding: 0.55rem;
		background: white;
		border: 1px solid #e3e3e3;
		border-radius: 6px;
		overflow-wrap: anywhere;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

</style>
