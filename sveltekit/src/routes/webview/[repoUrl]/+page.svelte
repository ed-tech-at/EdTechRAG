<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { renderMarkdownWithBlankTargets } from '$lib/markdown';

	export let data: PageData;

	let prompt = '';
	let loading = false;
	let errorMessage = '';
	let messages: Array<{
		role: 'user' | 'assistant' | 'search';
		content: string;
		html?: string;
		queries?: string[];
	}> = [];
	const decoder = new TextDecoder();
	const searchStart = '__EDTECH_SEARCH_START__\n';
	const searchEnd = '\n__EDTECH_SEARCH_END__\n';

	/* -- User-terms consent --------------------------------------------------
	 * Same attestation model as the embeds: the acceptance lives in the visitor's
	 * browser and expires after the configured months. A fixed 30-day month
	 * mirrors the server-side MONTH_MS in $lib/ragContext, so both sides agree
	 * at the expiry boundary.
	 */
	const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
	const termsKey = `edtechrag-webview-${data.repositoryUrl}`;
	let termsAccepted = !data.webview.requireUserterms;

	const termsValid = (): boolean => {
		try {
			const raw = localStorage.getItem(termsKey);
			if (!raw) return false;
			const parsed = JSON.parse(raw) as { acceptedAt?: string };
			const acceptedAt = Date.parse(parsed?.acceptedAt ?? '');
			if (!Number.isFinite(acceptedAt)) return false;
			return Date.now() - acceptedAt < data.webview.usertermsDurationMonths * MONTH_MS;
		} catch {
			return false;
		}
	};

	const acceptTerms = () => {
		try {
			localStorage.setItem(termsKey, JSON.stringify({ acceptedAt: new Date().toISOString() }));
		} catch {
			/* Storage unavailable (private mode): the acceptance holds for this visit only. */
		}
		termsAccepted = true;
	};

	const revokeTerms = () => {
		try {
			localStorage.removeItem(termsKey);
		} catch {
			/* ignore */
		}
		termsAccepted = false;
	};

	onMount(() => {
		if (data.webview.requireUserterms) {
			termsAccepted = termsValid();
		}
	});

	/* -- Fullscreen ----------------------------------------------------------
	 * Two independent modes: the whole page via the Fullscreen API, and the
	 * composer text field as an expanded overlay for writing longer questions.
	 */
	let isFullscreen = false;
	let composerExpanded = false;

	const toggleFullscreen = async () => {
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await document.documentElement.requestFullscreen();
			}
		} catch {
			/* Fullscreen not permitted (e.g. inside an iframe without allowfullscreen). */
		}
	};

	const send = async () => {
		if (!termsAccepted) return;
		if (!prompt.trim()) {
			errorMessage = 'Bitte geben Sie eine Frage ein.';
			return;
		}

		errorMessage = '';
		composerExpanded = false;
		const nextPrompt = prompt.trim();
		prompt = '';
		loading = true;

		const history = messages.map((message) => ({
			role: message.role,
			content: message.content
		}));

		messages = [...messages, { role: 'user', content: nextPrompt }];

		try {
			let assistantIndex = messages.length;
			messages = [...messages, { role: 'assistant', content: '', html: '' }];

			const res = await fetch(resolve(`/api/chat/${encodeURIComponent(data.repositoryUrl ?? '')}`), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: nextPrompt, history })
			});

			if (!res.ok || !res.body) {
				throw new Error('Anfrage fehlgeschlagen');
			}

			const reader = res.body.getReader();
			let buffer = '';
			let rawAnswer = '';
			let done = false;
			let searchDone = false;

			while (!done) {
				const chunk = await reader.read();
				done = chunk.done;
				const text = decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
				if (!text && !done) continue;
				buffer += text;

				// Optional "search" block (query-rewrite bubbles), only present when enabled.
				if (!searchDone) {
					if (buffer.startsWith(searchStart)) {
						const endIndex = buffer.indexOf(searchEnd);
						if (endIndex === -1) continue;
						const payload = buffer.slice(searchStart.length, endIndex);
						let queries: string[] = [];
						try {
							const parsed = JSON.parse(payload);
							if (Array.isArray(parsed)) queries = parsed.filter((q) => typeof q === 'string');
						} catch {
							/* ignore malformed payload */
						}
						// Insert the search bubble just before the assistant bubble.
						messages = [
							...messages.slice(0, assistantIndex),
							{ role: 'search', content: '', queries },
							...messages.slice(assistantIndex)
						];
						assistantIndex += 1;
						buffer = buffer.slice(endIndex + searchEnd.length);
						searchDone = true;
					} else if (buffer.length > 0 && searchStart.startsWith(buffer)) {
						continue; // buffer is still a prefix of the marker; wait for more
					} else {
						searchDone = true; // no search block present
					}
				}

				if (buffer) {
					rawAnswer += buffer;
					buffer = '';
				}
				messages = messages.map((message, index) =>
					index === assistantIndex
						? {
								role: 'assistant',
								content: rawAnswer,
								html: renderMarkdownWithBlankTargets(rawAnswer)
						  }
						: message
				);
			}

			setTimeout(() => {
				const el = document.querySelector('.messages') as HTMLElement | null;
				if (el) {
					el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
				}
			}, 0);
		} catch (err) {
			if (messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content) {
				messages = messages.slice(0, -1);
			}
			errorMessage = err instanceof Error ? err.message : 'Anfrage fehlgeschlagen';
		} finally {
			loading = false;
		}
	};
