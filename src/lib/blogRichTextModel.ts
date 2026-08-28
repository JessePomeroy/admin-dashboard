import { type Mark, type Node as ProseMirrorNode, Schema } from "prosemirror-model";
import type { PostRichTextDocument } from "./blogEditor";

export const BLOG_RICH_TEXT_LIMITS = {
	blocks: 500,
	listItems: 100,
	spans: 200,
	marksPerSpan: 3,
	keyCharacters: 120,
	spanCharacters: 10_000,
	totalCharacters: 150_000,
	serializedBytes: 512 * 1_024,
	assetIdCharacters: 128,
	altTextCharacters: 500,
	captionCharacters: 2_000,
	urlCharacters: 2_048,
} as const;

export type BlogRichTextMark =
	| { type: "strong" }
	| { type: "emphasis" }
	| { type: "link"; key: string; href: string };

export interface BlogRichTextSpan {
	type: "text";
	key: string;
	text: string;
	marks: BlogRichTextMark[];
}

export interface BlogRichTextListItem {
	key: string;
	children: BlogRichTextSpan[];
}

export type BlogRichTextBlock =
	| { type: "paragraph"; key: string; children: BlogRichTextSpan[] }
	| { type: "heading"; key: string; level: 2 | 3 | 4; children: BlogRichTextSpan[] }
	| { type: "quote"; key: string; children: BlogRichTextSpan[] }
	| { type: "list"; key: string; style: "bullet" | "number"; items: BlogRichTextListItem[] }
	| {
		type: "image";
		key: string;
		assetId: string;
		altText?: string;
		caption?: string;
	};

export interface BlogRichTextDocument {
	version: 1;
	blocks: BlogRichTextBlock[];
}

