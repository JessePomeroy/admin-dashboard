import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import {
	blogRichTextFromTiptap,
	blogRichTextToTiptap,
	blogTiptapSpikeExtensions,
} from "../src/lib/blogTiptapSpike";
import {
	createBlogRichTextKeyFactory,
	type BlogRichTextDocument,
} from "../src/lib/blogRichTextModel";

const editors: Editor[] = [];

function compatibilityDocument(): BlogRichTextDocument {
	return {
		version: 1,
		blocks: [
			{
				type: "paragraph",
				key: "paragraph-1",
				children: [
					{ type: "text", key: "empty", text: "", marks: [] },
					{
						type: "text",
						key: "compound",
						text: "Read the story",
						marks: [
							{ type: "strong" },
							{ type: "emphasis" },
							{ type: "link", key: "story-link", href: "https://example.com/story" },
						],
					},
				],
			},
			{
				type: "heading",
				key: "heading-2",
				level: 2,
				children: [{ type: "text", key: "heading-text", text: "Heading", marks: [] }],
			},
			{
				type: "quote",
				key: "quote-1",
				children: [{ type: "text", key: "quote-text", text: "A final thought.", marks: [] }],
			},
			{
				type: "list",
				key: "bullet-list",
				style: "bullet",
				items: [{
					key: "bullet-1",
					children: [{ type: "text", key: "item-text", text: "First", marks: [] }],
				}],
			},
			{
				type: "image",
				key: "image-1",
				assetId: "123e4567-e89b-42d3-a456-426614174000",
				altText: "A photographer framing a portrait outdoors.",
				caption: "Behind the scenes.",
			},
		],
	};
}

function createEditor(source: BlogRichTextDocument) {
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: blogTiptapSpikeExtensions,
		content: blogRichTextToTiptap(source),
		injectCSS: false,
	});
	editors.push(editor);
	return editor;
}

afterEach(() => {
	for (const editor of editors.splice(0)) editor.destroy();
});

describe("Tiptap replacement spike", () => {
	it("round-trips the supported document without changing stored JSON", () => {
		const source = compatibilityDocument();
		const editor = createEditor(source);
		expect(blogRichTextFromTiptap(
			editor.getJSON(),
			createBlogRichTextKeyFactory(source, "tiptap-roundtrip"),
		)).toEqual(source);
	});

	it("keeps the generated schema closed to the supported node and mark set", () => {
		const editor = createEditor(compatibilityDocument());
		expect(Object.keys(editor.schema.nodes).sort()).toEqual([
			"blockquote",
			"bullet_list",
			"doc",
			"empty_span",
			"heading",
			"image",
			"list_item",
			"ordered_list",
			"paragraph",
			"text",
		]);
		expect(Object.keys(editor.schema.marks).sort()).toEqual([
			"emphasis",
			"link",
			"source_span",
			"strong",
		]);
	});

	it("exposes higher-level formatting and history commands", () => {
		const source: BlogRichTextDocument = {
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "paragraph",
				children: [{ type: "text", key: "span", text: "format me", marks: [] }],
			}],
		};
		const editor = createEditor(source);
		editor.commands.setTextSelection({ from: 1, to: 10 });
		expect(editor.commands.toggleMark("strong")).toBe(true);
		expect(editor.isActive("strong")).toBe(true);
		expect(editor.can().undo()).toBe(true);
		expect(editor.commands.undo()).toBe(true);
		expect(blogRichTextFromTiptap(
			editor.getJSON(),
			createBlogRichTextKeyFactory(source, "tiptap-command"),
		)).toEqual(source);
	});
});
