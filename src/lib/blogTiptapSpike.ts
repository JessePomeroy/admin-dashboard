import { Extension, Mark, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
	blogRichTextFromProseMirror,
	blogRichTextSchema,
	blogRichTextToProseMirror,
	type BlogRichTextDocument,
	type BlogRichTextKeyFactory,
} from "./blogRichTextModel";

function keyedBlock(name: "paragraph" | "blockquote", tag: "p" | "blockquote") {
	return Node.create({
		name,
		group: "block",
		content: "inline*",
		addAttributes: () => ({ key: { default: null } }),
		renderHTML: ({ HTMLAttributes }) => [tag, { "data-rich-block-key": HTMLAttributes.key }, 0],
	});
}

const ContractDocument = Node.create({
	name: "doc",
	topNode: true,
	content: "block*",
});

const ContractParagraph = keyedBlock("paragraph", "p");
const ContractBlockquote = keyedBlock("blockquote", "blockquote");

const ContractHeading = Node.create({
	name: "heading",
	group: "block",
	content: "inline*",
	addAttributes: () => ({ key: { default: null }, level: { default: 2 } }),
	renderHTML: ({ HTMLAttributes }) => [
		`h${String(HTMLAttributes.level)}`,
		{ "data-rich-block-key": HTMLAttributes.key },
		0,
	],
});

function contractList(name: "bullet_list" | "ordered_list", tag: "ul" | "ol") {
	return Node.create({
		name,
		group: "block",
		content: "list_item*",
		addAttributes: () => ({ key: { default: null } }),
		renderHTML: ({ HTMLAttributes }) => [tag, { "data-rich-block-key": HTMLAttributes.key }, 0],
	});
}

const ContractBulletList = contractList("bullet_list", "ul");
const ContractOrderedList = contractList("ordered_list", "ol");

const ContractListItem = Node.create({
	name: "list_item",
	content: "paragraph",
	addAttributes: () => ({ key: { default: null } }),
	renderHTML: ({ HTMLAttributes }) => ["li", { "data-rich-item-key": HTMLAttributes.key }, 0],
});

const ContractImage = Node.create({
	name: "image",
	group: "block",
	atom: true,
	selectable: true,
	draggable: false,
	addAttributes: () => ({
		key: { default: null },
		assetId: { default: null },
		altText: { default: null },
		caption: { default: null },
	}),
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		{
			"data-rich-image-key": HTMLAttributes.key,
			"data-rich-asset-id": HTMLAttributes.assetId,
		},
		"image",
	],
});

const ContractEmptySpan = Node.create({
	name: "empty_span",
	inline: true,
	group: "inline",
	atom: true,
	selectable: false,
	addAttributes: () => ({
		key: { default: null },
		sourceScope: { default: null },
		semanticMarks: { default: [] },
	}),
	renderHTML: ({ HTMLAttributes }) => [
		"span",
		{ "data-rich-empty-span": HTMLAttributes.key, "aria-hidden": "true" },
		"\u200b",
	],
});

const ContractText = Node.create({ name: "text", group: "inline" });

const ContractSourceSpan = Mark.create({
	name: "source_span",
	addAttributes: () => ({
		key: { default: null },
		sourceScope: { default: null },
		semanticMarks: { default: [] },
	}),
	renderHTML: ({ HTMLAttributes }) => ["span", { "data-rich-span-key": HTMLAttributes.key }, 0],
});

const ContractStrong = Mark.create({
	name: "strong",
	renderHTML: () => ["strong", 0],
});

const ContractEmphasis = Mark.create({
	name: "emphasis",
	renderHTML: () => ["em", 0],
});

const ContractLink = Mark.create({
	name: "link",
	inclusive: false,
	addAttributes: () => ({ key: { default: null }, href: { default: null } }),
	renderHTML: ({ HTMLAttributes }) => [
		"a",
		{
			href: HTMLAttributes.href,
			rel: "noreferrer noopener",
			target: "_blank",
		},
		0,
	],
});

const HistoryOnlyStarterKit = StarterKit.configure({
	blockquote: false,
	bold: false,
	bulletList: false,
	code: false,
	codeBlock: false,
	document: false,
	dropcursor: false,
	gapcursor: false,
	hardBreak: false,
	heading: false,
	horizontalRule: false,
	italic: false,
	link: false,
	listItem: false,
	listKeymap: false,
	orderedList: false,
	paragraph: false,
	strike: false,
	text: false,
	trailingNode: false,
	underline: false,
	undoRedo: {},
});

const ContractKeyboard = Extension.create({
	name: "contractKeyboard",
	addKeyboardShortcuts() {
		return {
			"Mod-b": () => this.editor.commands.toggleMark("strong"),
			"Mod-i": () => this.editor.commands.toggleMark("emphasis"),
		};
	},
});

export const blogTiptapSpikeExtensions = [
	ContractDocument,
	ContractParagraph,
	ContractHeading,
	ContractBlockquote,
	ContractBulletList,
	ContractOrderedList,
	ContractListItem,
	ContractImage,
	ContractEmptySpan,
	ContractText,
	ContractSourceSpan,
	ContractStrong,
	ContractEmphasis,
	ContractLink,
	HistoryOnlyStarterKit,
	ContractKeyboard,
];

export function blogRichTextToTiptap(document: BlogRichTextDocument): JSONContent {
	return blogRichTextToProseMirror(document).toJSON();
}

export function blogRichTextFromTiptap(
	content: JSONContent,
	nextKey: BlogRichTextKeyFactory,
): BlogRichTextDocument {
	return blogRichTextFromProseMirror(blogRichTextSchema.nodeFromJSON(content), nextKey);
}
