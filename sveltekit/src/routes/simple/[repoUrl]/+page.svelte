<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	// import { marked } from 'marked';
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

	// const logInteraction = async (payload: {
	// 	question: string;
	// 	context?: string;
	// 	answer?: string;
	// 	repositoryUrl?: string;
	// 	endpoint?: string;
	// }) => {
	// 	try {
	// 		await fetch(resolve('/api/chat/log'), {
	// 			method: 'POST',
	// 			headers: { 'Content-Type': 'application/json' },
	// 			body: JSON.stringify(payload)
	// 		});
	// 	} catch (err) {
	// 		console.error('Log failed', err);
	// 	}
	// };

	const send = async () => {
		if (!prompt.trim()) {
			errorMessage = 'Please enter a prompt.';
			return;
		}

		errorMessage = '';
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
				throw new Error('Request failed');
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
			
			// await logInteraction({
			// 	question: prompt,
			// 	context: body?.results
			// 		?.map((item: any) => `CONTENT:\n${item.content ?? '—'}\nURL: ${item.meta?.url ?? item.remoteUrl ?? '—'}`)
			// 		?.join('\n\n'),
			// 	answer,
			// 	repositoryUrl: data.repository.url,
			// 	endpoint: '/simple/[repoUrl]'
			// });
		} catch (err) {
			if (messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content) {
				messages = messages.slice(0, -1);
			}
			errorMessage = err instanceof Error ? err.message : 'Request failed';
		} finally {
			loading = false;
		}
	};
</script>

<section class="page">
	<h1>Simple Chat · {data.repositoryName}</h1>
	<!-- <p class="muted"> -->
		<!-- Repository: -->
		<!-- <a class="link" href={resolve(`/admin/repositories/${encodeURIComponent(data.repository.url)}`)}> -->
			<!-- {data.repositoryUrl} -->
		<!-- </a> -->
	<!-- </p> -->

	<div class="card chat-card">
		<div class="messages">
			{#if messages.length === 0}
				<p class="muted empty">Ask a question to start the chat.</p>
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
								<span class="muted">Loading...</span>
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
		<div class="composer">
			<label>
				Prompt
				<textarea
					bind:value={prompt}
					placeholder="Ask your question..."
					rows="3"
					on:keydown={(e) => {
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							send();
						}
					}}
				></textarea>
			</label>
			<div class="actions">
				<button on:click={send} disabled={loading}>{loading ? 'Sending…' : 'Send'}</button>
				{#if errorMessage}
					<span class="error">{errorMessage}</span>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
	}

	.muted {
		color: #666;
		font-style: italic;
	}

	.card {
		border: 1px solid #e3e3e3;
		border-radius: 8px;
		padding: 0.75rem;
		display: grid;
		gap: 0.5rem;
		background: #fafafa;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-weight: 600;
	}

	textarea {
		width: 100%;
		border: 1px solid #cfd6e0;
		border-radius: 6px;
		padding: 0.5rem;
		font-family: inherit;
		font-size: 1rem;
		min-height: 90px;
		resize: vertical;
	}

	.actions {
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
		min-width: 110px;
	}

	.error {
		color: #8a1c1c;
		font-size: 0.95rem;
	}

	.chat-card {
		padding: 0;
		overflow: hidden;
	}

	.messages {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		max-height: 60vh;
		overflow: auto;
		background: #ffffff;
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

	.bubble.assistant {
		justify-content: flex-start;
	}

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
		max-width: min(72%, 520px);
		padding: 0.6rem 0.8rem;
		border-radius: 14px;
		border: 1px solid #e3e3e3;
		background: #f6f6f6;
		line-height: 1.5;
		word-break: break-word;
		font-family: 'Jost';
	}

	.bubble.user .bubble-content {
		background: #1f7ae0;
		color: white;
		border-color: #1f7ae0;
		/* Nur die User-Bubble rendert Plaintext und braucht erhaltene Umbrüche.
		   Auf der Assistant-Bubble würde pre-wrap die Zeilenumbrüche des von
		   marked erzeugten HTML als Leerzeilen sichtbar machen. */
		white-space: pre-wrap;
	}

	/* Markdown-Reset für das per {@html} eingesetzte Assistant-HTML. Diese Knoten
	   tragen keine Svelte-Scope-Attribute, daher durchgehend :global(). */
	.bubble.assistant .bubble-content :global(> :first-child) {
		margin-top: 0;
	}

	.bubble.assistant .bubble-content :global(> :last-child) {
		margin-bottom: 0;
	}

	.bubble.assistant .bubble-content :global(p),
	.bubble.assistant .bubble-content :global(ul),
	.bubble.assistant .bubble-content :global(ol),
	.bubble.assistant .bubble-content :global(blockquote),
	.bubble.assistant .bubble-content :global(pre),
	.bubble.assistant .bubble-content :global(table) {
		margin: 0 0 0.5em 0;
	}

	.bubble.assistant .bubble-content :global(ul),
	.bubble.assistant .bubble-content :global(ol) {
		padding-left: 1.25em;
	}

	.bubble.assistant .bubble-content :global(li) {
		margin: 0 0 0.2em 0;
	}

	.bubble.assistant .bubble-content :global(li:last-child) {
		margin-bottom: 0;
	}

	.bubble.assistant .bubble-content :global(li > p) {
		margin: 0;
	}

	.bubble.assistant .bubble-content :global(h1),
	.bubble.assistant .bubble-content :global(h2),
	.bubble.assistant .bubble-content :global(h3),
	.bubble.assistant .bubble-content :global(h4),
	.bubble.assistant .bubble-content :global(h5),
	.bubble.assistant .bubble-content :global(h6) {
		margin: 0.8em 0 0.35em 0;
		font-size: 1em;
		font-weight: 600;
		line-height: 1.3;
	}

	.bubble.assistant .bubble-content :global(pre) {
		background: rgba(0, 0, 0, 0.07);
		padding: 0.5em;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.85em;
	}

	.bubble.assistant .bubble-content :global(code) {
		font-size: 0.9em;
	}

	.bubble.assistant .bubble-content :global(pre code) {
		font-size: 1em;
	}

	.bubble.assistant .bubble-content :global(a) {
		word-break: break-all;
	}

	.composer {
		border-top: 1px solid #e3e3e3;
		padding: 0.75rem;
		background: #fafafa;
		display: grid;
		gap: 0.5rem;
	}
</style>
