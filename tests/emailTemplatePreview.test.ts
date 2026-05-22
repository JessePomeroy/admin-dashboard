import { describe, expect, it } from "vitest";
import { getVariableHighlightParts } from "../src/lib/emailTemplatePreview";

describe("getVariableHighlightParts", () => {
	it("splits template variables from surrounding text", () => {
		expect(getVariableHighlightParts("hi {{clientName}}, your total is {{totalPrice}}.")).toEqual([
			{ text: "hi ", isVariable: false },
			{ text: "{{clientName}}", isVariable: true },
			{ text: ", your total is ", isVariable: false },
			{ text: "{{totalPrice}}", isVariable: true },
			{ text: ".", isVariable: false },
		]);
	});

	it("treats plain text as one non-variable part", () => {
		expect(getVariableHighlightParts("plain text")).toEqual([
			{ text: "plain text", isVariable: false },
		]);
	});
});
