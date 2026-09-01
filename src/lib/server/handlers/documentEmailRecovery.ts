import { error, json } from "@sveltejs/kit";
import type { ConvexHttpClient } from "convex/browser";
import { type AdminAPI, getServerConfig } from "../../config.js";
import {
	type DocumentEmailReference,
	type DocumentEmailResolution,
	documentEmailReferencesMatch,
	isDocumentEmailAttemptId,
	parseDocumentEmailRecovery,
	parseDocumentEmailReference,
} from "../../documentEmailRecovery.js";
import { getAuthenticatedConvex } from "../convexClient.js";
import { requireAdmin } from "../requireAdmin.js";

const MAX_NOTE_BYTES = 2048;
const MAX_PROVIDER_ID_BYTES = 512;
const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

const RECOVERY_ERROR_RESPONSES = {
	DOCUMENT_EMAIL_NOT_FOUND: [404, "Document email attempt not found"],
	DOCUMENT_EMAIL_DOCUMENT_MISMATCH: [404, "Document email attempt not found"],
	DOCUMENT_EMAIL_INVALID_RESOLUTION: [
		400,
		"The document email resolution is invalid",
	],
	DOCUMENT_EMAIL_TERMINAL: [409, "This document email attempt is already resolved"],
	DOCUMENT_EMAIL_RESOLUTION_CONFLICT: [
		409,
		"This document email attempt was resolved differently",
	],
	DOCUMENT_EMAIL_NOT_ELIGIBLE: [
		409,
		"This document email attempt is not eligible for that resolution",
	],
	DOCUMENT_EMAIL_LIVE_CLAIM: [
		409,
		"Email delivery is still in progress. Wait before resolving it",
	],
	DOCUMENT_EMAIL_PROVIDER_EVIDENCE_REQUIRED: [
		409,
		"A provider message ID is required to confirm acceptance",
	],
	DOCUMENT_EMAIL_PROVIDER_EVIDENCE_CONFLICT: [
		409,
		"The provider message ID conflicts with the recorded delivery",
	],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noStoreJson(value: unknown, status = 200) {
	return json(value, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function recoveryCodedErrorResponse(value: unknown) {
	if (!isRecord(value) || !isRecord(value.data)) return undefined;
	const code = value.data.code;
	if (typeof code !== "string" || !(code in RECOVERY_ERROR_RESPONSES)) {
		return undefined;
	}
	const [status, message] =
		RECOVERY_ERROR_RESPONSES[code as keyof typeof RECOVERY_ERROR_RESPONSES];
	return noStoreJson({ message }, status);
}

function recoveryHandlerErrorResponse(value: unknown, fallbackMessage: string) {
	const coded = recoveryCodedErrorResponse(value);
	if (coded) return coded;
	if (
		isRecord(value) &&
		typeof value.status === "number" &&
		Number.isInteger(value.status) &&
		value.status >= 400 &&
		value.status <= 599
	) {
		const message =
			isRecord(value.body) &&
			typeof value.body.message === "string" &&
			value.body.message.length > 0 &&
			value.body.message.length <= 512
				? value.body.message
				: fallbackMessage;
		return noStoreJson({ message }, value.status);
	}
	console.error(fallbackMessage, value);
	return noStoreJson({ message: fallbackMessage }, 500);
}

function hasExactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
) {
	const keys = Object.keys(value);
	return (
		keys.length === expected.length &&
		expected.every((key) => Object.hasOwn(value, key))
	);
}

function requireAttemptId(value: unknown): string {
	if (typeof value !== "string" || !isDocumentEmailAttemptId(value)) {
		throw error(400, "A valid email attempt ID is required");
	}
	return value;
}

function requireRecoveryApi(api: AdminAPI) {
	if (
		!api.documentEmailAttempts?.getRecovery ||
		!api.documentEmailAttempts.getOpenRecoveryByDocument ||
		!api.documentEmailAttempts.resolve
	) {
		throw error(500, "Document email recovery is not configured");
	}
	return api.documentEmailAttempts;
}

function parseExpectedDocumentFromUrl(request: Request): DocumentEmailReference {
	const url = new URL(request.url);
	const documentType = url.searchParams.get("documentType");
	const documentId = url.searchParams.get("documentId");
	if (
		Array.from(url.searchParams.keys()).some(
			(key) => key !== "documentType" && key !== "documentId",
		) ||
		url.searchParams.getAll("documentType").length !== 1 ||
		url.searchParams.getAll("documentId").length !== 1
	) {
		throw error(400, "Invalid document email recovery request");
	}
	try {
		return parseDocumentEmailReference({
			type: documentType,
			id: documentId,
		});
	} catch {
		throw error(400, "Invalid document email recovery request");
	}
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	if (
		request.headers.get("Content-Type")?.split(";", 1)[0]?.trim() !==
		"application/json"
	) {
		throw error(400, "Invalid document email recovery request");
	}
	let value: unknown;
	try {
		value = await request.json();
	} catch {
		throw error(400, "Invalid document email recovery request");
	}
	if (!isRecord(value)) {
		throw error(400, "Invalid document email recovery request");
	}
	return value;
}

function boundedTrimmedString(
	value: unknown,
	maxBytes: number,
): string | undefined {
	if (typeof value !== "string" || value !== value.trim() || value.length === 0) {
		return undefined;
	}
	return new TextEncoder().encode(value).byteLength <= maxBytes
		? value
		: undefined;
}

function parseResolution(value: unknown): DocumentEmailResolution {
	if (!isRecord(value)) {
		throw error(400, "Invalid document email resolution");
	}
	if (value.kind === "accepted") {
		if (
			!hasExactKeys(
				value,
				value.providerMessageId === undefined
					? ["kind"]
					: ["kind", "providerMessageId"],
			)
		) {
			throw error(400, "Invalid document email resolution");
		}
		if (value.providerMessageId === undefined) return { kind: "accepted" };
		const providerMessageId = boundedTrimmedString(
			value.providerMessageId,
			MAX_PROVIDER_ID_BYTES,
		);
		if (!providerMessageId || /[\r\n]/.test(providerMessageId)) {
			throw error(400, "Invalid provider message ID");
		}
		return { kind: "accepted", providerMessageId };
	}
	if (
		value.kind !== "not_accepted" ||
		!hasExactKeys(value, ["kind", "confirmation", "note"]) ||
		value.confirmation !== "NOT ACCEPTED"
	) {
		throw error(400, "Invalid document email resolution");
	}
	const note = boundedTrimmedString(value.note, MAX_NOTE_BYTES);
	if (!note) throw error(400, "A reconciliation note is required");
	return {
		kind: "not_accepted",
		confirmation: "NOT ACCEPTED",
		note,
	};
}

function parseResolveInput(value: Record<string, unknown>) {
	if (!hasExactKeys(value, ["expectedDocument", "resolution"])) {
		throw error(400, "Invalid document email recovery request");
	}
	let expectedDocument: DocumentEmailReference;
	try {
		expectedDocument = parseDocumentEmailReference(value.expectedDocument);
	} catch {
		throw error(400, "Invalid document email recovery request");
	}
	return {
		expectedDocument,
		resolution: parseResolution(value.resolution),
	};
}

async function loadRecovery(
	convex: ConvexHttpClient,
	ref: NonNullable<AdminAPI["documentEmailAttempts"]>["getRecovery"],
	input: {
		siteUrl: string;
		attemptId: string;
		expectedDocument: DocumentEmailReference;
	},
) {
	const value = await convex.query(ref, {
		siteUrl: input.siteUrl,
		attemptId: input.attemptId,
	});
	if (value === null) throw error(404, "Document email attempt not found");
	let recovery;
	try {
		recovery = parseDocumentEmailRecovery(value, {
			attemptId: input.attemptId,
		});
	} catch {
		throw error(502, "Document email recovery returned an invalid response");
	}
	if (!documentEmailReferencesMatch(recovery.document, input.expectedDocument)) {
		throw error(404, "Document email attempt not found");
	}
	return recovery;
}

async function loadOpenRecoveryByDocument(
	convex: ConvexHttpClient,
	ref: NonNullable<
		AdminAPI["documentEmailAttempts"]
	>["getOpenRecoveryByDocument"],
	input: {
		siteUrl: string;
		document: DocumentEmailReference;
	},
) {
	const value = await convex.query(ref, input);
	if (value === null) return null;
	try {
		return parseDocumentEmailRecovery(value, { document: input.document });
	} catch {
		throw error(502, "Document email recovery returned an invalid response");
	}
}

/** Discover the one open tenant-authorized attempt for an exact document. */
export function createOpenDocumentEmailRecoveryGetHandler() {
	return async ({ request }: { request: Request }) => {
		try {
			await requireAdmin(request);
			const config = getServerConfig();
			const attemptApi = requireRecoveryApi(config.api);
			const document = parseExpectedDocumentFromUrl(request);
			const convex = await getAuthenticatedConvex(request);
			const recovery = await loadOpenRecoveryByDocument(
				convex,
				attemptApi.getOpenRecoveryByDocument,
				{ siteUrl: config.siteUrl, document },
			);
			return noStoreJson({ recovery });
		} catch (err) {
			return recoveryHandlerErrorResponse(
				err,
				"Failed to discover document email recovery",
			);
		}
	};
}

/** Read one tenant-authorized, browser-safe recovery projection. */
export function createDocumentEmailRecoveryGetHandler() {
	return async ({
		params,
		request,
	}: {
		params: { attemptId: string };
		request: Request;
	}) => {
		try {
			await requireAdmin(request);
			const config = getServerConfig();
			const attemptApi = requireRecoveryApi(config.api);
			const attemptId = requireAttemptId(params.attemptId);
			const expectedDocument = parseExpectedDocumentFromUrl(request);
			const convex = await getAuthenticatedConvex(request);
			const recovery = await loadRecovery(convex, attemptApi.getRecovery, {
				siteUrl: config.siteUrl,
				attemptId,
				expectedDocument,
			});
			return noStoreJson({ recovery });
		} catch (err) {
			return recoveryHandlerErrorResponse(
				err,
				"Failed to load document email recovery",
			);
		}
	};
}

/**
 * Resolve one ambiguous delivery without granting browser access to the full
 * journal row. Convex remains authoritative for tenant scope and eligibility.
 */
export function createDocumentEmailRecoveryResolveHandler() {
	return async ({
		params,
		request,
	}: {
		params: { attemptId: string };
		request: Request;
	}) => {
		try {
			await requireAdmin(request);
			const config = getServerConfig();
			const attemptApi = requireRecoveryApi(config.api);
			const attemptId = requireAttemptId(params.attemptId);
			const { expectedDocument, resolution } = parseResolveInput(
				await readJsonObject(request),
			);
			const convex = await getAuthenticatedConvex(request);
			const value: unknown = await convex.mutation(attemptApi.resolve, {
				siteUrl: config.siteUrl,
				attemptId,
				expectedDocument,
				resolution,
			});
			if (
				!isRecord(value) ||
				(value.outcome !== "sent" &&
					value.outcome !== "released" &&
					value.outcome !== "replay")
			) {
				throw error(502, "Document email resolution returned an invalid response");
			}
			let recovery;
			try {
				recovery = parseDocumentEmailRecovery(value.recovery, {
					attemptId,
					document: expectedDocument,
				});
			} catch {
				throw error(
					502,
					"Document email resolution returned an invalid response",
				);
			}
			if (
				(value.outcome === "sent" && recovery.status !== "sent") ||
				(value.outcome === "released" &&
					recovery.status !== "resolved_not_sent") ||
				!documentEmailReferencesMatch(recovery.document, expectedDocument)
			) {
				throw error(502, "Document email resolution returned an invalid response");
			}
			return noStoreJson({ outcome: value.outcome, recovery });
		} catch (err) {
			return recoveryHandlerErrorResponse(
				err,
				"Failed to resolve document email delivery",
			);
		}
	};
}
