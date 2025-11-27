import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export type SplitTextOptions = {
	chunkSize?: number;
	chunkOverlap?: number;
};

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;
const DEFAULT_SEPARATORS = ['\n#', '\n\n', '\n', '. ', ' ', ''];

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
