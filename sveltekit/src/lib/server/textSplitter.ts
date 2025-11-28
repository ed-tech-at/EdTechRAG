import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export type SplitTextOptions = {
	chunkSize?: number;
	chunkOverlap?: number;
};

export type MdPreprocessResult = {
	content: string;
	meta: Record<string, string>;
};

let DEFAULT_CHUNK_SIZE = 500;
let DEFAULT_CHUNK_OVERLAP = 50;
let DEFAULT_SEPARATORS = ['\n#', '\n\n', '\n', '. ', ' ', ''];

DEFAULT_CHUNK_SIZE = 1000;
DEFAULT_CHUNK_OVERLAP = 150;

DEFAULT_SEPARATORS = [
  '\n# ',      // H1
  '\n## ',     // H2
  '\n### ',    // H3
  '\n#### ',   // H4+
  '\n```',     // code fences
  '\n- ',      // bullet lists
  '\n* ',      // alternative bullets
  '\n> ',      // blockquotes
  '\n\n',      // paragraph breaks
  '\n',        // line breaks
  ' ',         // words
  ''           // fallback: characters
];

/**
 * Splits raw text into smaller chunks using LangChain's RecursiveCharacterTextSplitter.
 */
export async function splitTextIntoChunks(text: string, options: SplitTextOptions = {}) {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
		chunkOverlap: options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
		separators: DEFAULT_SEPARATORS
	});

	const docs = await splitter.createDocuments([text]);
	return docs.map((doc: { pageContent: string }) => doc.pageContent.trim()).filter(Boolean);
}

/**
 * Extracts metadata from HTML comment markers in markdown and returns cleaned content.
 * Example: <!-- URL: https://example.com --> becomes meta.url = 'https://example.com'.
 */
export function getMetaDataOutOfMd(text: string): MdPreprocessResult {
	const meta: Record<string, string> = {};
	const commentRegex = /<!--\s*([^:>]+?)\s*:\s*([\s\S]*?)\s*-->/g;

	let match: RegExpExecArray | null;
	while ((match = commentRegex.exec(text)) !== null) {
		const rawKey = match[1]?.trim();
		const rawValue = match[2]?.trim();
		if (!rawKey) continue;

		const key = rawKey.toLowerCase().replace(/\s+/g, '_');
		if (rawValue) {
			meta[key] = rawValue;
		}
	}

	const cleanedText = text.replace(commentRegex, '').trim();

	return {
		content: cleanedText,
		meta
	};
}
