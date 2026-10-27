import prisma from '$lib/server/db';
import { linkByHistory, type IndexRow } from '$lib/server/chatLinking';

export { linkByHistory, type ConversationInfo, type IndexRow } from '$lib/server/chatLinking';

/**
 * Groups ChatLog rows into conversations without a stored conversation id.
 *
 * The widgets send the previous turns as `history` with every request, so a row R is the
 * follow-up of an earlier row P when R's history ends with P's question and P's answer and is
 * exactly two turns longer than P's own history. Everything is derived at read time from the
 * stored data; nothing is written back.
 */

export type HistoryTurn = { role: string; content: string };

export type ChatLogItem = {
	id: number;
	createdAt: string | null;
	endpoint: string | null;
	username: string | null;
	termsAcceptedAt: string | null;
	usertermsUrl: string | null;
	source: string | null;
	question: string | null;
	context: string | null;
	answer: string | null;
	history: HistoryTurn[];
};

export type ConversationGroup = {
	key: string;
	turns: ChatLogItem[];
	start: string | null;
	last: string | null;
};

/** Normalise the `history` Json column into a plain list of {role, content}. */
export function normaliseHistory(json: unknown): HistoryTurn[] {
	if (!Array.isArray(json)) return [];
	return (json as unknown[])
		.map((entry) =>
			entry && typeof entry === 'object'
				? {
						role: String((entry as Record<string, unknown>).role ?? ''),
						content: String((entry as Record<string, unknown>).content ?? '')
				  }
				: null
		)
		.filter((entry): entry is HistoryTurn => entry !== null);
}

type ChatLogRecord = {
	id: number;
	createdAt: Date | null;
	endpoint: string | null;
	username: string | null;
	termsAcceptedAt: Date | null;
	usertermsUrl: string | null;
	source: string | null;
	question: string | null;
	context: string | null;
	answer: string | null;
	history: unknown;
};

export function serialiseChatLog(log: ChatLogRecord): ChatLogItem {
	return {
		id: log.id,
		createdAt: log.createdAt ? log.createdAt.toISOString() : null,
		endpoint: log.endpoint,
		username: log.username,
		termsAcceptedAt: log.termsAcceptedAt ? log.termsAcceptedAt.toISOString() : null,
		usertermsUrl: log.usertermsUrl,
		source: log.source,
		question: log.question,
		context: log.context,
		answer: log.answer,
		history: normaliseHistory(log.history)
	};
}

export async function loadConversationIndex(repoUrl: string): Promise<IndexRow[]> {
	// The webview/simple/parameter pages also send "search"/"context" turns in the history; the
	// embed widgets send only user/assistant. Only the latter pair the turns up, so everything
	// else is dropped before measuring the history.
	const rows = await prisma.$queryRaw<IndexRow[]>`
		SELECT "id", "createdAt", "username", "question",
		       md5(COALESCE("answer", '')) AS "answerHash",
		       jsonb_array_length("turns") AS "historyLength",
		       "turns"->-2->>'content' AS "lastUserInHistory",
		       md5(COALESCE("turns"->-1->>'content', '')) AS "lastAnswerHashInHistory"
		FROM (
		  SELECT "id", "createdAt", "username", "question", "answer",
		         CASE WHEN jsonb_typeof("history") = 'array'
		              THEN jsonb_path_query_array("history", '$[*] ? (@.role == "user" || @.role == "assistant")')
		              ELSE '[]'::jsonb END AS "turns"
		  FROM "ChatLog"
		  WHERE "repositoryUrl" = ${repoUrl}
		) AS "logs"
		ORDER BY "createdAt" ASC, "id" ASC
	`;
	return rows.map((row) => ({ ...row, historyLength: Number(row.historyLength) }));
}

export async function loadConversationPage(repoUrl: string, requestedPage: number, pageSize: number) {
	const index = await loadConversationIndex(repoUrl);
	const conversations = linkByHistory(index).sort(
		(a, b) => b.last.getTime() - a.last.getTime() || b.ids[0] - a.ids[0]
	);

	const conversationCount = conversations.length;
	const pageCount = Math.max(1, Math.ceil(conversationCount / pageSize));
	const page = Number.isFinite(requestedPage)
		? Math.min(Math.max(1, Math.floor(requestedPage)), pageCount)
		: 1;

	const slice = conversations.slice((page - 1) * pageSize, page * pageSize);
	const ids = slice.flatMap((c) => c.ids);
	const logs = ids.length
		? await prisma.chatLog.findMany({
				where: { id: { in: ids } },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
		  })
		: [];
	const byId = new Map(logs.map((log) => [log.id, serialiseChatLog(log)]));

	const groups: ConversationGroup[] = slice.map((c) => ({
		key: c.key,
		turns: c.ids.map((id) => byId.get(id)).filter((item): item is ChatLogItem => item !== undefined),
		start: c.start.toISOString(),
		last: c.last.toISOString()
	}));

	return { groups, conversationCount, requestCount: index.length, page, pageCount };
}

export type ExportRow = ChatLogItem & { conversation: string; turn: number; turns: number };

const EXPORT_BATCH = 500;

/** All rows of a repository, grouped by conversation (oldest conversation first). */
export async function loadAllRowsForExport(repoUrl: string) {
	const index = await loadConversationIndex(repoUrl);
	const conversations = linkByHistory(index).sort(
		(a, b) => a.start.getTime() - b.start.getTime() || a.ids[0] - b.ids[0]
	);

	const byId = new Map<number, ChatLogItem>();
	let lastId = 0;
	while (true) {
		const batch = await prisma.chatLog.findMany({
			where: { repositoryUrl: repoUrl, id: { gt: lastId } },
			orderBy: { id: 'asc' },
			take: EXPORT_BATCH
		});
		if (batch.length === 0) break;
		for (const log of batch) byId.set(log.id, serialiseChatLog(log));
		lastId = batch[batch.length - 1].id;
		if (batch.length < EXPORT_BATCH) break;
	}

	const rows: ExportRow[] = [];
	for (const c of conversations) {
		c.ids.forEach((id, i) => {
			const item = byId.get(id);
			if (item) rows.push({ ...item, conversation: c.key, turn: i + 1, turns: c.ids.length });
		});
	}
	return { conversations, rows };
}
