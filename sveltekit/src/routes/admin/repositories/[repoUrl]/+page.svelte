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
	let publicBaseUrl = data.config.github.publicBaseUrl;
	let webhookPath = data.config.github.webhookPath;
	$: if (form) {
		saving = false;
	}
	$: if (config) {
		publicBaseUrl = config.github.publicBaseUrl;
		webhookPath = config.github.webhookPath;
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
						href={resolve(`/admin/search-vectors/${encodeURIComponent(config.repositoryUrl)}`)}
					>
						Search vectors
					</a>
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

	<section class="panel">
		<div class="panel-head">
			<div>
				<h2>Configuration</h2>
				<p class="muted">Secrets are write-only. Leave password fields empty to keep existing values.</p>
			</div>
		</div>

		<form method="POST" action="?/saveConfig" class="config-form" on:submit={() => (saving = true)}>
			<div class="field-grid">
				<label>
					Repository name
					<input name="name" value={config.repositoryName} required />
				</label>
				<label>
					GitHub repository path
					<input name="repository_path" placeholder="owner/repository" value={config.github.repositoryPath} />
				</label>
			</div>

			<div class="section-band">
				<h3>Active pages</h3>
				<div class="checkbox-grid">
					<label class="checkbox-label">
						<input
							type="checkbox"
							name="activeSimplePage"
							checked={config.access.activeSimplePage}
						/>
						<span>Simple page</span>
					</label>
					<label class="checkbox-label">
						<input
							type="checkbox"
							name="activeSinglePage"
							checked={config.access.activeSinglePage}
						/>
						<span>Single page</span>
					</label>
					<label class="checkbox-label">
						<input
							type="checkbox"
							name="activeParameterPage"
							checked={config.access.activeParameterPage}
						/>
						<span>Parameter page</span>
					</label>
					<label class="checkbox-label">
						<input type="checkbox" name="activeEmbedApi" checked={config.access.activeEmbedApi} />
						<span>/api/embed widget API</span>
					</label>
				</div>
				<label>
					Allowed embed host regex
					<input
						name="embedAllowedHostRegex"
						value={config.access.embedAllowedHostRegex}
						placeholder="^moodle\\.example\\.org$"
					/>
				</label>
				<p class="muted">The embed regex matches only the browser Origin hostname.</p>
			</div>

			<div class="section-band">
				<h3>GitHub2EdTechRAG</h3>
				<div class="field-grid">
					<label>
						Bridge public base URL
						<input name="github2_public_base_url" bind:value={publicBaseUrl}  />
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
						placeholder={config.github.hasSharedSecret ? 'Already set; enter a new value to overwrite' : 'Required for new repositories'}
						
					/>
				</label>
				<p class="readonly">GitHub webhook URL: <code>{webhookUrl}</code></p>
			</div>

			<div class="section-band">
				<h3>LLM</h3>
				<div class="field-grid">
					<label>
						OpenAI-compatible API key
						<input
							type="password"
							name="OPENAI_API_KEY"
							placeholder={config.llm.hasOpenAiApiKey ? 'Already set; enter a new value to overwrite' : 'Required for new repositories'}
							autocomplete="new-password"
						/>
					</label>
					<label>
						Chat API base
						<input name="OPENAI_API_BASE" value={config.llm.openAiApiBase} required />
					</label>
					<label>
						Chat model
						<input name="CHAT_MODEL" value={config.llm.chatModel} required />
					</label>
					<label>
						API language
						<select name="API_LANGUAGE">
							<option value="chat/completions" selected={config.llm.apiLanguage === 'chat/completions'}>
								chat/completions
							</option>
							<option value="responses" selected={config.llm.apiLanguage === 'responses'}>responses</option>
						</select>
					</label>
					<label>
						Reasoning effort
						<select name="reasoning_effort">
							{#each ['none', 'minimal', 'low', 'medium', 'high'] as option}
								<option value={option} selected={config.llm.reasoningEffort === option}>{option}</option>
							{/each}
						</select>
					</label>
					<label>
						Text verbosity
						<select name="text_verbosity">
							{#each ['low', 'medium', 'high'] as option}
								<option value={option} selected={config.llm.textVerbosity === option}>{option}</option>
							{/each}
						</select>
					</label>
				</div>
			</div>

			<div class="section-band">
				<h3>Embeddings</h3>
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
						<input name="OPENAI_API_BASE_EMBEDDING" value={config.llm.embeddingBase} required />
					</label>
					<label>
						Embedding model
						<input name="EMBEDDING_MODEL" value={config.llm.embeddingModel} required />
					</label>
				</div>
			</div>

		

			<div class="section-band">
				<h3>RAG</h3>
				<div class="field-grid">
					<label>
						Chunk size
						<input name="chunkSize" type="number" min="1" value={config.rag.chunkSize ?? ''} placeholder="4000" />
					</label>
					<label>
						Chunk overlap
						<input name="chunkOverlap" type="number" min="0" value={config.rag.chunkOverlap ?? ''} placeholder="150" />
					</label>
					<label>
						Number of documents
						<input name="numberDocuments" type="number" min="1" value={config.rag.numberDocuments} placeholder="4" />
					</label>
					<label>
						Metadata tags
						<input name="metaTags" value={config.rag.metaTags.join(', ')} placeholder="url, title, folder" />
					</label>
				</div>
				<label>
					System prompt
					<textarea name="systemprompt" rows="6">{config.rag.systemprompt}</textarea>
				</label>
			</div>

			<div class="actions">
				<button type="submit" disabled={saving}>{saving ? 'Saving...' : repositoryExists ? 'Save config' : 'Create repository'}</button>
			</div>
		</form>
	</section>
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
	.panel-head,
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
	.panel-head {
		justify-content: space-between;
		align-items: flex-start;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		margin-top: 0.15rem;
	}

	h2 {
		font-size: 1.1rem;
	}

	h3 {
		font-size: 1rem;
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

	.panel {
		display: grid;
		gap: 0.9rem;
		padding: 0.85rem;
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		background: #fafafa;
	}

	.config-form {
		display: grid;
		gap: 0.85rem;
	}

	.section-band {
		display: grid;
		gap: 0.65rem;
		padding-top: 0.85rem;
		border-top: 1px solid #e3e3e3;
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
