import { describe, expect, it } from "vitest";
import {
	DOCUMENT_EMAIL_TEMPLATE_VARIABLES,
	emailTemplateVariablesForCategory,
	getVariableHighlightParts,
} from "../src/lib/emailTemplatePreview";

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

describe("document email template variables", () => {
	it("lists the portal and document facts actually supplied by send handlers", () => {
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{portalUrl}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{paymentUrl}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{invoiceNumber}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{quoteNumber}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{title}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{galleryLink}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{invoiceLink}}");
		expect(DOCUMENT_EMAIL_TEMPLATE_VARIABLES).toContain("{{bookingDate}}");
	});

	it("scopes ordinary category help to the sender that owns those variables", () => {
		expect(emailTemplateVariablesForCategory("reminder")).toContain(
			"{{invoiceLink}}",
		);
		expect(emailTemplateVariablesForCategory("reminder")).not.toContain(
			"{{galleryLink}}",
		);
		expect(emailTemplateVariablesForCategory("gallery-delivery")).toEqual([
			"{{clientName}}",
			"{{clientEmail}}",
			"{{galleryLink}}",
		]);
	});
});