</script>

<svelte:document on:fullscreenchange={() => (isFullscreen = Boolean(document.fullscreenElement))} />

<svelte:head>
	<title>{data.repositoryName}</title>
</svelte:head>

<section class="page">
	<header class="topbar">
		<h1>{data.repositoryName}</h1>
		<button class="ghost-button" type="button" on:click={toggleFullscreen}>
			{isFullscreen ? '⤡ Vollbild beenden' : '⤢ Vollbild'}
		</button>
	</header>

	{#if data.webview.introHtml}
		<!-- Admin-authored HTML from the repository config (may contain <img> logos). -->
		<div class="intro">{@html data.webview.introHtml}</div>
	{/if}

	{#if !termsAccepted}
		<div class="terms-panel">
			<p>
				Bevor Sie den Chat nutzen können, lesen und akzeptieren Sie bitte die
				{#if data.webview.usertermsUrl}
					<a href={data.webview.usertermsUrl} target="_blank" rel="noopener noreferrer"
						>Benutzerbedingungen</a
					>.
				{:else}
					Benutzerbedingungen.
				{/if}
			</p>
			<button type="button" on:click={acceptTerms}>Benutzerbedingungen akzeptieren</button>
		</div>
	{:else}
		<div class="messages">
			{#if messages.length === 0}
				<p class="muted empty">Stellen Sie eine Frage, um den Chat zu starten.</p>
			{/if}
			{#each messages as message}
				<div class="bubble {message.role}">
					{#if message.role === 'search'}
						<div class="search-bubbles">
							{#each message.queries ?? [] as q}
								<span class="search-chip">🔍 Suche: {q}</span>
							{/each}
						</div>
					{:else if message.role === 'assistant'}
						<div class="bubble-content">
							{#if loading && !message.content}
								<span class="muted">Lädt…</span>
							{:else}
								{@html message.html}
							{/if}
						</div>
					{:else}
						<div class="bubble-content">{message.content}</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="composer" class:expanded={composerExpanded}>
			<div class="composer-toolbar">
				<span class="composer-label">Ihre Frage</span>
				<button
					class="ghost-button"
					type="button"
					on:click={() => (composerExpanded = !composerExpanded)}
				>
					{composerExpanded ? '⤡ Eingabe verkleinern' : '⤢ Eingabe vergrößern'}
				</button>
			</div>
			<textarea
				bind:value={prompt}
				placeholder="Stellen Sie Ihre Frage…"
				rows="3"
				on:keydown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						send();
					} else if (e.key === 'Escape' && composerExpanded) {
						composerExpanded = false;
					}
				}}
			></textarea>
			<div class="composer-actions">
				<button type="button" on:click={send} disabled={loading}>
					{loading ? 'Sendet…' : 'Senden'}
				</button>
				{#if errorMessage}
					<span class="error">{errorMessage}</span>
				{/if}
			</div>
		</div>

		{#if data.webview.requireUserterms}
			<footer class="terms-footer">
				{#if data.webview.usertermsUrl}
					<a href={data.webview.usertermsUrl} target="_blank" rel="noopener noreferrer"
						>Benutzerbedingungen</a
					>
					·
				{/if}
				<button class="link-button" type="button" on:click={revokeTerms}>
					Zustimmung widerrufen
				</button>
			</footer>
		{/if}
	{/if}
</section>

<style>
	/* The page IS the viewport: header, intro and composer keep their height,
	   the message list takes the rest and scrolls. */
	.page {
		display: flex;
		flex-direction: column;
		/* The root layout appends a 70px footer; subtracting it keeps the page
		   plus footer exactly one viewport, so only the message list scrolls. */
		height: calc(100dvh - 70px);
		max-width: 900px;
		margin: 0 auto;
		padding: 0.75rem 1rem;
		box-sizing: border-box;
		gap: 0.75rem;
		background: #ffffff;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h1 {
		margin: 0;
		font-size: 1.25rem;
	}

	.intro {
		overflow: auto;
		max-height: 40dvh;
		flex: 0 0 auto;
	}

	.intro :global(img) {
		max-width: 100%;
		height: auto;
	}

	.terms-panel {
		margin: auto 0;
		display: grid;
		gap: 0.85rem;
		justify-items: center;
		text-align: center;
		padding: 1.5rem;
		border: 1px solid #e3e3e3;
		border-radius: 10px;
		background: #fafafa;
	}

	.terms-panel p {
		margin: 0;
	}

	.messages {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		gap: 0.75rem;
		align-content: start;
		padding: 1rem;
		overflow: auto;
		border: 1px solid #e3e3e3;
		border-radius: 10px;
		background: #ffffff;
	}

	.muted {
		color: #666;
		font-style: italic;
	}

	.empty {
		text-align: center;
		margin: 2rem 0;
	}

	.bubble {
		display: flex;
	}

	.bubble.user {
		justify-content: flex-end;
	}

	.bubble.assistant,
	.bubble.search {
		justify-content: flex-start;
	}

	.search-bubbles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.search-chip {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: #eaf2fd;
		border: 1px solid #cdddfc;
		color: #1f5fb0;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.bubble-content {
		max-width: min(80%, 640px);
		padding: 0.6rem 0.8rem;
		border-radius: 14px;
		border: 1px solid #e3e3e3;
		background: #f6f6f6;
		white-space: pre-wrap;
	}

	.bubble.user .bubble-content {
		background: #1f7ae0;
		color: white;
		border-color: #1f7ae0;
	}

	.bubble.assistant .bubble-content :global(p) {
		margin: 0 0 0.5rem 0;
	}

	.bubble.assistant .bubble-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.composer {
		flex: 0 0 auto;
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid #e3e3e3;
		border-radius: 10px;
		background: #fafafa;
	}

	/* Fullscreen mode of the text field: the composer becomes the viewport. */
	.composer.expanded {
		position: fixed;
		inset: 0;
		z-index: 20;
		border-radius: 0;
		border: none;
		background: #ffffff;
		display: flex;
		flex-direction: column;
	}

	.composer.expanded textarea {
		flex: 1 1 auto;
		min-height: 0;
		resize: none;
		font-size: 1.1rem;
	}

	.composer-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.composer-label {
		font-weight: 600;
		color: #333;
	}

	textarea {
		width: 100%;
		border: 1px solid #cfd6e0;
		border-radius: 6px;
		padding: 0.5rem;
		font-family: inherit;
		font-size: 1rem;
		min-height: 70px;
		resize: vertical;
		box-sizing: border-box;
	}

	.composer-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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

	button:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.ghost-button {
		background: white;
		color: #1f7ae0;
		white-space: nowrap;
	}

	.link-button {
		background: none;
		border: none;
		color: #1f7ae0;
		padding: 0;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.terms-footer {
		flex: 0 0 auto;
		text-align: center;
		font-size: 0.85rem;
		color: #666;
	}

	.terms-footer a {
		color: #1f7ae0;
	}

	.error {
		color: #8a1c1c;
		font-size: 0.95rem;
	}
</style>
