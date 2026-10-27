/**
 * Pure conversation-linking heuristic for ChatLog rows (no database access, so it can be
 * exercised directly with node). See chatConversations.ts for the loaders around it.
 */

/** Lightweight row used by the heuristic: no full answer/context/history text. */
export type IndexRow = {
	id: number;
	createdAt: Date;
	username: string | null;
	question: string | null;
	answerHash: string;
	historyLength: number;
	lastUserInHistory: string | null;
	lastAnswerHashInHistory: string;
};

export type ConversationInfo = {
	key: string;
	ids: number[];
	start: Date;
	last: Date;
};

/**
 * Pure heuristic. `rows` must be sorted ascending by (createdAt, id).
 * Returns the conversations in input order of their first turn.
 */
export function linkByHistory(rows: IndexRow[]): ConversationInfo[] {
	const parent = new Map<number, number>();
	const byQuestion = new Map<string, IndexRow[]>();

	for (const row of rows) {
		if (row.historyLength >= 2 && row.lastUserInHistory !== null) {
			const candidates = (byQuestion.get(row.lastUserInHistory) ?? []).filter(
				(p) =>
					p.username === row.username &&
					p.historyLength === row.historyLength - 2 &&
					p.createdAt.getTime() <= row.createdAt.getTime()
			);
			if (candidates.length) {
				// Prefer the candidate whose stored answer is what the client replayed; otherwise the
				// most recent one (candidates are in ascending order).
				const match =
					[...candidates].reverse().find((p) => p.answerHash === row.lastAnswerHashInHistory) ??
					candidates[candidates.length - 1];
				parent.set(row.id, match.id);
			}
		}
		if (row.question !== null) {
			const list = byQuestion.get(row.question);
			if (list) list.push(row);
			else byQuestion.set(row.question, [row]);
		}
	}

	const rootMemo = new Map<number, number>();
	const rootOf = (id: number): number => {
		const memo = rootMemo.get(id);
		if (memo !== undefined) return memo;
		const p = parent.get(id);
		const root = p === undefined ? id : rootOf(p);
		rootMemo.set(id, root);
		return root;
	};

	const byRoot = new Map<number, ConversationInfo>();
	for (const row of rows) {
		const root = rootOf(row.id);
		const existing = byRoot.get(root);
		if (existing) {
			existing.ids.push(row.id);
			if (row.createdAt > existing.last) existing.last = row.createdAt;
		} else {
			byRoot.set(root, { key: '', ids: [row.id], start: row.createdAt, last: row.createdAt });
		}
	}

	const conversations = [...byRoot.entries()].map(([root, info]) => ({
		...info,
		key: info.ids.length > 1 ? `conv:${root}` : `log:${info.ids[0]}`
	}));
	return conversations;
}