export type BlogRichTextInspection =
	| { editable: true; document: BlogRichTextDocument }
	| { editable: false; reason: string };

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROOT_KEYS = new Set(["version", "blocks"]);
const TEXT_SPAN_KEYS = new Set(["type", "key", "text", "marks"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
	return Object.keys(value).every((key) => allowed.has(key));
}

function isContractKey(value: unknown): value is string {
	return typeof value === "string"
		&& value.length > 0
		&& value.length <= BLOG_RICH_TEXT_LIMITS.keyCharacters
		&& value === value.trim()
		&& KEY_PATTERN.test(value);
}

export function isSafeBlogRichTextUrl(value: string) {
	const href = value.trim();
	if (!href || href.length > BLOG_RICH_TEXT_LIMITS.urlCharacters) return false;
	if (href.startsWith("#")) return !href.includes(" ");
	if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");
	try {
		return ["https:", "http:", "mailto:", "tel:"].includes(new URL(href).protocol);
	} catch {
		return false;
	}
}

function addCharacters(state: { characters: number }, value: string) {
	state.characters += value.length;
	return state.characters <= BLOG_RICH_TEXT_LIMITS.totalCharacters;
}

function inspectMark(
	value: unknown,
	state: { characters: number },
): BlogRichTextMark | null {
	if (!isRecord(value) || typeof value.type !== "string") return null;
	if (value.type === "strong" || value.type === "emphasis") {
		return hasOnlyKeys(value, new Set(["type"])) ? { type: value.type } : null;
	}
	if (
		value.type === "link"
		&& hasOnlyKeys(value, new Set(["type", "key", "href"]))
		&& isContractKey(value.key)
		&& typeof value.href === "string"
		&& value.href === value.href.trim()
		&& isSafeBlogRichTextUrl(value.href)
		&& addCharacters(state, value.href)
	) {
		return { type: "link", key: value.key, href: value.href };
	}
	return null;
}

function inspectSpans(value: unknown, state: { characters: number }): BlogRichTextSpan[] | null {
	if (!Array.isArray(value) || value.length > BLOG_RICH_TEXT_LIMITS.spans) return null;
	const keys = new Set<string>();
	const spans: BlogRichTextSpan[] = [];
	for (const span of value) {
		if (
			!isRecord(span)
			|| !hasOnlyKeys(span, TEXT_SPAN_KEYS)
			|| span.type !== "text"
			|| !isContractKey(span.key)
			|| keys.has(span.key)
			|| typeof span.text !== "string"
			|| span.text.length > BLOG_RICH_TEXT_LIMITS.spanCharacters
			|| !Array.isArray(span.marks)
			|| span.marks.length > BLOG_RICH_TEXT_LIMITS.marksPerSpan
		) return null;
		const marks = span.marks.map((mark) => inspectMark(mark, state));
		if (marks.some((mark) => mark === null)) return null;
		const kinds = marks.map((mark) => mark?.type);
		if (new Set(kinds).size !== kinds.length) return null;
		keys.add(span.key);
		if (!addCharacters(state, span.text)) return null;
		spans.push({
			type: "text",
			key: span.key,
			text: span.text,
			marks: marks as BlogRichTextMark[],
		});
	}
	return spans;
}

function inspectBlock(
	value: unknown,
	state: { characters: number },
): BlogRichTextBlock | null {
	if (!isRecord(value) || !isContractKey(value.key) || typeof value.type !== "string") {
		return null;
	}
	if (value.type === "paragraph" || value.type === "quote") {
		if (!hasOnlyKeys(value, new Set(["type", "key", "children"]))) return null;
		const children = inspectSpans(value.children, state);
		return children ? { type: value.type, key: value.key, children } : null;
	}
	if (value.type === "heading") {
		if (
			!hasOnlyKeys(value, new Set(["type", "key", "level", "children"]))
			|| (value.level !== 2 && value.level !== 3 && value.level !== 4)
		) return null;
		const children = inspectSpans(value.children, state);
		return children
			? { type: "heading", key: value.key, level: value.level, children }
			: null;
	}
	if (value.type === "list") {
		if (
			!hasOnlyKeys(value, new Set(["type", "key", "style", "items"]))
			|| (value.style !== "bullet" && value.style !== "number")
			|| !Array.isArray(value.items)
			|| value.items.length > BLOG_RICH_TEXT_LIMITS.listItems
		) return null;
		const itemKeys = new Set<string>();
		const items: BlogRichTextListItem[] = [];
		for (const item of value.items) {
			if (
				!isRecord(item)
				|| !hasOnlyKeys(item, new Set(["key", "children"]))
				|| !isContractKey(item.key)
				|| itemKeys.has(item.key)
			) return null;
			const children = inspectSpans(item.children, state);
			if (!children) return null;
			itemKeys.add(item.key);
			items.push({ key: item.key, children });
		}
		return { type: "list", key: value.key, style: value.style, items };
	}
	if (value.type === "image") {
		const altText = value.altText;
		const caption = value.caption;
		if (
			!hasOnlyKeys(value, new Set(["type", "key", "assetId", "altText", "caption"]))
			|| typeof value.assetId !== "string"
			|| !value.assetId.trim()
			|| value.assetId !== value.assetId.trim()
			|| value.assetId.length > BLOG_RICH_TEXT_LIMITS.assetIdCharacters
			|| (altText !== undefined
				&& (typeof altText !== "string"
					|| altText.length > BLOG_RICH_TEXT_LIMITS.altTextCharacters
					|| !altText.trim()
					|| altText !== altText.trim()))
			|| (caption !== undefined
				&& (typeof caption !== "string"
					|| caption.length > BLOG_RICH_TEXT_LIMITS.captionCharacters
					|| !caption.trim()
					|| caption !== caption.trim()))
		) return null;
		if (
			!addCharacters(state, value.assetId)
			|| (typeof altText === "string" && !addCharacters(state, altText))
			|| (typeof caption === "string" && !addCharacters(state, caption))
		) return null;
		return {
			type: "image",
			key: value.key,
			assetId: value.assetId,
			...(typeof altText === "string" ? { altText } : {}),
			...(typeof caption === "string" ? { caption } : {}),
		};
	}
	return null;
}

function cloneDocument(document: BlogRichTextDocument): BlogRichTextDocument {
	return JSON.parse(JSON.stringify(document)) as BlogRichTextDocument;
}

export function inspectBlogRichTextDocument(value: PostRichTextDocument): BlogRichTextInspection {
	if (
		!isRecord(value)
		|| !hasOnlyKeys(value, ROOT_KEYS)
		|| value.version !== 1
		|| !Array.isArray(value.blocks)
		|| value.blocks.length > BLOG_RICH_TEXT_LIMITS.blocks
	) {
		return { editable: false, reason: "This body uses an unsupported rich-text document shape." };
	}
	const state = { characters: 0 };
	const blockKeys = new Set<string>();
	const blocks: BlogRichTextBlock[] = [];
	for (const valueBlock of value.blocks) {
		const block = inspectBlock(valueBlock, state);
		if (!block || blockKeys.has(block.key)) {
			return { editable: false, reason: "This body contains unsupported or ambiguous rich-text structure." };
		}
		blockKeys.add(block.key);
		blocks.push(block);
	}
	const document: BlogRichTextDocument = { version: 1, blocks };
	if (new TextEncoder().encode(JSON.stringify(document)).byteLength > BLOG_RICH_TEXT_LIMITS.serializedBytes) {
		return { editable: false, reason: "This body exceeds the supported rich-text size." };
	}
	return { editable: true, document: cloneDocument(document) };
}

const nodes = {
	doc: { content: "block*" },
	paragraph: {
		group: "block",
		content: "inline*",
		attrs: { key: { default: null } },
		toDOM: (node: ProseMirrorNode) => ["p", { "data-rich-block-key": node.attrs.key }, 0] as const,
	},
	heading: {
		group: "block",
		content: "inline*",
		attrs: { key: {}, level: { default: 2 } },
		toDOM: (node: ProseMirrorNode) => [
			`h${String(node.attrs.level)}`,
			{ "data-rich-block-key": node.attrs.key },
			0,
		] as const,
	},
	blockquote: {
		group: "block",
		content: "inline*",
		attrs: { key: {} },
		toDOM: (node: ProseMirrorNode) => [
			"blockquote",
			{ "data-rich-block-key": node.attrs.key },
			0,
		] as const,
	},
	bullet_list: {
		group: "block",
		content: "list_item*",
		attrs: { key: {} },
		toDOM: (node: ProseMirrorNode) => ["ul", { "data-rich-block-key": node.attrs.key }, 0] as const,
	},
	ordered_list: {
		group: "block",
		content: "list_item*",
		attrs: { key: {} },
		toDOM: (node: ProseMirrorNode) => ["ol", { "data-rich-block-key": node.attrs.key }, 0] as const,
	},
	list_item: {
		content: "paragraph",
		attrs: { key: { default: null } },
		toDOM: (node: ProseMirrorNode) => ["li", { "data-rich-item-key": node.attrs.key }, 0] as const,
	},
	image: {
		group: "block",
		atom: true,
		selectable: true,
		draggable: false,
		attrs: {
			key: {},
			assetId: {},
			altText: { default: null },
			caption: { default: null },
		},
		toDOM: (node: ProseMirrorNode) => [
			"div",
			{
				"data-rich-image-key": node.attrs.key,
				"data-rich-asset-id": node.attrs.assetId,
			},
			"image",
		] as const,
	},
	empty_span: {
		inline: true,
		group: "inline",
		atom: true,
		selectable: false,
		attrs: { key: {}, sourceScope: {}, semanticMarks: { default: [] } },
		toDOM: (node: ProseMirrorNode) => [
			"span",
			{ "data-rich-empty-span": node.attrs.key, "aria-hidden": "true" },
			"\u200b",
		] as const,
	},
	text: { group: "inline" },
};

const marks = {
	source_span: {
		attrs: { key: {}, sourceScope: {}, semanticMarks: { default: [] } },
		toDOM: (mark: Mark) => ["span", { "data-rich-span-key": mark.attrs.key }, 0] as const,
	},
	strong: { toDOM: () => ["strong", 0] as const },
	emphasis: { toDOM: () => ["em", 0] as const },
	link: {
		attrs: { key: {}, href: {} },
		inclusive: false,
		toDOM: (mark: Mark) => [
			"a",
			{ href: mark.attrs.href, rel: "noreferrer noopener", target: "_blank" },
			0,
		] as const,
	},
};

export const blogRichTextSchema = new Schema({ nodes, marks });

function marksToProseMirror(span: BlogRichTextSpan, sourceScope: string) {
	const result = [blogRichTextSchema.marks.source_span.create({
		key: span.key,
		sourceScope,
		semanticMarks: span.marks,
	})];
	for (const mark of span.marks) {
		if (mark.type === "strong") result.push(blogRichTextSchema.marks.strong.create());
		else if (mark.type === "emphasis") result.push(blogRichTextSchema.marks.emphasis.create());
		else result.push(blogRichTextSchema.marks.link.create({ key: mark.key, href: mark.href }));
	}
	return result;
}

function spansToProseMirror(spans: readonly BlogRichTextSpan[], sourceScope: string) {
	return spans.map((span) => span.text.length === 0
		? blogRichTextSchema.nodes.empty_span.create({
			key: span.key,
			sourceScope,
			semanticMarks: span.marks,
		})
		: blogRichTextSchema.text(span.text, marksToProseMirror(span, sourceScope)));
}

export function blogRichTextToProseMirror(document: BlogRichTextDocument) {
	const content = document.blocks.map((block) => {
		if (block.type === "paragraph") {
			return blogRichTextSchema.nodes.paragraph.create(
				{ key: block.key },
				spansToProseMirror(block.children, block.key),
			);
		}
		if (block.type === "heading") {
			return blogRichTextSchema.nodes.heading.create(
				{ key: block.key, level: block.level },
				spansToProseMirror(block.children, block.key),
			);
		}
		if (block.type === "quote") {
			return blogRichTextSchema.nodes.blockquote.create(
				{ key: block.key },
				spansToProseMirror(block.children, block.key),
			);
		}
		if (block.type === "list") {
			const type = block.style === "bullet"
				? blogRichTextSchema.nodes.bullet_list
				: blogRichTextSchema.nodes.ordered_list;
			return type.create(
				{ key: block.key },
				block.items.map((item) => blogRichTextSchema.nodes.list_item.create(
					{ key: item.key },
					blogRichTextSchema.nodes.paragraph.create(
						{ key: `${item.key}-content` },
						spansToProseMirror(item.children, item.key),
					),
				)),
			);
		}
		return blogRichTextSchema.nodes.image.create({
			key: block.key,
			assetId: block.assetId,
			altText: block.altText ?? null,
			caption: block.caption ?? null,
		});
	});
	return blogRichTextSchema.nodes.doc.create(null, content);
}

export type BlogRichTextKeyFactory = (prefix: string) => string;

export function createBlogRichTextKeyFactory(
	document: BlogRichTextDocument,
	seed = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12),
): BlogRichTextKeyFactory {
	const used = new Set<string>();
	for (const block of document.blocks) {
		used.add(block.key);
		if (block.type === "list") {
			for (const item of block.items) {
				used.add(item.key);
				for (const span of item.children) {
					used.add(span.key);
					for (const mark of span.marks) if (mark.type === "link") used.add(mark.key);
				}
			}
		} else if (block.type !== "image") {
			for (const span of block.children) {
				used.add(span.key);
				for (const mark of span.marks) if (mark.type === "link") used.add(mark.key);
			}
		}
	}
	let counter = 0;
	return (prefix) => {
		let candidate = "";
		do {
			counter += 1;
			candidate = `${prefix}-${seed}-${counter.toString(36)}`.slice(
				0,
				BLOG_RICH_TEXT_LIMITS.keyCharacters,
			);
		} while (used.has(candidate));
		used.add(candidate);
		return candidate;
	};
}

