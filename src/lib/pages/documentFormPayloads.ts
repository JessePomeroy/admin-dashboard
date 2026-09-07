import type { Contract, Invoice } from "../types";

export type InvoiceCreatePayload = Pick<Invoice,
	| "invoiceType" | "items" | "taxPercent" | "notes" | "dueDate"
	| "recurring" | "depositPercent" | "totalProject" | "milestoneName" | "milestoneIndex"
> & {
	clientId: string;
	parentInvoiceId?: string;
};

export type ContractCreatePayload = Pick<Contract,
	"title" | "category" | "body" | "eventDate" | "eventLocation" | "totalPrice" | "depositAmount"
> & {
	clientId: string;
	templateId?: string;
};

export type InvoiceUpdatePayload = Partial<Pick<Invoice,
	"items" | "taxPercent" | "notes" | "dueDate" | "status"
>>;

export type ContractUpdatePayload = Partial<Pick<Contract,
	"title" | "body" | "eventDate" | "eventLocation" | "totalPrice" | "depositAmount" | "status"
>>;

interface CustomDocumentEmail {
	emailSubject?: string;
	emailBody?: string;
}

export type InvoiceCreateAndSendPayload = InvoiceCreatePayload & CustomDocumentEmail & {
	templateId?: string;
};

export type ContractCreateAndSendPayload = ContractCreatePayload & CustomDocumentEmail & {
	emailTemplateId?: string;
};
