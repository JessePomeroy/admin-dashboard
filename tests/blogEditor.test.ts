import { describe, expect, it, vi } from "vitest";
import {
	authorBioFromText,
	authorBioSupportsPlainTextEditing,
	authorBioToText,
	blogDocumentStatus,
	blogSupportingReferenceOptions,
	copyBlogSupportingDraft,
	copyPostDraft,
	defaultPresentationForFormat,
	emptyPostDraft,
	hasBlogSupportingErrors,
	hasPostErrors,
	newBlogDocumentKey,
	presentationMatchesFormat,
	postBodyFromPlainText,
	postBodySupportsPlainTextEditing,
	postBodyToPlainText,
	postMediaReviewPlacements,
	resolveAuthorBioPlainTextEdit,
	resolvePostBodyPlainTextEdit,
	serializeBlogSupportingDraft,
	serializePostDraft,
	slugifyBlogTitle,
	updatePostMediaAltText,
	validateBlogSupportingForPublish,
	validatePostMetadataForPublish,
	validatePostMediaForPublish,
	type BlogSupportingEditorSummary,
	type PostDraft,
	type RichTextDocument,
} from "../src/lib/blogEditor";

describe("Blog editor helpers", () => {
	it("builds bounded one-paragraph Author bios from plain text", () => {
		const bio = authorBioFromText("  Writes about light.  ");
		expect(bio).toEqual({
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "bio-paragraph",
				children: [{
					type: "text",
					key: "bio-text",
					text: "Writes about light.",
					marks: [],
				}],
			}],
		});
		expect(authorBioToText(bio)).toBe("Writes about light.");
		expect(authorBioFromText("   ")).toBeUndefined();
	});

	it("copies and serializes supporting drafts without sharing nested references", () => {
		const original = {
			kind: "author",
			name: "Maggie",
			slug: "maggie",
			bio: authorBioFromText("Photographer."),
			portrait: {
				key: "portrait-key",
				assetId: "portrait-asset",
				altText: "Maggie beside a window.",
				caption: "Studio portrait",
			},
		} as const;
		const copied = copyBlogSupportingDraft(original, "author");
		if (copied.kind !== "author") throw new Error("Expected author draft");
		const firstBlock = copied.bio?.blocks[0];
		if (firstBlock && firstBlock.type !== "list") firstBlock.children.splice(0, 1);
		if (copied.portrait) copied.portrait.altText = "Changed alt text.";
		expect(authorBioToText(original.bio)).toBe("Photographer.");
		expect(original.portrait.altText).toBe("Maggie beside a window.");
		expect(serializeBlogSupportingDraft(original)).toContain('"assetId":"portrait-asset"');
		expect(serializeBlogSupportingDraft({
			kind: "category",
			title: "Field Notes",
			slug: "field-notes",
			description: "",
		})).toContain("field-notes");
	});

	it("projects rich Author bios safely and refuses to flatten them", () => {
		const richBio = {
			version: 1,
			blocks: [
				{
					type: "heading",
					key: "heading",
					level: 2,
					children: [{
						type: "text",
						key: "heading-text",
						text: "Photographer and writer",
						marks: [{ type: "strong" }],
					}],
				},
				{
					type: "list",
					key: "list",
					style: "bullet",
					items: [{
						key: "item",
						children: [{
							type: "text",
							key: "item-text",
							text: "Works with light",
							marks: [],
						}],
					}],
				},
			],
		} satisfies RichTextDocument;
		expect(authorBioToText(richBio)).toBe("Photographer and writer\n\nWorks with light");
		expect(authorBioSupportsPlainTextEditing(richBio)).toBe(false);
		const resolved = resolveAuthorBioPlainTextEdit(
			richBio,
			"Photographer and writer\n\nWorks with light",
			"Attempted replacement",
		);
		expect(resolved).toEqual(richBio);
		expect(resolved).not.toBe(richBio);
	});

	it("preserves Author bio keys until its plain text actually changes", () => {
		const bio = {
			version: 1 as const,
			blocks: [{
				type: "paragraph" as const,
				key: "imported-paragraph-key",
				children: [{
					type: "text" as const,
					key: "imported-text-key",
					text: "Imported biography.",
					marks: [] as [],
				}],
			}],
		};
		const unchanged = resolveAuthorBioPlainTextEdit(
			bio,
			"Imported biography.",
			"Imported biography.",
		);
		expect(unchanged).toEqual(bio);
		expect(unchanged).not.toBe(bio);
		expect(unchanged?.blocks[0]).not.toBe(bio.blocks[0]);
		expect(resolveAuthorBioPlainTextEdit(
			bio,
			"Imported biography.",
			"Updated biography.",
		)?.blocks[0]).toMatchObject({
			key: "bio-paragraph",
			children: [{ key: "bio-text", text: "Updated biography." }],
		});
	});

	it("validates publish requirements for Authors and Categories", () => {
		expect(hasBlogSupportingErrors(validateBlogSupportingForPublish({
			kind: "author",
			name: "",
			slug: "Bad Slug",
		}))).toBe(true);
		expect(validateBlogSupportingForPublish({
			kind: "category",
			title: "Field Notes",
			slug: "field-notes",
			description: "Essays and notes.",
		})).toEqual({});
		expect(validateBlogSupportingForPublish({
			kind: "author",
			name: "Maggie",
			slug: "maggie",
			portrait: {
				key: "portrait-key",
				assetId: "portrait-asset",
				altText: "   ",
			},
		}).portraitAltText).toContain("needs alt text");
		expect(validateBlogSupportingForPublish({
			kind: "author",
			name: "Maggie",
			slug: "maggie",
			portrait: {
				key: "portrait-key",
				assetId: "portrait-asset",
				altText: "Maggie beside a window.",
			},
		})).toEqual({});
	});

	it("normalizes URL slugs and makes document keys", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
		vi.spyOn(Math, "random").mockReturnValue(0.123456);
		expect(slugifyBlogTitle(" Café Field Notes! ")).toBe("cafe-field-notes");
		expect(newBlogDocumentKey("author")).toMatch(/^author-[a-z0-9]+-[a-z0-9]+$/);
		expect(newBlogDocumentKey("post")).toMatch(/^post-[a-z0-9]+-[a-z0-9]+$/);
		vi.restoreAllMocks();
	});

	it("offers published supporting records and currently linked drafts only", () => {
		const summary = (
			documentId: string,
			publishedRevisionId: string | null,
			archivedAt: number | null = null,
		): BlogSupportingEditorSummary => ({
			documentId,
			documentKey: documentId,
			kind: "author",
			slug: documentId,
			rank: 0,
			label: documentId,
			draftRevisionId: `${documentId}-draft`,
			publishedRevisionId,
			updatedAt: 1,
			archivedAt,
		});
		const choices = blogSupportingReferenceOptions([
			summary("published", "published-revision"),
			summary("linked-draft", null),
			summary("unrelated-draft", null),
			summary("linked-archived", null, 2),
			summary("unrelated-archived", "published-revision", 2),
		], ["linked-draft", "linked-archived"]);
		expect(choices.map((choice) => choice.documentId)).toEqual([
			"published",
			"linked-draft",
			"linked-archived",
		]);
	});

	it("deep-copies Post drafts while preserving references and rich media", () => {
		const original: PostDraft = {
			...emptyPostDraft(),
			title: "A Post",
			slug: "a-post",
			authorDocumentId: "author-document",
			categories: [{ key: "category-reference", documentId: "category-document" }],
			mainImage: {
				key: "main-image",
				assetId: "main-asset",
				altText: "Main image alt.",
				caption: "Main image caption.",
			},
			body: {
				version: 1,
				blocks: [
					{
						type: "paragraph",
						key: "paragraph-key",
						children: [{
							type: "text",
							key: "text-key",
							text: "Paragraph text.",
							marks: [],
						}],
					},
					{
						type: "image",
						key: "body-image",
						assetId: "body-asset",
						altText: "Body image alt.",
						caption: "Body image caption.",
					},
				],
			},
		};
		// Svelte $state values are proxies; the copy path must not use structuredClone.
		const copied = copyPostDraft({ ...original, body: new Proxy(original.body, {}) });
		expect(serializePostDraft(copied)).toBe(serializePostDraft(original));
		(copied.body.blocks[0] as {
			children: Array<{ text: string }>;
		}).children[0].text = "Changed paragraph.";
		copied.categories[0].documentId = "changed-category";
		if (copied.mainImage) copied.mainImage.caption = "Changed caption.";
		expect((original.body.blocks[0] as {
			children: Array<{ text: string }>;
		}).children[0].text).toBe("Paragraph text.");
		expect(original.categories[0].documentId).toBe("category-document");
		expect(original.mainImage?.caption).toBe("Main image caption.");
	});

	it("converts simple Post body paragraphs to and from plain text", () => {
		const body = postBodyFromPlainText("First paragraph.\n\nSecond paragraph.");
		expect(body.blocks).toHaveLength(2);
		expect(body.blocks[0]).toMatchObject({
			type: "paragraph",
			children: [{ text: "First paragraph.", marks: [] }],
		});
		expect(postBodyToPlainText(body)).toBe("First paragraph.\n\nSecond paragraph.");
		expect(postBodyFromPlainText("   ").blocks).toEqual([]);
	});

	it("only permits plain-text editing for exactly representable bodies", () => {
		const simple = postBodyFromPlainText("Original paragraph.");
		expect(postBodySupportsPlainTextEditing(simple)).toBe(true);
		expect(postBodySupportsPlainTextEditing({ version: 1, blocks: [] })).toBe(true);
		expect(postBodySupportsPlainTextEditing({
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "marked-paragraph",
				children: [{
					type: "text",
					key: "marked-text",
					text: "Marked text.",
					marks: ["em"],
				}],
			}],
		})).toBe(false);
		expect(postBodySupportsPlainTextEditing({
			version: 1,
			blocks: [{ type: "image", key: "image", assetId: "asset" }],
		})).toBe(false);
		expect(postBodySupportsPlainTextEditing({
			version: 1,
			blocks: [{
				type: "paragraph",
				key: "styled-paragraph",
				style: "normal",
				children: [],
			}],
		})).toBe(false);
		expect(postBodyToPlainText(resolvePostBodyPlainTextEdit(
			simple,
			"Original paragraph.",
			"Updated paragraph.",
		))).toBe("Updated paragraph.");
	});

	it("refuses to flatten rich bodies even if plain text changes", () => {
		const richBody = {
			version: 1 as const,
			blocks: [
				{
					type: "paragraph",
					key: "paragraph",
					children: [{
						type: "text",
						key: "text",
						text: "Existing paragraph.",
						marks: [],
					}],
				},
				{ type: "image", key: "image", assetId: "asset", altText: "Existing alt." },
			],
		};
		const resolved = resolvePostBodyPlainTextEdit(
			richBody,
			"Existing paragraph.",
			"Attempted replacement.",
		);
		expect(resolved).toEqual(richBody);
		expect(resolved).not.toBe(richBody);
		expect(resolved.blocks[0]).not.toBe(richBody.blocks[0]);
	});

	it("reviews Post media in public order and updates only the selected alt", () => {
		const draft: PostDraft = {
			...emptyPostDraft(),
			mainImage: {
				key: "main",
				assetId: "main-asset",
				altText: "   ",
				caption: "Main caption",
			},
			body: {
				version: 1,
				blocks: [
					{ type: "paragraph", key: "paragraph", children: [] },
					{
						type: "image",
						key: "first-image",
						assetId: "first-asset",
						altText: "",
						caption: "First caption",
					},
					{ type: "custom", key: "custom-block", value: { nested: true } },
					{
						type: "image",
						key: "second-image",
						assetId: "second-asset",
						altText: "A".repeat(501),
						caption: "Second caption",
					},
				],
			},
		};
		expect(postMediaReviewPlacements(draft)).toMatchObject([
			{
				fieldId: "post-main-image-alt",
				kind: "main",
				assetId: "main-asset",
			},
			{
				fieldId: "post-body-image-first-image-alt",
				kind: "body",
				bodyImageIndex: 0,
				blockIndex: 1,
				assetId: "first-asset",
			},
			{
				fieldId: "post-body-image-second-image-alt",
				kind: "body",
				bodyImageIndex: 1,
				blockIndex: 3,
				assetId: "second-asset",
			},
		]);
		const updated = updatePostMediaAltText(
			draft,
			"post-body-image-first-image-alt",
			"First image description.",
		);
		const expected = structuredClone(draft);
		(expected.body.blocks[1] as { altText: string }).altText = "First image description.";
		expect(updated).toEqual(expected);
		expect((draft.body.blocks[1] as { altText: string }).altText).toBe("");
		expect(validatePostMediaForPublish(draft)).toEqual([
			{ fieldId: "post-main-image-alt", message: "Main image needs alt text." },
			{
				fieldId: "post-body-image-first-image-alt",
				message: "Body image 1 needs alt text.",
			},
			{
				fieldId: "post-body-image-second-image-alt",
				message: "Body image 2 alt text must be 500 characters or fewer.",
			},
		]);
	});

	it("validates Post metadata before publish without pretending body editing exists", () => {
		expect(presentationMatchesFormat("essay", "standard")).toBe(true);
		expect(presentationMatchesFormat("essay", "technical")).toBe(false);
		expect(defaultPresentationForFormat("projectStory")).toBe("caseStudy");
		const errors = validatePostMetadataForPublish({
			...emptyPostDraft(),
			title: "Field Notes",
			slug: "field-notes",
			summary: "A short public summary.",
			authorDocumentId: "author-id",
		});
		expect(hasPostErrors(errors)).toBe(true);
		expect(errors.body).toContain("body text");
		expect(validatePostMetadataForPublish({
			...emptyPostDraft(),
			title: "Field Notes",
			slug: "field-notes",
			summary: "A short public summary.",
			authorDocumentId: "author-id",
			body: postBodyFromPlainText("A complete body."),
		}).body).toBeUndefined();
		expect(validatePostMetadataForPublish({
			...emptyPostDraft(),
			title: "Bad",
			slug: "Bad Slug",
			presentation: "technical",
		})).toMatchObject({
			slug: expect.any(String),
			presentation: expect.any(String),
			authorDocumentId: expect.any(String),
		});
	});

	it("reports draft, changed, and published statuses", () => {
		expect(blogDocumentStatus({
			documentId: "1",
			documentKey: "a",
			kind: "author",
			slug: null,
			rank: 0,
			label: "Author",
			draftRevisionId: "draft",
			publishedRevisionId: null,
			updatedAt: 1,
			archivedAt: null,
		})).toBe("draft");
		expect(blogDocumentStatus({
			documentId: "1",
			documentKey: "a",
			kind: "author",
			slug: "author",
			rank: 0,
			label: "Author",
			draftRevisionId: "draft",
			publishedRevisionId: "published",
			updatedAt: 1,
			archivedAt: null,
		})).toBe("changed");
	});
});
