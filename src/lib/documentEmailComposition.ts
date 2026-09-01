import type { EmailTemplate } from "./types.js";

export interface DocumentEmailSource {
	subject: string;
	body: string;
}

export interface DocumentEmailSelection {
	templateId?: string;
	customContent?: DocumentEmailSource;
}

export function isCompleteDocumentEmailSource(
	source: DocumentEmailSource | undefined,
): boolean {
	return (
		source === undefined ||
		(source.subject.trim().length > 0 && source.body.trim().length > 0)
	);
}

type CreateTemplateField = "templateId" | "emailTemplateId";

export function resolveDocumentEmailSource(input: {
	templates: readonly EmailTemplate[];
	selectedTemplateId: string;
	defaultSubject: string;
	defaultBody: string;
}): DocumentEmailSource {
	const template = input.templates.find(({ _id }) => _id === input.selectedTemplateId);
	return template
		? { subject: template.subject, body: template.body }
		: { subject: input.defaultSubject, body: input.defaultBody };
}

export function renderDocumentEmailSource(
	source: DocumentEmailSource,
	variables: Readonly<Record<string, string>>,
): DocumentEmailSource {
	const replaceVariables = (text: string) => {
		let rendered = text;
		for (const [key, value] of Object.entries(variables)) {
			rendered = rendered.replaceAll(`{{${key}}}`, value);
		}
		return rendered;
	};

	return {
		subject: replaceVariables(source.subject),
		body: replaceVariables(source.body),
	};
}

export function updateDocumentEmailCustomization(
	base: DocumentEmailSource,
	current: DocumentEmailSource | undefined,
	field: keyof DocumentEmailSource,
	value: string,
): DocumentEmailSource | undefined {
	const candidate = { ...(current ?? base), [field]: value };
	return candidate.subject === base.subject && candidate.body === base.body
		? undefined
		: candidate;
}

export function buildDocumentEmailCreateFields<T extends CreateTemplateField>(
	selection: DocumentEmailSelection,
	templateField: T,
): Partial<Record<T, string>> & { emailSubject?: string; emailBody?: string } {
	if (!isCompleteDocumentEmailSource(selection.customContent)) {
		throw new Error("Custom email subject and body are both required");
	}
	const fields = (selection.templateId
		? { [templateField]: selection.templateId }
		: {}) as Partial<Record<T, string>> & {
		emailSubject?: string;
		emailBody?: string;
	};

	if (selection.customContent) {
		fields.emailSubject = selection.customContent.subject;
		fields.emailBody = selection.customContent.body;
	}
	return fields;
}
