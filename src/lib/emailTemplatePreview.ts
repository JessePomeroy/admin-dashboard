export type HighlightPart = {
	text: string;
	isVariable: boolean;
};

const VARIABLE_SPLIT_PATTERN = /(\{\{[^}]+\}\})/g;
const VARIABLE_PART_PATTERN = /^\{\{[^}]+\}\}$/;

/** Variables supplied across every currently editable email-template category. */
export const DOCUMENT_EMAIL_TEMPLATE_VARIABLES = [
	"{{clientName}}",
	"{{clientEmail}}",
	"{{invoiceNumber}}",
	"{{quoteNumber}}",
	"{{title}}",
	"{{amount}}",
	"{{dueDate}}",
	"{{validUntil}}",
	"{{eventDate}}",
	"{{eventLocation}}",
	"{{totalPrice}}",
	"{{depositAmount}}",
	"{{subtotal}}",
	"{{taxLine}}",
	"{{lineItems}}",
	"{{packages}}",
	"{{changeNote}}",
	"{{portalUrl}}",
	"{{paymentUrl}}",
	"{{galleryLink}}",
	"{{invoiceLink}}",
	"{{bookingDate}}",
] as const;

const COMMON_TEMPLATE_VARIABLES = ["{{clientName}}", "{{clientEmail}}"] as const;
const INVOICE_TEMPLATE_VARIABLES = [
	...COMMON_TEMPLATE_VARIABLES,
	"{{invoiceNumber}}",
	"{{amount}}",
	"{{dueDate}}",
	"{{subtotal}}",
	"{{taxLine}}",
	"{{lineItems}}",
	"{{changeNote}}",
	"{{portalUrl}}",
	"{{paymentUrl}}",
	"{{invoiceLink}}",
] as const;

/**
 * Categories describe intended senders, not a universal interpolation scope.
 * Unknown tokens fail closed at the document-delivery boundary.
 */
export function emailTemplateVariablesForCategory(category: string) {
	switch (category) {
		case "reminder":
			return INVOICE_TEMPLATE_VARIABLES;
		case "gallery-delivery":
			return [...COMMON_TEMPLATE_VARIABLES, "{{galleryLink}}"] as const;
		case "booking-confirmation":
			return [...COMMON_TEMPLATE_VARIABLES, "{{bookingDate}}"] as const;
		case "inquiry-reply":
		case "follow-up":
		case "thank-you":
			return COMMON_TEMPLATE_VARIABLES;
		default:
			return DOCUMENT_EMAIL_TEMPLATE_VARIABLES;
	}
}

export function getVariableHighlightParts(text: string): HighlightPart[] {
	return text
		.split(VARIABLE_SPLIT_PATTERN)
		.filter(Boolean)
		.map((part) => ({
			text: part,
			isVariable: VARIABLE_PART_PATTERN.test(part),
		}));
}
