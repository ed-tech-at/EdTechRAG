import { marked } from 'marked';

export const renderMarkdownWithBlankTargets = (md?: string) => {
	if (!md) return '';

	const html = marked.parse(md) ?? '';
	return html.replace(/<a\b/g, "<a target='_blank'");
};
