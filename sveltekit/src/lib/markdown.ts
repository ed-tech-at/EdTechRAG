import { marked } from 'marked';

export const renderMarkdownWithBlankTargets = (md?: string) => {
	if (!md) return '';

	const html = (marked.parse(md, { async: false }) ?? '') as string;
	return html.replace(/<a\b/g, "<a target='_blank'");
};
