import ExcelJS from 'exceljs';
import type { ConversationInfo } from '$lib/server/chatLinking';
import type { ExportRow } from '$lib/server/chatConversations';

// Excel has no time zone; dates are written as wall-clock time in this zone.
export const EXPORT_TIME_ZONE = 'Europe/Vienna';
// Excel refuses cells longer than 32 767 characters.
const MAX_CELL = 32000;

const zonedDate = (iso: string | null): Date | null => {
	if (!iso) return null;
	const date = new Date(iso);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: EXPORT_TIME_ZONE,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(date);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return new Date(
		Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
	);
};

const clip = (text: string | null) => {
	if (!text) return '';
	return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}\n… [gekürzt]` : text;
};

const wrap = { alignment: { wrapText: true, vertical: 'top' as const } };
const dateFmt = { numFmt: 'yyyy-mm-dd hh:mm' };

/** Builds the two-sheet workbook ("Chats" per turn, "Konversationen" per conversation). */
export async function buildChatWorkbook(
	conversations: ConversationInfo[],
	rows: ExportRow[]
): Promise<Uint8Array<ArrayBuffer>> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'EdTechRAG';
	workbook.created = new Date();

	const chats = workbook.addWorksheet('Chats', { views: [{ state: 'frozen', ySplit: 1 }] });
	chats.columns = [
		{ header: 'Konversation', key: 'conversation', width: 14 },
		{ header: 'Turn', key: 'turn', width: 7 },
		{ header: 'Zeitpunkt', key: 'createdAt', width: 17, style: dateFmt },
		{ header: 'Username', key: 'username', width: 16 },
		{ header: 'Quelle', key: 'source', width: 30 },
		{ header: 'Endpoint', key: 'endpoint', width: 24 },
		{ header: 'Frage', key: 'question', width: 50, style: wrap },
		{ header: 'Antwort', key: 'answer', width: 80, style: wrap },
		{ header: 'Terms akzeptiert', key: 'termsAcceptedAt', width: 17, style: dateFmt },
		{ header: 'Terms-URL', key: 'usertermsUrl', width: 30 },
		{ header: 'Kontext', key: 'context', width: 60 },
		{ header: 'Log-ID', key: 'id', width: 8 }
	];
	for (const row of rows) {
		chats.addRow({
			conversation: row.conversation,
			turn: row.turn,
			createdAt: zonedDate(row.createdAt),
			username: row.username ?? '',
			source: row.source ?? '',
			endpoint: row.endpoint ?? '',
			question: clip(row.question),
			answer: clip(row.answer),
			termsAcceptedAt: zonedDate(row.termsAcceptedAt),
			usertermsUrl: row.usertermsUrl ?? '',
			context: clip(row.context),
			id: row.id
		});
	}
	chats.getRow(1).font = { bold: true };
	chats.autoFilter = { from: 'A1', to: `L${Math.max(1, rows.length + 1)}` };

	const firstOf = new Map<string, ExportRow>();
	for (const row of rows) {
		if (!firstOf.has(row.conversation)) firstOf.set(row.conversation, row);
	}

	const summary = workbook.addWorksheet('Konversationen', {
		views: [{ state: 'frozen', ySplit: 1 }]
	});
	summary.columns = [
		{ header: 'Konversation', key: 'key', width: 14 },
		{ header: 'Turns', key: 'turns', width: 7 },
		{ header: 'Start', key: 'start', width: 17, style: dateFmt },
		{ header: 'Ende', key: 'end', width: 17, style: dateFmt },
		{ header: 'Username', key: 'username', width: 16 },
		{ header: 'Quelle', key: 'source', width: 30 },
		{ header: 'Erste Frage', key: 'question', width: 60, style: wrap }
	];
	for (const c of conversations) {
		const first = firstOf.get(c.key);
		summary.addRow({
			key: c.key,
			turns: c.ids.length,
			start: zonedDate(c.start.toISOString()),
			end: zonedDate(c.last.toISOString()),
			username: first?.username ?? '',
			source: first?.source ?? '',
			question: clip(first?.question ?? null)
		});
	}
	summary.getRow(1).font = { bold: true };
	summary.autoFilter = { from: 'A1', to: `G${Math.max(1, conversations.length + 1)}` };

	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer as ArrayBuffer);
}
