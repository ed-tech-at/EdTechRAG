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
	let gitlabApiUrlValue = data.config.gitlab.apiUrl;
	let gitlabRefValue = data.config.gitlab.ref;
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
	let queryRewriteEnabledValue = data.config.rag.queryRewriteEnabled;
	let queryRewriteModelValue = data.config.rag.queryRewriteModel;
	let queryRewriteCountValue = data.config.rag.queryRewriteCount ?? '';
	let queryRewriteDocsPerSearchValue = data.config.rag.queryRewriteDocsPerSearch ?? '';
	let queryRewriteIncludeHistoryValue = data.config.rag.queryRewriteIncludeHistory;
	let queryRewriteContextValue = data.config.rag.queryRewriteContext;
	let queryRewriteApiLanguageValue = data.config.rag.queryRewriteApiLanguage;
	let queryRewriteReasoningEffortValue = data.config.rag.queryRewriteReasoningEffort;
	let queryRewriteTextVerbosityValue = data.config.rag.queryRewriteTextVerbosity;
	let requireUsertermsValue = data.config.rag.requireUserterms;
	let usertermsDurationMonthsValue = data.config.rag.usertermsDurationMonths ?? '';
	let activeSearchApiValue = data.config.access.activeSearchApi;
	let searchModeValue = data.config.rag.searchMode;
	let searchResultLimitValue = data.config.rag.searchResultLimit ?? '';
	let searchSnippetLengthValue = data.config.rag.searchSnippetLength ?? '';
	let aiOverviewEnabledValue = data.config.rag.aiOverviewEnabled;
	let aiOverviewModelValue = data.config.rag.aiOverviewModel;
	let aiOverviewSystempromptValue = data.config.rag.aiOverviewSystemprompt;
	let aiOverviewContextValue = data.config.rag.aiOverviewContext;
	let aiOverviewDocumentsValue = data.config.rag.aiOverviewDocuments ?? '';
	let aiOverviewApiLanguageValue = data.config.rag.aiOverviewApiLanguage;
	let aiOverviewReasoningEffortValue = data.config.rag.aiOverviewReasoningEffort;
	let aiOverviewTextVerbosityValue = data.config.rag.aiOverviewTextVerbosity;
	let aiOverviewRequireUsertermsValue = data.config.rag.aiOverviewRequireUserterms;
	let aiOverviewUsertermsDurationMonthsValue =
		data.config.rag.aiOverviewUsertermsDurationMonths ?? '';

	$: if (form) {
		saving = false;
	}
	$: if (config) {
		repositoryName = config.repositoryName;
		repositoryPath = config.github.repositoryPath;
		publicBaseUrl = config.github.publicBaseUrl;
		webhookPath = config.github.webhookPath;
		gitlabApiUrlValue = config.gitlab.apiUrl;
		gitlabRefValue = config.gitlab.ref;
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
		queryRewriteEnabledValue = config.rag.queryRewriteEnabled;
		queryRewriteModelValue = config.rag.queryRewriteModel;
		queryRewriteCountValue = config.rag.queryRewriteCount ?? '';
		queryRewriteDocsPerSearchValue = config.rag.queryRewriteDocsPerSearch ?? '';
		queryRewriteIncludeHistoryValue = config.rag.queryRewriteIncludeHistory;
		queryRewriteContextValue = config.rag.queryRewriteContext;
		queryRewriteApiLanguageValue = config.rag.queryRewriteApiLanguage;
		queryRewriteReasoningEffortValue = config.rag.queryRewriteReasoningEffort;
		queryRewriteTextVerbosityValue = config.rag.queryRewriteTextVerbosity;
		requireUsertermsValue = config.rag.requireUserterms;
		usertermsDurationMonthsValue = config.rag.usertermsDurationMonths ?? '';
		activeSearchApiValue = config.access.activeSearchApi;
		searchModeValue = config.rag.searchMode;
		searchResultLimitValue = config.rag.searchResultLimit ?? '';
		searchSnippetLengthValue = config.rag.searchSnippetLength ?? '';
		aiOverviewEnabledValue = config.rag.aiOverviewEnabled;
		aiOverviewModelValue = config.rag.aiOverviewModel;
		aiOverviewSystempromptValue = config.rag.aiOverviewSystemprompt;
		aiOverviewContextValue = config.rag.aiOverviewContext;
		aiOverviewDocumentsValue = config.rag.aiOverviewDocuments ?? '';
		aiOverviewApiLanguageValue = config.rag.aiOverviewApiLanguage;
		aiOverviewReasoningEffortValue = config.rag.aiOverviewReasoningEffort;
		aiOverviewTextVerbosityValue = config.rag.aiOverviewTextVerbosity;
		aiOverviewRequireUsertermsValue = config.rag.aiOverviewRequireUserterms;
		aiOverviewUsertermsDurationMonthsValue = config.rag.aiOverviewUsertermsDurationMonths ?? '';
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

		<section class="config-section" aria-labelledby="gitlab-heading">
			<div class="section-head">
				<h2 id="gitlab-heading">GitLab2EdTechRAG</h2>
				<p class="muted">GitLab API access and webhook bridge settings for repository updates.</p>
			</div>
			<div class="field-grid">
				<label>
					GitLab API URL
					<input
						name="gitlab_api_url"
						bind:value={gitlabApiUrlValue}
						placeholder="https://gitlab.example.org/api/v4/projects/123/repository/files/"
					/>
				</label>
				<label>
					Git ref / branch
					<input name="ref" bind:value={gitlabRefValue} placeholder="main" />
				</label>
			</div>
			<label>
				GitLab private token
				<input
					type="password"
					name="PRIVATE-TOKEN"
					placeholder={config.gitlab.hasPrivateToken ? 'Already set; enter a new value to overwrite' : 'Optional'}
					autocomplete="new-password"
				/>
			</label>
			<label>
				GitLab shared secret for GitLab2EdTechRAG
				<input
					type="password"
					name="GitLab2EdTechRAG_SHARED_SECRET"
					placeholder={config.gitlab.hasSharedSecret ? 'Already set; enter a new value to overwrite' : 'Optional'}
				/>
			</label>
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
					<input name="metaTags" bind:value={metaTagsValue} placeholder="* or url, title, folder" />
					<span class="muted" style="font-weight: 400;">
						Which metadata reaches the chatbot and the search results. <code>*</code> takes every
						key a document actually has &mdash; ingest already stores all of them, so a new fact in
						the source appears without being listed here. Bookkeeping keys of the pipeline
						(<code>fetch_url</code>, <code>path</code>, <code>headSha</code> &hellip;) are never
						emitted. Empty means no metadata <em>and no URL</em>, so a search result has nothing to
						link to.
					</span>
				</label>
			</div>
			<label>
				System prompt
				<textarea name="systemprompt" rows="6" bind:value={systempromptValue}></textarea>
			</label>

			<div class="section-head" style="margin-top: 0.5rem;">
				<h3 id="query-rewrite-heading" style="margin: 0;">Query rewrite</h3>
				<p class="muted">
					Rewrite the user question into several optimized search queries before retrieval.
					Each query is searched separately and results are merged (deduplicated by chunk).
				</p>
			</div>
			<div class="field-grid">
				<label class="checkbox-label">
					<input type="checkbox" name="queryRewriteEnabled" bind:checked={queryRewriteEnabledValue} />
					<span>Enable query rewrite</span>
				</label>
				<label class="checkbox-label">
					<input
						type="checkbox"
						name="queryRewriteIncludeHistory"
						bind:checked={queryRewriteIncludeHistoryValue}
					/>
					<span>Include chat history in rewrite prompt</span>
				</label>
			</div>
			<div class="field-grid">
				<label>
					Rewrite model
					<input
						name="queryRewriteModel"
						bind:value={queryRewriteModelValue}
						placeholder={chatModelValue || 'chat model'}
					/>
				</label>
				<label>
					Number of searches
					<input
						name="queryRewriteCount"
						type="number"
						min="1"
						bind:value={queryRewriteCountValue}
						placeholder="3"
					/>
				</label>
				<label>
					Documents per search
					<input
						name="queryRewriteDocsPerSearch"
						type="number"
						min="1"
						bind:value={queryRewriteDocsPerSearchValue}
						placeholder={String(numberDocumentsValue ?? 4)}
					/>
				</label>
			</div>
			<div class="field-grid">
				<label>
					API language
					<select name="queryRewriteApiLanguage" bind:value={queryRewriteApiLanguageValue}>
						<option value="">Default (chat setting)</option>
						<option value="chat/completions">chat/completions</option>
						<option value="responses">responses</option>
					</select>
				</label>
				<label>
					Reasoning effort
					<select name="queryRewriteReasoningEffort" bind:value={queryRewriteReasoningEffortValue}>
						<option value="">Default (chat setting)</option>
						{#each ['none', 'minimal', 'low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<label>
					Text verbosity
					<select name="queryRewriteTextVerbosity" bind:value={queryRewriteTextVerbosityValue}>
						<option value="">Default (chat setting)</option>
						{#each ['low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			</div>
			<label>
				Rewrite context
				<textarea
					name="queryRewriteContext"
					rows="2"
					bind:value={queryRewriteContextValue}
					placeholder="e.g. You are at TU Graz."
				></textarea>
				<span class="muted" style="font-weight: 400;">
					Optional background given to the rewrite model to steer the generated searches.
				</span>
			</label>

			<div class="section-head" style="margin-top: 0.5rem;">
				<h3 id="userterms-heading" style="margin: 0;">User terms</h3>
				<p class="muted">
					Rejects /api/embed chat requests that carry no accepted user-terms timestamp.
					Requires the <code>block_chatbot</code> widget with <code>data-userterms-url</code>;
					the older <code>moodle-block_chatbot</code> embed sends no timestamp and will receive
					403 for every request.
				</p>
			</div>
			<div class="field-grid">
				<label class="checkbox-label">
					<input type="checkbox" name="requireUserterms" bind:checked={requireUsertermsValue} />
					<span>Require accepted user terms</span>
				</label>
				<label>
					Validity in months
					<input
						name="usertermsDurationMonths"
						type="number"
						min="1"
						max="60"
						bind:value={usertermsDurationMonthsValue}
						placeholder="12"
					/>
				</label>
			</div>
			<p class="muted">
				The timestamp comes from the visitor's browser, so it is an attestation and not a proof
				&mdash; the allowed embed host regex stays the outer gate.
			</p>

			<div class="section-head" style="margin-top: 0.5rem;">
				<h3 id="search-heading" style="margin: 0;">Search results</h3>
				<p class="muted">
					The search embed (<code>static/embed/search</code>) searches this repository and lists
					documents, not chunks: several chunks of the same page collapse into one result, the best
					score wins. The target URL comes from <code>meta.url</code> &mdash; make sure
					<code>Meta tags</code> above is not empty, otherwise no URL is emitted.
				</p>
			</div>
			<div class="field-grid">
				<label class="checkbox-label">
					<input type="checkbox" name="activeSearchApi" bind:checked={activeSearchApiValue} />
					<span>Enable search API</span>
				</label>
				<label>
					How to search
					<select name="searchMode" bind:value={searchModeValue}>
						<option value="fulltext">Database only (no embeddings)</option>
						<option value="vector">Semantic (embeds every query)</option>
					</select>
				</label>
				<label>
					Results shown
					<input
						name="searchResultLimit"
						type="number"
						min="1"
						bind:value={searchResultLimitValue}
						placeholder="10"
					/>
				</label>
				<label>
					Snippet length
					<input
						name="searchSnippetLength"
						type="number"
						min="40"
						bind:value={searchSnippetLengthValue}
						placeholder="320"
					/>
				</label>
			</div>
			<p class="muted">
				<strong>Database only</strong> is the default: one Postgres full-text query per search, no
				embedding call and no LLM call. It matches the words that were typed, with prefix matching,
				so <code>noten</code> finds <code>Notenexport</code>. <strong>Semantic</strong> embeds every
				visitor query instead &mdash; better for questions phrased differently from the text, and one
				API call per search.
			</p>
			<p class="muted">
				The AI overview below always retrieves semantically, whatever is chosen here, and shows its
				own matches above this list &mdash; but only after the visitor consented, because that is
				where the embedding call happens.
			</p>
			<p class="muted">
				The search API needs the same <code>Allowed embed host regex</code> as the chat embed, but
				its own switch: a site can have the search without the chatbot.
			</p>

			<div class="section-head" style="margin-top: 0.5rem;">
				<h3 id="ai-overview-heading" style="margin: 0;">AI overview</h3>
				<p class="muted">
					A streamed summary above the search results. The results themselves appear immediately;
					the overview only after the visitor accepted the terms &mdash; and it can be withdrawn
					again in the widget. Off by default, so updating the code never starts spending tokens on
					its own.
				</p>
			</div>
			<div class="field-grid">
				<label class="checkbox-label">
					<input type="checkbox" name="aiOverviewEnabled" bind:checked={aiOverviewEnabledValue} />
					<span>Enable AI overview</span>
				</label>
				<label class="checkbox-label">
					<input
						type="checkbox"
						name="aiOverviewRequireUserterms"
						bind:checked={aiOverviewRequireUsertermsValue}
					/>
					<span>Require accepted terms</span>
				</label>
				<label>
					Consent validity in months
					<input
						name="aiOverviewUsertermsDurationMonths"
						type="number"
						min="1"
						max="60"
						bind:value={aiOverviewUsertermsDurationMonthsValue}
						placeholder={String(usertermsDurationMonthsValue || 12)}
					/>
				</label>
			</div>
			<div class="field-grid">
				<label>
					Overview model
					<input
						name="aiOverviewModel"
						bind:value={aiOverviewModelValue}
						placeholder={chatModelValue || 'chat model'}
					/>
				</label>
				<label>
					Documents summarised
					<input
						name="aiOverviewDocuments"
						type="number"
						min="1"
						bind:value={aiOverviewDocumentsValue}
						placeholder={String(numberDocumentsValue ?? 4)}
					/>
				</label>
			</div>
			<div class="field-grid">
				<label>
					API language
					<select name="aiOverviewApiLanguage" bind:value={aiOverviewApiLanguageValue}>
						<option value="">Default (chat setting)</option>
						<option value="chat/completions">chat/completions</option>
						<option value="responses">responses</option>
					</select>
				</label>
				<label>
					Reasoning effort
					<select name="aiOverviewReasoningEffort" bind:value={aiOverviewReasoningEffortValue}>
						<option value="">Default (chat setting)</option>
						{#each ['none', 'minimal', 'low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<label>
					Text verbosity
					<select name="aiOverviewTextVerbosity" bind:value={aiOverviewTextVerbosityValue}>
						<option value="">Default (chat setting)</option>
						{#each ['low', 'medium', 'high'] as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			</div>
			<label>
				Overview system prompt
				<textarea name="aiOverviewSystemprompt" rows="4" bind:value={aiOverviewSystempromptValue}
				></textarea>
				<span class="muted" style="font-weight: 400;">
					Empty falls back to a built-in prompt that answers from the context only and cites the
					source URLs. Deliberately not the chat system prompt: a search overview is a short
					summary, not a conversation. What you write here replaces the WORDING only - the output
					format (Markdown, sources as [label](url), no bare URLs) is appended either way, because
					the embed renders exactly those constructs and nothing else.
				</span>
			</label>
			<label>
				Overview context
				<textarea
					name="aiOverviewContext"
					rows="2"
					bind:value={aiOverviewContextValue}
					placeholder="e.g. You are answering for TU Graz teaching staff."
				></textarea>
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
