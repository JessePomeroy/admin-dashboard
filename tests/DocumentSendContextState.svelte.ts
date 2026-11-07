import type { Contract, Invoice, Quote } from "../src/lib/types";
import { toId } from "../src/lib/utils";

export type DocumentKind = "invoice" | "quote" | "contract";
export type SavedDocument = Invoice | Quote | Contract;

export function savedInvoice(id = "invoice-new"): Invoice {
	return {
		_id: toId<"invoices">(id), _creationTime: 2, siteUrl: "example.test",
		invoiceNumber: "INV-SAVED", clientId: toId<"photographyClients">("client-1"),
		clientName: "Avery Current", clientEmail: "current@example.test",
		invoiceType: "one-time", status: "draft",
		items: [{ description: "New session", quantity: 1, unitPrice: 12345 }],
	};
}

export function savedQuote(id = "quote-new"): Quote {
	return {
		_id: toId<"quotes">(id), _creationTime: 2, siteUrl: "example.test",
		quoteNumber: "QT-SAVED", clientId: toId<"photographyClients">("client-1"),
		clientName: "Avery Current", clientEmail: "current@example.test", status: "draft",
		packages: [{ name: "New session", price: 12345 }],
	};
}

export function savedContract(id = "contract-new"): Contract {
	return {
		_id: toId<"contracts">(id), _creationTime: 2, siteUrl: "example.test",
		title: "Saved contract", clientId: toId<"photographyClients">("client-1"),
		clientName: "Avery Current", clientEmail: "current@example.test", status: "draft",
		body: "Fictional agreed session terms", totalPrice: 12345,
	};
}

export function savedDocument(kind: DocumentKind, id = `${kind}-new`): SavedDocument {
	if (kind === "invoice") return savedInvoice(id);
	if (kind === "quote") return savedQuote(id);
	return savedContract(id);
}

function initialState() {
	return {
		invoices: ["first", "second"].map((suffix): Invoice => ({
			...savedInvoice(`invoice-${suffix}`), invoiceNumber: `INV-${suffix.toUpperCase()}`, status: "paid",
		})),
		quotes: ["first", "second"].map((suffix): Quote => ({
			...savedQuote(`quote-${suffix}`), quoteNumber: `QT-${suffix.toUpperCase()}`, status: "accepted",
		})),
		contracts: ["first", "second"].map((suffix): Contract => ({
			...savedContract(`contract-${suffix}`), title: `${suffix} contract`, status: "signed",
		})),
	};
}

export const documentState = $state(initialState());

export function resetDocuments() {
	Object.assign(documentState, initialState());
}

export function acknowledgeDocument(kind: DocumentKind, id: string) {
	if (kind === "invoice") documentState.invoices.push(savedInvoice(id));
	else if (kind === "quote") documentState.quotes.push(savedQuote(id));
	else documentState.contracts.push(savedContract(id));
}

type ListArguments = {
	kind?: "invoices" | "quotes" | "contracts";
	status?: string;
	search?: string;
	paginationOpts?: { cursor: string | null };
};

function label(row: SavedDocument) {
	if ("invoiceNumber" in row) return row.invoiceNumber;
	if ("quoteNumber" in row) return row.quoteNumber;
	return row.title;
}

/** A one-record fictional page makes retained cursor ownership observable. */
export function queryData(ref: string, args?: ListArguments | (() => ListArguments)) {
	if (ref === "records") {
		const value = typeof args === "function" ? args() : args;
		if (!value?.kind) throw new Error("Missing fictional record kind");
		const filtered = documentState[value.kind].filter((row) =>
			(!value.status || row.status === value.status) &&
			(!value.search || `${label(row)} ${row.clientName}`.toLowerCase().includes(value.search.toLowerCase())),
		);
		const index = value.paginationOpts?.cursor === "second-page" ? 1 : 0;
		return { page: filtered.slice(index, index + 1), isDone: index + 1 >= filtered.length, continueCursor: index === 0 && filtered.length > 1 ? "second-page" : "" };
	}
	if (ref === "invoices" || ref === "quotes" || ref === "contracts") return documentState[ref];
	if (ref === "invoiceNumber") return "INV-PREVIEW";
	if (ref === "quoteNumber") return "QT-PREVIEW";
	if (ref === "clients") return [{ _id: "client-1", name: "Avery At Creation", email: "creation@example.test" }];
	if (ref === "emailTemplates") return [{ _id: "email-template", name: "Document email", subject: "Hello {{clientName}}", body: "Review {{portalUrl}}" }];
	if (ref === "contractTemplates" || ref === "presets") return [];
	throw new Error(`Unexpected fictional subscription: ${ref}`);
}
