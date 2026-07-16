import { describe, expect, it } from "vitest";
import {
	copyHomepageQuoteDraft,
	emptyHomepageQuoteDraft,
	hasHomepageQuoteErrors,
	serializeHomepageQuoteDraft,
	validateHomepageQuoteForPublish,
} from "../src/lib/homepageQuote";

describe("Homepage Quote editor presentation", () => {
	it("copies and serializes a stable two-field draft", () => {
		const input = { text: "Look closely.", attribution: "Maggie" };
		const copy = copyHomepageQuoteDraft(input);
		expect(copy).toEqual(input);
		expect(copy).not.toBe(input);
		expect(serializeHomepageQuoteDraft(copy)).toBe(
			'{"text":"Look closely.","attribution":"Maggie"}',
		);
		expect(emptyHomepageQuoteDraft()).toEqual({ text: "", attribution: "" });
	});

	it("requires both fields and mirrors the shared API ceilings", () => {
		expect(validateHomepageQuoteForPublish({})).toEqual({
			text: "Quote text is required",
			attribution: "Attribution is required",
		});
		expect(
			validateHomepageQuoteForPublish({
				text: "x".repeat(2_001),
				attribution: "a".repeat(161),
			}),
		).toEqual({
			text: "Quote text must be 2000 characters or fewer",
			attribution: "Attribution must be 160 characters or fewer",
		});
		expect(
			hasHomepageQuoteErrors(
				validateHomepageQuoteForPublish({ text: "Quote", attribution: "Artist" }),
			),
		).toBe(false);
	});
});
