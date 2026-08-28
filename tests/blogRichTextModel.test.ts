import { splitBlock, toggleMark } from "prosemirror-commands";
import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
	BLOG_RICH_TEXT_LIMITS,
	blogRichTextDocumentsEqual,
	blogRichTextFromProseMirror,
	blogRichTextSchema,
	blogRichTextToProseMirror,
	createBlogRichTextKeyFactory,
	inspectBlogRichTextDocument,
	isSafeBlogRichTextUrl,
	type BlogRichTextDocument,
} from "../src/lib/blogRichTextModel";

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
				children: [{ type: "text", key: "repeated", text: "H2", marks: [] }],
			},
			{
				type: "heading",
				key: "heading-3",
				level: 3,
				children: [{ type: "text", key: "repeated", text: "H3", marks: [] }],
			},
			{
				type: "heading",
				key: "heading-4",
				level: 4,
				children: [{ type: "text", key: "repeated", text: "H4", marks: [] }],
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
				items: [
					{
						key: "bullet-1",
						children: [{ type: "text", key: "item-text", text: "First", marks: [] }],
					},
					{
						key: "bullet-2",
						children: [{ type: "text", key: "item-text", text: "Second", marks: [] }],
					},
				],
			},
			{
				type: "list",
				key: "number-list",
				style: "number",
				items: [{
					key: "number-1",
					children: [{ type: "text", key: "number-text", text: "One", marks: [] }],
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

describe("Blog rich-text ProseMirror adapter", () => {
	it("round-trips the full schema-v1 compatibility corpus byte-for-byte", () => {
		const source = compatibilityDocument();
		const inspected = inspectBlogRichTextDocument(source);
		expect(inspected).toMatchObject({ editable: true });
		if (!inspected.editable) return;
		const proseMirror = blogRichTextToProseMirror(inspected.document);
		const restored = blogRichTextFromProseMirror(
			proseMirror,
			createBlogRichTextKeyFactory(source, "roundtrip"),
		);
		expect(restored).toEqual(source);
		expect(blogRichTextDocumentsEqual(restored, source)).toBe(true);
	});

	it("keeps untouched blocks exact and allocates new keys only to split span fragments", () => {
		const source: BlogRichTextDocument = {
			version: 1,
			blocks: [
				{
					type: "paragraph",
					key: "paragraph",
					children: [{ type: "text", key: "original-span", text: "abcdef", marks: [] }],
				},
				compatibilityDocument().blocks[7],
			],
		};
		const proseMirror = blogRichTextToProseMirror(source);
		let state = EditorState.create({
			schema: blogRichTextSchema,
			doc: proseMirror,
			selection: TextSelection.create(proseMirror, 3, 5),
		});
		toggleMark(blogRichTextSchema.marks.strong)(state, (transaction) => {
			state = state.apply(transaction);
		});
		const restored = blogRichTextFromProseMirror(
			state.doc,
			createBlogRichTextKeyFactory(source, "localized"),
		);
		expect(restored.blocks[1]).toEqual(source.blocks[1]);
		const paragraph = restored.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		expect(paragraph.children.map((span) => span.text)).toEqual(["ab", "cd", "ef"]);
		expect(paragraph.children[0].key).toBe("original-span");
		expect(new Set(paragraph.children.map((span) => span.key)).size).toBe(3);
		expect(paragraph.children[1].marks).toEqual([{ type: "strong" }]);
	});

	it("preserves the exact supported mark order and link key in untouched spans", () => {
		const source: BlogRichTextDocument = {
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "paragraph",
				children: [{
					type: "text",
					key: "span",
					text: "linked emphasis",
					marks: [
						{ type: "link", key: "original-link", href: "/journal" },
						{ type: "emphasis" },
						{ type: "strong" },
					],
				}],
			}],
		};
		const restored = blogRichTextFromProseMirror(
			blogRichTextToProseMirror(source),
			createBlogRichTextKeyFactory(source, "marks"),
		);
		expect(restored).toEqual(source);
	});

	it("keeps the original key on the first surviving block fragment and keys the split", () => {
		const source: BlogRichTextDocument = {
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "paragraph",
				children: [{ type: "text", key: "original-span", text: "abcdef", marks: [] }],
			}],
		};
		const proseMirror = blogRichTextToProseMirror(source);
		let state = EditorState.create({
			schema: blogRichTextSchema,
			doc: proseMirror,
			selection: TextSelection.create(proseMirror, 4),
		});
		splitBlock(state, (transaction) => {
			state = state.apply(transaction);
		});
		const restored = blogRichTextFromProseMirror(
			state.doc,
			createBlogRichTextKeyFactory(source, "split"),
		);
		expect(restored.blocks).toHaveLength(2);
		const [first, second] = restored.blocks;
		if (first.type !== "paragraph" || second.type !== "paragraph") {
			throw new Error("Expected split paragraphs");
		}
		expect(first.children).toMatchObject([{ key: "original-span", text: "abc" }]);
		expect(second.children[0].text).toBe("def");
		expect(second.children[0].key).not.toBe("original-span");
	});

	it("fails closed for unsupported structures instead of normalizing them", () => {
		for (const value of [
			{ version: 2, blocks: [] },
			{ version: 1, blocks: [], html: "<p>no</p>" },
			{ version: 1, blocks: [{ type: "code", key: "code", text: "no" }] },
			{
				version: 1,
				blocks: [{
					type: "heading",
					key: "h1",
					level: 1,
					children: [{ type: "text", key: "text", text: "No H1", marks: [] }],
				}],
			},
			{
				version: 1,
				blocks: [{
					type: "paragraph",
					key: "paragraph",
					children: [{ type: "text", key: "text", text: "Code", marks: [{ type: "code" }] }],
				}],
			},
		]) expect(inspectBlogRichTextDocument(value as never).editable).toBe(false);
	});

	it("enforces the shared schema-v1 shape and authoring limits at their boundaries", () => {
		const paragraph = (key: string, text = "ok") => ({
			type: "paragraph" as const,
			key,
			children: [{ type: "text" as const, key: `${key}-text`, text, marks: [] }],
		});
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: Array.from({ length: BLOG_RICH_TEXT_LIMITS.blocks }, (_, index) =>
				paragraph(`block-${String(index)}`)),
		}).editable).toBe(true);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: Array.from({ length: BLOG_RICH_TEXT_LIMITS.blocks + 1 }, (_, index) =>
				paragraph(`block-${String(index)}`)),
		}).editable).toBe(false);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "too-many-spans",
				children: Array.from({ length: BLOG_RICH_TEXT_LIMITS.spans + 1 }, (_, index) => ({
					type: "text",
					key: `span-${String(index)}`,
					text: "",
					marks: [],
				})),
			}],
		}).editable).toBe(false);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: [paragraph("long", "x".repeat(BLOG_RICH_TEXT_LIMITS.spanCharacters + 1))],
		}).editable).toBe(false);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: [{
				type: "list",
				key: "list",
				style: "bullet",
				items: Array.from({ length: BLOG_RICH_TEXT_LIMITS.listItems + 1 }, (_, index) => ({
					key: `item-${String(index)}`,
					children: [],
				})),
			}],
		}).editable).toBe(false);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "marks",
				children: [{
					type: "text",
					key: "marked",
					text: "four marks",
					marks: [
						{ type: "strong" },
						{ type: "emphasis" },
						{ type: "link", key: "one", href: "/one" },
						{ type: "link", key: "two", href: "/two" },
					],
				}],
			}],
		}).editable).toBe(false);
		expect(inspectBlogRichTextDocument({
			version: 1,
			blocks: Array.from({ length: BLOG_RICH_TEXT_LIMITS.blocks }, (_, index) => ({
				type: "image",
				key: `image-${String(index)}`,
				assetId: `asset-${String(index)}`,
				altText: "a".repeat(300),
			})),
		}).editable).toBe(false);
		const exactCharacterLimit: BlogRichTextDocument = {
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "character-limit",
				children: Array.from({ length: 15 }, (_, index) => ({
					type: "text",
					key: `span-${String(index)}`,
					text: "x".repeat(BLOG_RICH_TEXT_LIMITS.spanCharacters),
					marks: [],
				})),
			}],
		};
		expect(inspectBlogRichTextDocument(exactCharacterLimit).editable).toBe(true);
		exactCharacterLimit.blocks[0].children[0].marks.push({
			type: "link",
			key: "limit-link",
			href: "/x",
		});
		expect(inspectBlogRichTextDocument(exactCharacterLimit).editable).toBe(false);
	});

	it("accepts only the link schemes shared with the Convex contract", () => {
		for (const href of [
			"https://example.com/path",
			"http://example.com",
			"mailto:hello@example.com",
			"tel:+13125550100",
			"/blog/a-post",
			"#details",
		]) expect(isSafeBlogRichTextUrl(href)).toBe(true);
		for (const href of ["", "javascript:alert(1)", "data:text/html,no", "//evil.example", "relative/path"]) {
			expect(isSafeBlogRichTextUrl(href)).toBe(false);
		}
	});

	it("requires stored optional strings to match Convex normalization", () => {
		const source = compatibilityDocument();
		const paragraph = source.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		const link = paragraph.children[1].marks[2];
		if (link.type !== "link") throw new Error("Expected link");
		link.href = " https://example.com/story ";
		expect(inspectBlogRichTextDocument(source).editable).toBe(false);

		const imageSource = compatibilityDocument();
		const image = imageSource.blocks.at(-1);
		if (!image || image.type !== "image") throw new Error("Expected image");
		image.altText = " padded alt ";
		expect(inspectBlogRichTextDocument(imageSource).editable).toBe(false);
	});

	it("does not share nested references with the caller", () => {
		const source = compatibilityDocument();
		const inspected = inspectBlogRichTextDocument(source);
		if (!inspected.editable) throw new Error(inspected.reason);
		const paragraph = inspected.document.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		paragraph.children[1].text = "Changed";
		expect((source.blocks[0] as { children: Array<{ text: string }> }).children[1].text).toBe(
			"Read the story",
		);
	});
});