function semanticMarksFromProseMirror(marks: readonly Mark[]): BlogRichTextMark[] {
	const result: BlogRichTextMark[] = [];
	if (marks.some((mark) => mark.type === blogRichTextSchema.marks.strong)) {
		result.push({ type: "strong" });
	}
	if (marks.some((mark) => mark.type === blogRichTextSchema.marks.emphasis)) {
		result.push({ type: "emphasis" });
	}
	const link = marks.find((mark) => mark.type === blogRichTextSchema.marks.link);
	if (link) result.push({ type: "link", key: link.attrs.key, href: link.attrs.href });
	const source = marks.find((mark) => mark.type === blogRichTextSchema.marks.source_span);
	const original = source?.attrs.semanticMarks;
	if (Array.isArray(original)) {
		const inspected = inspectSpans([{
			type: "text",
			key: "comparison",
			text: "",
			marks: original,
		}], { characters: 0 });
		const originalMarks = inspected?.[0]?.marks;
		if (
			originalMarks
			&& JSON.stringify([...originalMarks].sort(compareMarks))
				=== JSON.stringify([...result].sort(compareMarks))
		) return originalMarks;
	}
	return result;
}

function compareMarks(left: BlogRichTextMark, right: BlogRichTextMark) {
	const order = { strong: 0, emphasis: 1, link: 2 } as const;
	return order[left.type] - order[right.type];
}

