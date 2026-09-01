import { toId } from "../../utils.js";
import { renderDocumentEmail } from "../defaultDocumentEmail.js";
import {
	createEmailSendHandler,
	formatCurrency,
} from "./createEmailSendHandler.js";

/** Subset of the Convex Contract document the send handler needs. */
interface ContractDoc extends Record<string, unknown> {
	_id: string;
	siteUrl: string;
	clientId: string;
	clientEmail?: string;
	clientName?: string;
	status: "draft" | "sent" | "signed" | "expired";
	title: string;
	eventDate?: string;
	eventLocation?: string;
	totalPrice?: number;
	depositAmount?: number;
}

export function createContractSendHandler() {
	return createEmailSendHandler<ContractDoc>({
		docType: "contract",
		fetchDocument: (api, convex, id) =>
			convex.query(api.contracts.get, { contractId: toId(id) }),
		getClientEmail: (doc) => doc.clientEmail,
		extractVars: (doc, changeNote) => ({
			values: {
				clientName: doc.clientName ?? "there",
				clientEmail: doc.clientEmail ?? "",
				title: doc.title,
				eventDate: doc.eventDate ?? "",
				eventLocation: doc.eventLocation ?? "",
				totalPrice:
					doc.totalPrice !== undefined ? formatCurrency(doc.totalPrice) : "",
				depositAmount: doc.depositAmount !== undefined
					? formatCurrency(doc.depositAmount)
					: "",
				changeNote,
			},
		}),
		buildDefaultMessage: (doc, context) =>
			renderDocumentEmail({
				kind: "contract",
				brand: { siteName: context.siteName, homeUrl: context.homeUrl },
				clientName: doc.clientName,
				changeNote: context.changeNote || undefined,
				title: doc.title,
				eventDate: doc.eventDate,
				eventLocation: doc.eventLocation,
				totalPriceCents: doc.totalPrice,
				depositAmountCents: doc.depositAmount,
				portalUrl: context.portalUrl,
			}),
		defaultSubject: (doc) => `contract: ${doc.title}`,
	});
}
