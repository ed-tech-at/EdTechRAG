<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	import { renderMarkdownWithBlankTargets } from '$lib/markdown';
	export let data: PageData;

	let numItems = data.numberDocuments ?? 4;
		const numOptions = [2, 4, 6, 8, 10, 12, 15, 20];
	


	let prompt = '';
	let systemprompt = data.systemprompt ?? '';
	let loading = false;
	let errorMessage = '';
	let messages: Array<{ role: 'user' | 'assistant' | 'context'; content: string; html?: string }> = [];
	const decoder = new TextDecoder();
	const contextStart = '__EDTECH_CONTEXT_START__\n';
	const contextEnd = '\n__EDTECH_CONTEXT_END__\n';

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
			const res = await fetch(resolve(`/api/chat-parameter/${encodeURIComponent(data.repositoryUrl ?? '')}`), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: nextPrompt, history, numItems, systemprompt })
			});

			if (!res.ok || !res.body) {
				throw new Error('Request failed');
			}

			const reader = res.body.getReader();
			let buffer = '';
			let rawAnswer = '';
			let done = false;
			let contextLoaded = false;
			let assistantIndex = -1;

			while (!done) {
				const chunk = await reader.read();
				done = chunk.done;
				const text = decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
				if (!text) continue;

				if (!contextLoaded) {
					buffer += text;
					const endIndex = buffer.indexOf(contextEnd);
					if (endIndex === -1) continue;

					const contextPayload = buffer.startsWith(contextStart)
						? buffer.slice(contextStart.length, endIndex)
						: '';
					const remainder = buffer.slice(endIndex + contextEnd.length);

					assistantIndex = messages.length + 1;
					messages = [
						...messages,
						{
							role: 'context',
							content: contextPayload,
							html: renderMarkdownWithBlankTargets(contextPayload)
						},
						{ role: 'assistant', content: '', html: '' }
					];
					contextLoaded = true;
					buffer = '';

					if (!remainder) continue;
					rawAnswer += remainder;
				} else {
					rawAnswer += text;
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

			// scroll messages to bottom
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
	<h1>Parameter Chat · {data.repositoryName}</h1>
	<p class="muted">
		Repository:
		<!-- <a class="link" href={resolve(`/admin/repositories/${encodeURIComponent(data.repository.url)}`)}> -->
			{data.repositoryUrl}
		<!-- </a> -->
	</p>


	<div class="card">
		<label>
			Systemprompt
			<p class="muted" style="font-weight: 400;">Changes in text will NOT be stored in the system.</p>
			<textarea bind:value={systemprompt}>{systemprompt}</textarea>
		</label>

	</div>


	<div class="card">
		<label>
			Number of database items
			<select bind:value={numItems}>
				{#each numOptions as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</label>

	</div>

	<div class="card chat-card">
		<div class="messages">
			{#if messages.length === 0}
				<p class="muted empty">Ask a question to start the chat.</p>
			{/if}
			{#each messages as message}
				<div class="bubble {message.role}">
					{#if message.role === 'assistant'}
						<div class="bubble-content">
							{#if loading && !message.content}
								<span class="muted">Loading...</span>
							{:else}
								{@html message.html}
							{/if}
						</div>
					{:else if message.role === 'context'}
						<div class="bubble-content context-bubble">
							<details>
								<summary style="cursor: pointer;">
									{message.content.length > 200 ? message.content.slice(0, 20) + '...' : message.content}
									<span class="muted"> ({message.content.length} chars)</span>
								</summary>
								<div style="background:#f0f0f0; padding:0.6rem; border-radius:8px; margin-top:0.5rem;">{@html message.html}</div>
							</details>
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

	.bubble-content {
		max-width: min(72%, 520px);
		padding: 0.6rem 0.8rem;
		border-radius: 14px;
		border: 1px solid #e3e3e3;
		background: #f6f6f6;
		white-space: pre-wrap;
		font-family: 'Jost';
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
		border-top: 1px solid #e3e3e3;
		padding: 0.75rem;
		background: #fafafa;
		display: grid;
		gap: 0.5rem;
	}
</style>
