import { describe, expect, it, vi } from "vitest";
import {
	authorBioFromText,
	authorBioToText,
	blogDocumentStatus,
	copyBlogSupportingDraft,
	copyPostDraft,
	defaultPresentationForFormat,
	emptyPostDraft,
	hasBlogSupportingErrors,
	hasPostErrors,
	newBlogDocumentKey,
	presentationMatchesFormat,
	postBodyFromPlainText,
	postBodyToPlainText,
	serializeBlogSupportingDraft,
	serializePostDraft,
	slugifyBlogTitle,
	validateBlogSupportingForPublish,
	validatePostMetadataForPublish,
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
		const copied = copyBlogSupportingDraft({
			kind: "author",
			name: "Maggie",
			slug: "maggie",
			bio: authorBioFromText("Photographer."),
		}, "author");
		if (copied.kind !== "author") throw new Error("Expected author draft");
		copied.bio?.blocks[0]?.children.splice(0, 1);
		expect(authorBioToText(authorBioFromText("Photographer."))).toBe("Photographer.");
		expect(serializeBlogSupportingDraft({
			kind: "category",
			title: "Field Notes",
			slug: "field-notes",
			description: "",
		})).toContain("field-notes");
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
	});

	it("normalizes URL slugs and makes document keys", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
		vi.spyOn(Math, "random").mockReturnValue(0.123456);
		expect(slugifyBlogTitle(" Café Field Notes! ")).toBe("cafe-field-notes");
		expect(newBlogDocumentKey("author")).toMatch(/^author-[a-z0-9]+-[a-z0-9]+$/);
		expect(newBlogDocumentKey("post")).toMatch(/^post-[a-z0-9]+-[a-z0-9]+$/);
		vi.restoreAllMocks();
	});

	it("copies and serializes Post drafts while preserving deferred body data", () => {
		const copied = copyPostDraft({
			...emptyPostDraft(),
			title: "A Post",
			slug: "a-post",
			body: {
				version: 1,
				blocks: [{ type: "custom", key: "body-block" }],
			},
		});
		copied.body.blocks.splice(0, 1);
		expect(serializePostDraft({
			...emptyPostDraft(),
			title: "A Post",
			slug: "a-post",
		})).toContain("a-post");
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
