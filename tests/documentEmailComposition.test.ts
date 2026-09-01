import { describe, expect, it } from "vitest";
import {
	buildDocumentEmailCreateFields,
	isCompleteDocumentEmailSource,
	renderDocumentEmailSource,
	resolveDocumentEmailSource,
	updateDocumentEmailCustomization,
} from "../src/lib/documentEmailComposition.js";

const templates = [
	{
		_id: "template-1",
		name: "simple invoice",
		category: "custom",
		subject: "invoice {{invoiceNumber}}",
		body: "hi {{clientName}}, review {{portalUrl}}",
	},
];

const defaults = {
	defaultSubject: "default {{invoiceNumber}}",
	defaultBody: "default body for {{clientName}}",
};

describe("documentEmailComposition", () => {
	it("requires both nonblank custom source fields", () => {
		expect(isCompleteDocumentEmailSource(undefined)).toBe(true);
		expect(
			isCompleteDocumentEmailSource({ subject: "subject", body: "body" }),
		).toBe(true);
		expect(isCompleteDocumentEmailSource({ subject: " ", body: "body" })).toBe(false);
		expect(isCompleteDocumentEmailSource({ subject: "subject", body: "\n" })).toBe(false);
		expect(() =>
			buildDocumentEmailCreateFields(
				{ customContent: { subject: "", body: "body" } },
				"templateId",
			),
		).toThrow("Custom email subject and body are both required");
	});

	it("keeps untouched default preview interpolation out of create-and-send fields", () => {
		const source = resolveDocumentEmailSource({
			templates,
			selectedTemplateId: "",
			...defaults,
		});
		const preview = renderDocumentEmailSource(source, {
			invoiceNumber: "assigned in the browser",
			clientName: "Avery",
		});

		expect(source).toEqual({
			subject: "default {{invoiceNumber}}",
			body: "default body for {{clientName}}",
		});
		expect(preview).toEqual({
			subject: "default assigned in the browser",
			body: "default body for Avery",
		});
		expect(buildDocumentEmailCreateFields({}, "templateId")).toEqual({});
	});

	it("renders owned empty optional values exactly as the server will", () => {
		expect(
			renderDocumentEmailSource(
				{
					subject: "invoice {{invoiceNumber}}",
					body: "due {{dueDate}} at {{eventLocation}}",
				},
				{ invoiceNumber: "INV-1", dueDate: "", eventLocation: "" },
			),
		).toEqual({ subject: "invoice INV-1", body: "due  at " });
	});

	it("sends only the template id when a selected template remains untouched", () => {
		const source = resolveDocumentEmailSource({
			templates,
			selectedTemplateId: "template-1",
			...defaults,
		});

		expect(source).toEqual({
			subject: "invoice {{invoiceNumber}}",
			body: "hi {{clientName}}, review {{portalUrl}}",
		});
		expect(
			buildDocumentEmailCreateFields({ templateId: "template-1" }, "templateId"),
		).toEqual({ templateId: "template-1" });
	});

	it("turns a genuine source edit into one raw subject/body pair", () => {
		const base = resolveDocumentEmailSource({
			templates,
			selectedTemplateId: "template-1",
			...defaults,
		});
		const customContent = updateDocumentEmailCustomization(
			base,
			undefined,
			"subject",
			"updated invoice {{invoiceNumber}}",
		);

		expect(
			buildDocumentEmailCreateFields(
				{ templateId: "template-1", customContent },
				"templateId",
			),
		).toEqual({
			templateId: "template-1",
			emailSubject: "updated invoice {{invoiceNumber}}",
			emailBody: "hi {{clientName}}, review {{portalUrl}}",
		});
		expect(JSON.stringify(customContent)).not.toContain("assigned in the browser");
	});

	it("clears customization after both source fields return to their base values", () => {
		const base = resolveDocumentEmailSource({
			templates,
			selectedTemplateId: "",
			...defaults,
		});
		const edited = updateDocumentEmailCustomization(base, undefined, "body", "changed body");
		const reverted = updateDocumentEmailCustomization(
			base,
			edited,
			"body",
			base.body,
		);

		expect(edited).toEqual({ subject: base.subject, body: "changed body" });
		expect(reverted).toBeUndefined();
	});

	it("maps the same selection to the contract create field without splitting custom content", () => {
		expect(
			buildDocumentEmailCreateFields(
				{
					templateId: "template-1",
					customContent: {
						subject: "contract: {{title}}",
						body: "review {{portalUrl}}",
					},
				},
				"emailTemplateId",
			),
		).toEqual({
			emailTemplateId: "template-1",
			emailSubject: "contract: {{title}}",
			emailBody: "review {{portalUrl}}",
		});
	});
});