function spansFromProseMirror(
	container: ProseMirrorNode,
	nextKey: BlogRichTextKeyFactory,
	usedSourceOrigins: Set<string>,
): BlogRichTextSpan[] {
	const used = new Set<string>();
	const spans: BlogRichTextSpan[] = [];
	container.forEach((child) => {
		if (child.type === blogRichTextSchema.nodes.empty_span) {
			const candidate = child.attrs.key;
			const origin = `${String(child.attrs.sourceScope)}\u0000${String(candidate)}`;
			const canReuse = isContractKey(candidate)
				&& !used.has(candidate)
				&& !usedSourceOrigins.has(origin);
			const key = canReuse ? candidate : nextKey("span");
			usedSourceOrigins.add(origin);
			used.add(key);
			spans.push({
				type: "text",
				key,
				text: "",
				marks: Array.isArray(child.attrs.semanticMarks)
					? child.attrs.semanticMarks as BlogRichTextMark[]
					: [],
			});
			return;
		}
		if (!child.isText || typeof child.text !== "string") return;
		const source = child.marks.find((mark) => mark.type === blogRichTextSchema.marks.source_span);
		const candidate = source?.attrs.key;
		const origin = `${String(source?.attrs.sourceScope)}\u0000${String(candidate)}`;
		const canReuse = isContractKey(candidate)
			&& !used.has(candidate)
			&& !usedSourceOrigins.has(origin);
		const key = canReuse ? candidate : nextKey("span");
		usedSourceOrigins.add(origin);
		used.add(key);
		spans.push({
			type: "text",
			key,
			text: child.text,
			marks: semanticMarksFromProseMirror(child.marks),
		});
	});
	if (spans.length === 0) {
		spans.push({ type: "text", key: nextKey("span"), text: "", marks: [] });
	}
	return spans;
}

