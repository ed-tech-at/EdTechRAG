import type OpenAI from 'openai';
import type { ApiLanguage, ReasoningEffort, TextVerbosity } from '$lib/server/openaiClient';

export type ChatMessage = {
	role: 'user' | 'assistant' | 'system';
	content: string;
};

type StreamChatTextParams = {
	client: OpenAI;
	model: string;
	apiLanguage: ApiLanguage;
	messages: readonly ChatMessage[];
	reasoningEffort?: ReasoningEffort;
	textVerbosity?: TextVerbosity;
	onComplete?: (answer: string) => Promise<void> | void;
};

const encoder = new TextEncoder();

export function streamChatText({
	client,
	model,
	apiLanguage,
	messages,
	reasoningEffort,
	textVerbosity,
	onComplete
}: StreamChatTextParams): ReadableStream<Uint8Array> {
	return new ReadableStream({
		async start(controller) {
			let answer = '';

				try {
					if (apiLanguage === 'responses') {
						const input = messages.map((message) => ({ ...message }));

						

						const response = await client.responses.create({
							model,
							input,
							stream: true,
							...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
							...(textVerbosity ? { text: { verbosity: textVerbosity } } : {})
					});

					for await (const event of response) {
						if (event.type !== 'response.output_text.delta' || !event.delta) continue;

						answer += event.delta;
						controller.enqueue(encoder.encode(event.delta));
					}
					} else {
						const completionMessages = messages.map((message) => ({ ...message }));
						const completion = await client.chat.completions.create({
							model,
							messages: completionMessages,
							stream: true
						});

					for await (const chunk of completion) {
						const delta = chunk.choices?.[0]?.delta?.content;
						if (!delta) continue;

						answer += delta;
						controller.enqueue(encoder.encode(delta));
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Stream error';
				controller.enqueue(encoder.encode(`\n[error] ${message}`));
			} finally {
				if (onComplete) {
					try {
						await onComplete(answer);
					} catch (err) {
						console.error('Chat stream completion hook failed', err);
					}
				}

				controller.close();
			}
		}
	});
}