function uniqueContractKey(
	candidate: unknown,
	used: Set<string>,
	nextKey: BlogRichTextKeyFactory,
	prefix: string,
) {
	const key = isContractKey(candidate) && !used.has(candidate) ? candidate : nextKey(prefix);
	used.add(key);
	return key;
}

export function blogRichTextFromProseMirror(
	document: ProseMirrorNode,
	nextKey: BlogRichTextKeyFactory,
): BlogRichTextDocument {
	if (document.type !== blogRichTextSchema.nodes.doc) {
		throw new Error("Expected the Blog rich-text ProseMirror document");
	}
	const blockKeys = new Set<string>();
	const usedSourceOrigins = new Set<string>();
	const blocks: BlogRichTextBlock[] = [];
	document.forEach((node) => {
		const key = uniqueContractKey(node.attrs.key, blockKeys, nextKey, "block");
		if (node.type === blogRichTextSchema.nodes.paragraph) {
			blocks.push({
				type: "paragraph",
				key,
				children: spansFromProseMirror(node, nextKey, usedSourceOrigins),
			});
			return;
		}
		if (node.type === blogRichTextSchema.nodes.heading) {
			const level = node.attrs.level;
			if (level !== 2 && level !== 3 && level !== 4) throw new Error("Unsupported heading level");
			blocks.push({
				type: "heading",
				key,
				level,
				children: spansFromProseMirror(node, nextKey, usedSourceOrigins),
			});
			return;
		}
		if (node.type === blogRichTextSchema.nodes.blockquote) {
			blocks.push({
				type: "quote",
				key,
				children: spansFromProseMirror(node, nextKey, usedSourceOrigins),
			});
			return;
		}
		if (
			node.type === blogRichTextSchema.nodes.bullet_list
			|| node.type === blogRichTextSchema.nodes.ordered_list
		) {
			const itemKeys = new Set<string>();
			const items: BlogRichTextListItem[] = [];
			node.forEach((item) => {
				if (item.type !== blogRichTextSchema.nodes.list_item) {
					throw new Error("Unsupported list item");
				}
				const content = item.firstChild;
				if (!content || content.type !== blogRichTextSchema.nodes.paragraph) {
					throw new Error("Unsupported list item content");
				}
				items.push({
					key: uniqueContractKey(item.attrs.key, itemKeys, nextKey, "item"),
					children: spansFromProseMirror(content, nextKey, usedSourceOrigins),
				});
			});
			blocks.push({
				type: "list",
				key,
				style: node.type === blogRichTextSchema.nodes.bullet_list ? "bullet" : "number",
				items,
			});
			return;
		}
		if (node.type === blogRichTextSchema.nodes.image) {
			const altText = typeof node.attrs.altText === "string" ? node.attrs.altText.trim() : "";
			const caption = typeof node.attrs.caption === "string" ? node.attrs.caption.trim() : "";
			blocks.push({
				type: "image",
				key,
				assetId: node.attrs.assetId,
				...(altText ? { altText } : {}),
				...(caption ? { caption } : {}),
			});
			return;
		}
		throw new Error(`Unsupported ProseMirror block ${node.type.name}`);
	});
	const result: BlogRichTextDocument = { version: 1, blocks };
	const inspected = inspectBlogRichTextDocument(result);
	if (!inspected.editable) throw new Error(inspected.reason);
	return inspected.document;
}

export function blogRichTextDocumentsEqual(
	left: BlogRichTextDocument,
	right: BlogRichTextDocument,
) {
	return JSON.stringify(left) === JSON.stringify(right);
}
