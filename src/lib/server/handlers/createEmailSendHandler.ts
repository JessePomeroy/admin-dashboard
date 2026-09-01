import { error, json } from "@sveltejs/kit";
import type { ConvexHttpClient } from "convex/browser";
import { type AdminAPI, getServerConfig } from "../../config.js";
import {
	type DocumentEmailRecovery,
	parseDocumentEmailRecovery,
} from "../../documentEmailRecovery.js";
import type { EmailCategory } from "../../types.js";
import { formatCents } from "../../utils.js";
import { getAuthenticatedConvex } from "../convexClient.js";
import { replaceTemplateVariables, sendEmail } from "../email.js";
import { handleServerError } from "../handleError.js";
import { escapeHtml } from "../html.js";
import { requireAdmin } from "../requireAdmin.js";

export { formatCents as formatCurrency };

type DocumentEmailType = "invoice" | "quote" | "contract";
type DocumentEmailStatus =
	| "prepared"
	| "claimed"
	| "sent"
	| "failed"
	| "uncertain"
	| "resolved_not_sent";

interface SendableDocument extends Record<string, unknown> {
	_id: string;
	siteUrl: string;
	clientId: string;
	status: string;
}

export interface DocumentEmailMessage {
	html: string;
	text: string;
}

interface FrozenDocumentEmailAttempt {
	siteUrl: string;
	attemptId: string;
	document: { type: DocumentEmailType; id: string };
	portalUrl: string;
	envelope: {
		from: string;
		to: string;
		replyTo?: string;
		subject: string;
		text: string;
		html: string;
	};
	providerIdempotencyKey: string;
	providerTags: Array<{ name: string; value: string }>;
	open: boolean;
	documentKey: string;
	status: DocumentEmailStatus;
	claimId?: string;
	providerMessageId?: string;
}

type DeliveryClaimOutcome =
	| "claimed"
	| "busy"
	| "sent"
	| "failed"
	| "uncertain"
	| "expired"
	| "released";

type DocumentEmailDeliveryFailure = "busy" | "failed" | "uncertain";

type DocumentEmailAttemptScope = {
	siteUrl: string;
	attemptId: string;
	type: DocumentEmailType;
	id: string;
};

type PrepareRejectionReason =
	| "invalid_request"
	| "attempt_conflict"
	| "document_unavailable"
	| "document_not_sendable"
	| "portal_unavailable"
	| "client_unavailable"
	| "message_invalid"
	| "portal_token_conflict";

export interface DocumentEmailTemplateVariables {
	values: Record<string, string>;
	fragments?: Record<string, { html: string; text: string }>;
}

const UNCERTAIN_PROVIDER_ERROR_NAMES = new Set([
	"application_error",
	"concurrent_idempotent_requests",
	"invalid_idempotent_request",
	"internal_server_error",
	"rate_limit_exceeded",
]);

const DEFINITE_PROVIDER_ERROR_NAMES = new Set([
	"daily_quota_exceeded",
	"invalid_access",
	"invalid_api_key",
	"invalid_attachment",
	"invalid_from_address",
	"invalid_idempotency_key",
	"invalid_parameter",
	"invalid_region",
	"method_not_allowed",
	"missing_api_key",
	"missing_required_field",
	"monthly_quota_exceeded",
	"not_found",
	"restricted_api_key",
	"security_error",
	"validation_error",
]);

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FAILURE_BYTES = 4096;
const MAX_SUBJECT_BYTES = 998;
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_HTML_BYTES = 256 * 1024;
const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function documentEmailJson(value: unknown, status = 200) {
	return json(value, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Document email journal returned an invalid ${label}`);
	}
	return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Document email journal returned an invalid ${label}`);
	}
	return value;
}

function parseProviderTags(
	value: unknown,
	attemptId: string,
): Array<{ name: string; value: string }> {
	if (!Array.isArray(value) || value.length === 0 || value.length > 75) {
		throw new Error("Document email journal returned invalid provider tags");
	}
	const tags = value.map((tag) => {
		if (!isRecord(tag)) {
			throw new Error("Document email journal returned invalid provider tags");
		}
		const name = requiredString(tag.name, "provider tag name");
		const tagValue = requiredString(tag.value, "provider tag value");
		if (
			name.length > 256 ||
			tagValue.length > 256 ||
			!/^[A-Za-z0-9_-]+$/.test(name) ||
			!/^[A-Za-z0-9_-]+$/.test(tagValue)
		) {
			throw new Error("Document email journal returned invalid provider tags");
		}
		return { name, value: tagValue };
	});
	if (
		tags.filter(
			(tag) =>
				tag.name === "document_attempt" && tag.value === attemptId,
		).length !== 1
	) {
		throw new Error("Document email journal returned invalid provider tags");
	}
	return tags;
}

function parseFrozenAttempt(value: unknown): FrozenDocumentEmailAttempt {
	if (!isRecord(value) || value.protocolVersion !== 1) {
		throw new Error("Document email journal returned an invalid attempt");
	}
	const document = value.document;
	const envelope = value.envelope;
	if (!isRecord(document) || !isRecord(envelope)) {
		throw new Error("Document email journal returned an invalid attempt");
	}
	if (
		document.type !== "invoice" &&
		document.type !== "quote" &&
		document.type !== "contract"
	) {
		throw new Error("Document email journal returned an invalid document type");
	}
	if (
		value.status !== "prepared" &&
		value.status !== "claimed" &&
		value.status !== "sent" &&
		value.status !== "failed" &&
		value.status !== "uncertain" &&
		value.status !== "resolved_not_sent"
	) {
		throw new Error(
			"Document email journal returned an invalid attempt status",
		);
	}

	const attemptId = requiredString(value.attemptId, "attempt id");
	return {
		siteUrl: requiredString(value.siteUrl, "site"),
		attemptId,
		document: {
			type: document.type,
			id: requiredString(document.id, "document id"),
		},
		portalUrl: requiredString(value.portalUrl, "portal URL"),
		envelope: {
			from: requiredString(envelope.from, "sender"),
			to: requiredString(envelope.to, "recipient"),
			...(typeof envelope.replyTo === "string" && envelope.replyTo.length > 0
				? { replyTo: envelope.replyTo }
				: {}),
			subject: requiredString(envelope.subject, "subject"),
			text: requiredString(envelope.text, "plain-text body"),
			html: requiredString(envelope.html, "HTML body"),
		},
		providerIdempotencyKey: requiredString(
			value.providerIdempotencyKey,
			"provider idempotency key",
		),
		providerTags: parseProviderTags(value.providerTags, attemptId),
		open: requiredBoolean(value.open, "open state"),
		documentKey: requiredString(value.documentKey, "document key"),
		status: value.status,
		...(typeof value.claimId === "string" && value.claimId.length > 0
			? { claimId: value.claimId }
			: {}),
		...(typeof value.providerMessageId === "string" &&
		value.providerMessageId.length > 0
			? { providerMessageId: value.providerMessageId }
			: {}),
	};
}

function parseAttemptResult(
	value: unknown,
	allowedOutcomes: readonly string[],
): { outcome: string; attempt: FrozenDocumentEmailAttempt } {
	if (!isRecord(value) || !allowedOutcomes.includes(String(value.outcome))) {
		throw new Error("Document email journal returned an invalid outcome");
	}
	return {
		outcome: String(value.outcome),
		attempt: parseFrozenAttempt(value.attempt),
	};
}

function parsePrepareResult(value: unknown):
	| {
			outcome: "prepared" | "replay" | "blocked";
			attempt: FrozenDocumentEmailAttempt;
	  }
	| { outcome: "rejected"; reason: PrepareRejectionReason } {
	if (!isRecord(value)) {
		throw new Error("Document email journal returned an invalid outcome");
	}
	if (value.outcome === "rejected") {
		if (
			value.reason !== "invalid_request" &&
			value.reason !== "attempt_conflict" &&
			value.reason !== "document_unavailable" &&
			value.reason !== "document_not_sendable" &&
			value.reason !== "portal_unavailable" &&
			value.reason !== "client_unavailable" &&
			value.reason !== "message_invalid" &&
			value.reason !== "portal_token_conflict"
		) {
			throw new Error("Document email journal returned an invalid rejection");
		}
		return { outcome: "rejected", reason: value.reason };
	}
	if (
		value.outcome !== "prepared" &&
		value.outcome !== "replay" &&
		value.outcome !== "blocked"
	) {
		throw new Error("Document email journal returned an invalid outcome");
	}
	return {
		outcome: value.outcome,
		attempt: parseFrozenAttempt(value.attempt),
	};
}

function assertAttemptDocumentScope(
	attempt: FrozenDocumentEmailAttempt,
	input: Omit<DocumentEmailAttemptScope, "attemptId">,
) {
	if (
		attempt.siteUrl !== input.siteUrl ||
		attempt.document.type !== input.type ||
		attempt.document.id !== input.id
	) {
		throw new Error("Document email attempt does not match this request");
	}
}

function assertAttemptScope(
	attempt: FrozenDocumentEmailAttempt,
	input: DocumentEmailAttemptScope,
) {
	assertAttemptDocumentScope(attempt, input);
	if (attempt.attemptId !== input.attemptId) {
		throw new Error("Document email attempt does not match this request");
	}
}

function normalizePortalOrigin(siteUrl: string): string {
	const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(siteUrl.trim())
		? siteUrl.trim()
		: `https://${siteUrl.trim()}`;
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		throw new Error("Document email portal origin is invalid");
	}
	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		parsed.username ||
		parsed.password ||
		parsed.pathname !== "/" ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error("Document email portal origin is invalid");
	}
	return parsed.origin;
}

/**
 * Detect whether authored content is intended to be HTML. The conservative
 * prefix rule preserves existing prose templates that happen to contain `<`.
 */
function looksLikeHtml(value: string): boolean {
	return /^\s*<[a-zA-Z!]/.test(value);
}

function wrapPlainText(value: string): string {
	if (looksLikeHtml(value)) return value;
	const lines = value.replace(/\r\n?/g, "\n").split("\n");
	const content = lines
		.map((line) => (line.length > 0 ? escapeHtml(line) : "&nbsp;"))
		.join("<br>\n");
	return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6;">${content}</div>`;
}

function decodeTextEntity(entity: string): string {
	const named: Record<string, string> = {
		amp: "&",
		apos: "'",
		bull: "•",
		copy: "©",
		hellip: "…",
		gt: ">",
		ldquo: "“",
		lsquo: "‘",
		lt: "<",
		mdash: "—",
		ndash: "–",
		nbsp: " ",
		quot: '"',
		rdquo: "”",
		reg: "®",
		rsquo: "’",
		trade: "™",
	};
	if (entity in named) return named[entity] ?? entity;
	const numeric = entity.startsWith("#x")
		? Number.parseInt(entity.slice(2), 16)
		: entity.startsWith("#")
			? Number.parseInt(entity.slice(1), 10)
			: Number.NaN;
	return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
		? String.fromCodePoint(numeric)
		: `&${entity};`;
}

function decodeTextEntities(value: string): string {
	return value.replace(
		/&([a-z]+|#\d+|#x[0-9a-f]+);/gi,
		(_match, entity: string) => decodeTextEntity(entity.toLowerCase()),
	);
}

function plainTextAlternative(value: string): string {
	if (!looksLikeHtml(value)) return value.trim();
	return decodeTextEntities(
		value
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(
				/<(head|style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
				"",
			)
			.replace(
				/<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
				(_match, doubleQuoted: string, singleQuoted: string, bare: string) =>
					`\n${doubleQuoted ?? singleQuoted ?? bare ?? ""}\n`,
			)
			.replace(/<img\b[^>]*>/gi, "")
			.replace(
				/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
				(
					_match,
					doubleQuoted: string,
					singleQuoted: string,
					bare: string,
					content: string,
				) => {
					const href = doubleQuoted ?? singleQuoted ?? bare ?? "";
					const label = content.replace(/<[^>]+>/g, "").trim();
					return label === href ? href : `${label} (${href})`;
				},
			)
			.replace(/<(?:br|hr)\s*\/?\s*>/gi, "\n")
			.replace(
				/<\/(?:p|div|h[1-6]|li|tr|table|section|article|address)>/gi,
				"\n",
			)
			.replace(/<\/(?:td|th)>/gi, " | ")
			.replace(/<li\b[^>]*>/gi, "• ")
			.replace(/<[^>]+>/g, "")
			.replace(/[ \t]+\|/g, " |")
			.replace(/\|[ \t]*\n/g, "\n")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
	);
}

function portalActionLabel(type: DocumentEmailType): string {
	switch (type) {
		case "invoice":
			return "View and pay invoice";
		case "quote":
			return "Review your quote";
		case "contract":
			return "Review and sign contract";
	}
}

function insertBeforeClosingDocument(html: string, addition: string): string {
	const bodyClose = html.search(/<\/body\s*>/i);
	if (bodyClose >= 0) {
		return `${html.slice(0, bodyClose)}${addition}\n${html.slice(bodyClose)}`;
	}
	const htmlClose = html.search(/<\/html\s*>/i);
	return htmlClose >= 0
		? `${html.slice(0, htmlClose)}${addition}\n${html.slice(htmlClose)}`
		: `${html}\n${addition}`;
}

function appendPortalAccess(
	message: DocumentEmailMessage,
	type: DocumentEmailType,
	portalUrl: string,
): DocumentEmailMessage {
	const label = portalActionLabel(type);
	const escapedUrl = escapeHtml(portalUrl);
	const action = `<div style="box-sizing: border-box; max-width: 600px; margin: 0 auto; padding: 0 24px 24px; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 24px 0 8px; table-layout: fixed;"><tr><td bgcolor="#3f352e" style="padding: 0; border-radius: 3px; mso-padding-alt: 14px 22px; text-align: center;"><a href="${escapedUrl}" style="display: block; padding: 14px 22px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; line-height: 1; text-decoration: none;">${escapeHtml(label)}</a></td></tr></table>
<p style="margin: 18px 0 6px; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55;">If the button does not open, copy this address into your browser:</p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word;"><a href="${escapedUrl}" style="color: #594a3f; text-decoration: underline;">${escapedUrl}</a></p>
</div>`;
	return {
		html: insertBeforeClosingDocument(message.html, action),
		text: `${message.text.trimEnd()}\n\n${label}:\n${portalUrl}`,
	};
}

function requestString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function templateVariableSets(input: DocumentEmailTemplateVariables) {
	const text = { ...input.values };
	const html = Object.fromEntries(
		Object.entries(input.values).map(([key, value]) => [key, escapeHtml(value)]),
	);
	for (const [key, fragment] of Object.entries(input.fragments ?? {})) {
		text[key] = fragment.text;
		html[key] = fragment.html;
	}
	return { text, html };
}

async function deliveryFailureResponse(
	convex: ConvexHttpClient,
	ref: NonNullable<AdminAPI["documentEmailAttempts"]>["getRecovery"],
	scope: DocumentEmailAttemptScope,
	kind: DocumentEmailDeliveryFailure,
	status: 409 | 503,
	message: string,
) {
	let recovery: DocumentEmailRecovery | undefined;
	try {
		const value = await convex.query(ref, {
			siteUrl: scope.siteUrl,
			attemptId: scope.attemptId,
		});
		if (value !== null) {
			recovery = parseDocumentEmailRecovery(value, {
				attemptId: scope.attemptId,
				document: { type: scope.type, id: scope.id },
			});
		}
	} catch {
		// The attempt ID remains sufficient for a later authenticated recovery read.
	}
	if (recovery?.status === "sent") {
		return documentEmailJson({
			success: true,
			replay: true,
			attemptId: scope.attemptId,
		});
	}
	return documentEmailJson(
		{
			success: false,
			error: kind,
			message,
			attemptId: scope.attemptId,
			...(recovery ? { recovery } : {}),
		},
		status,
	);
}

function prepareRejectionResponse(
	attemptId: string,
	reason: Exclude<PrepareRejectionReason, "attempt_conflict">,
) {
	const response = {
		invalid_request: [400, "The email request is invalid."],
		document_unavailable: [404, "This document is no longer available."],
		document_not_sendable: [
			409,
			"This document is final and cannot be emailed again.",
		],
		portal_unavailable: [
			409,
			"A client portal link cannot be created for this document.",
		],
		client_unavailable: [
			409,
			"The document client cannot receive this email.",
		],
		message_invalid: [400, "The email message is invalid or too large."],
		portal_token_conflict: [
			409,
			"The client portal link could not be reserved. Try the send again.",
		],
	} satisfies Record<
		Exclude<PrepareRejectionReason, "attempt_conflict">,
		readonly [400 | 404 | 409, string]
	>;
	const [status, message] = response[reason];
	return documentEmailJson(
		{ success: false, error: "rejected", reason, message, attemptId },
		status,
	);
}

function providerErrorDisposition(errorValue: unknown): "failed" | "uncertain" {
	if (!isRecord(errorValue) || typeof errorValue.name !== "string") {
		return "uncertain";
	}
	if (UNCERTAIN_PROVIDER_ERROR_NAMES.has(errorValue.name)) return "uncertain";
	return DEFINITE_PROVIDER_ERROR_NAMES.has(errorValue.name)
		? "failed"
		: "uncertain";
}

function boundedDeliveryFailure(value: string): string {
	const source = value || "Email delivery failed";
	const encoder = new TextEncoder();
	if (encoder.encode(source).byteLength <= MAX_FAILURE_BYTES) return source;

	const suffix = "…";
	const suffixBytes = encoder.encode(suffix).byteLength;
	let result = "";
	let usedBytes = 0;
	for (const character of source) {
		const characterBytes = encoder.encode(character).byteLength;
		if (usedBytes + characterBytes + suffixBytes > MAX_FAILURE_BYTES) break;
		result += character;
		usedBytes += characterBytes;
	}
	return `${result}${suffix}`;
}

function assertMessageCanBeFrozen(
	subject: string,
	message: DocumentEmailMessage,
): void {
	const encoder = new TextEncoder();
	if (
		subject.length === 0 ||
		/\r|\n/.test(subject) ||
		encoder.encode(subject).byteLength > MAX_SUBJECT_BYTES
	) {
		throw error(400, "Email subject is invalid or too long");
	}
	if (
		message.text.length === 0 ||
		encoder.encode(message.text).byteLength > MAX_TEXT_BYTES
	) {
		throw error(400, "Email plain-text body is invalid or too long");
	}
	if (
		message.html.length === 0 ||
		encoder.encode(message.html).byteLength > MAX_HTML_BYTES
	) {
		throw error(400, "Email HTML body is invalid or too long");
	}
}

function assertNoUnresolvedTemplateVariables(
	subject: string,
	message: DocumentEmailMessage,
) {
	const variables = new Set<string>();
	for (const source of [subject, message.text, message.html]) {
		for (const match of source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
			if (match[1]) variables.add(match[1]);
		}
	}
	if (variables.size > 0) {
		throw error(
			400,
			`Email template contains unresolved variables: ${Array.from(variables).join(", ")}`,
		);
	}
}

function renderAuthoredMessage(
	source: string,
	variables: ReturnType<typeof templateVariableSets>,
): DocumentEmailMessage {
	if (looksLikeHtml(source)) {
		const html = replaceTemplateVariables(source, variables.html);
		return { html, text: plainTextAlternative(html) };
	}
	const text = replaceTemplateVariables(source, variables.text).trim();
	return { html: wrapPlainText(text), text };
}

function assertDocumentCanBeSent(
	type: DocumentEmailType,
	status: string,
): void {
	const allowed =
		type === "invoice"
			? status === "draft" || status === "sent" || status === "overdue"
			: status === "draft" || status === "sent";
	if (!allowed) {
		throw error(409, `This ${type} is final and cannot be sent again`);
	}
}

async function recordAttemptFailure(
	convex: ConvexHttpClient,
	ref: NonNullable<AdminAPI["documentEmailAttempts"]>["fail"],
	args: {
		siteUrl: string;
		attemptId: string;
		claimId: string;
		disposition: "failed" | "uncertain";
		error: string;
		providerMessageId?: string;
	},
) {
	try {
		await convex.mutation(ref, {
			...args,
			error: boundedDeliveryFailure(args.error),
		});
	} catch {
		// Preserve the delivery error. A later get/claim resolves committed state.
	}
}

async function completeKnownProviderAcceptance(
	convex: ConvexHttpClient,
	ref: NonNullable<AdminAPI["documentEmailAttempts"]>["complete"],
	scope: DocumentEmailAttemptScope,
	attempt: FrozenDocumentEmailAttempt,
) {
	if (!attempt.claimId || !attempt.providerMessageId) {
		throw new Error("Document email attempt has no accepted provider message");
	}
	const completed = parseAttemptResult(
		await convex.mutation(ref, {
			siteUrl: scope.siteUrl,
			attemptId: scope.attemptId,
			claimId: attempt.claimId,
			providerMessageId: attempt.providerMessageId,
		}),
		["sent", "replay"],
	);
	assertAttemptScope(completed.attempt, scope);
	return completed;
}

/**
 * The document-specific facts and default presentation. Template selection,
 * durable effect orchestration, and provider interaction remain centralized.
 */
export interface EmailSendConfig<TDoc extends SendableDocument> {
	docType: DocumentEmailType;
	fetchDocument: (
		api: AdminAPI,
		convex: ConvexHttpClient,
		id: string,
	) => Promise<TDoc | null>;
	getClientEmail: (doc: TDoc) => string | undefined;
	extractVars: (
		doc: TDoc,
		changeNote: string,
	) => DocumentEmailTemplateVariables;
	buildDefaultMessage: (
		doc: TDoc,
		context: {
			siteName: string;
			homeUrl: string;
			portalUrl: string;
			changeNote: string;
		},
	) => DocumentEmailMessage;
	defaultSubject: (doc: TDoc) => string;
	/** Optional document-specific preflight mirrored by the authoritative journal. */
	validateDocument?: (doc: TDoc) => string | undefined;
	/** Optional template lookup for a named action such as an invoice reminder. */
	fallbackCategoriesForAction?: (
		changeNote: string,
	) => readonly EmailCategory[];
}

/**
 * Build a tenant-authorized document-email handler with one durable attempt per
 * user action. Retries replay the frozen envelope; provider work can never run
 * before an exact journal claim.
 */
export function createEmailSendHandler<TDoc extends SendableDocument>(
	config: EmailSendConfig<TDoc>,
) {
	return async ({
		params,
		request,
	}: {
		params: { id: string };
		request: Request;
	}) => {
		await requireAdmin(request);
		const serverConfig = getServerConfig();
		const { api } = serverConfig;
		const siteUrl = serverConfig.siteUrl;
		const siteName = serverConfig.siteName;
		const attemptApi = api.documentEmailAttempts;
		if (
			!attemptApi?.get ||
			!attemptApi.getRecovery ||
			!attemptApi.prepare ||
			!attemptApi.claim ||
			!attemptApi.complete ||
			!attemptApi.fail
		) {
			throw error(500, "Document email delivery is not configured");
		}
		const convex = await getAuthenticatedConvex(request);
		const { id } = params;
		const body = await request.json().catch(() => ({}));
		if (!isRecord(body)) throw error(400, "Invalid request body");
		const requestedAttemptId = requestString(body.attemptId);
		if (!requestedAttemptId || !UUID_PATTERN.test(requestedAttemptId)) {
			throw error(400, "A valid email attempt ID is required");
		}
		const templateId = requestString(body.templateId);
		const hasCustomSubject = Object.hasOwn(body, "customSubject");
		const hasCustomBody = Object.hasOwn(body, "customBody");
		let customSubject: string | undefined;
		let customBody: string | undefined;
		if (hasCustomSubject || hasCustomBody) {
			if (
				!hasCustomSubject ||
				!hasCustomBody ||
				typeof body.customSubject !== "string" ||
				typeof body.customBody !== "string" ||
				body.customSubject.trim().length === 0 ||
				body.customBody.trim().length === 0
			) {
				throw error(400, "Custom email subject and body must be supplied together");
			}
			customSubject = body.customSubject;
			customBody = body.customBody;
		}
		if ((customSubject === undefined) !== (customBody === undefined)) {
			throw error(400, "Custom email subject and body must be supplied together");
		}
		const changeNote = requestString(body.changeNote) ?? "";
		let scope = {
			siteUrl,
			attemptId: requestedAttemptId,
			type: config.docType,
			id,
		};

		try {
			const existing = await convex.query(attemptApi.get, {
				siteUrl,
				attemptId: requestedAttemptId,
			});
			let attempt: FrozenDocumentEmailAttempt;
			if (existing) {
				attempt = parseFrozenAttempt(existing);
				assertAttemptScope(attempt, scope);
			} else {
				const doc = await config.fetchDocument(api, convex, id);
				if (!doc) throw error(404, `${config.docType} not found`);
				if (doc.siteUrl !== siteUrl || doc._id !== id) {
					throw error(404, `${config.docType} not found`);
				}
				assertDocumentCanBeSent(config.docType, doc.status);
				const documentError = config.validateDocument?.(doc);
				if (documentError) throw error(409, documentError);
				const clientEmail = config.getClientEmail(doc);
				if (!clientEmail) throw error(400, "Client has no email address");

				const portalOrigin = normalizePortalOrigin(siteUrl);
				const portalToken = crypto.randomUUID();
				const portalUrl = `${portalOrigin}/portal/${portalToken}`;
				const extractedVariables = config.extractVars(doc, changeNote);
				extractedVariables.values.portalUrl = portalUrl;
				extractedVariables.values.paymentUrl = portalUrl;
				if (config.docType === "invoice") {
					extractedVariables.values.invoiceLink = portalUrl;
				}
				const variables = templateVariableSets(extractedVariables);

				let subject: string;
				let message: DocumentEmailMessage;
				let authoredMessage = false;
				if (customSubject !== undefined && customBody !== undefined) {
					authoredMessage = true;
					subject = replaceTemplateVariables(customSubject, variables.text);
					message = renderAuthoredMessage(customBody, variables);
				} else {
					let template: Record<string, unknown> | null = null;
					if (templateId) {
						template = await convex.query(api.emailTemplates.get, {
							templateId,
						});
						if (!template) throw error(404, "Email template not found");
					} else {
						const categories =
							config.fallbackCategoriesForAction?.(changeNote) ?? [];
						for (const category of categories) {
							template = await convex.query(api.emailTemplates.getByCategory, {
								siteUrl,
								category,
							});
							if (template) break;
						}
					}
					if (template) {
						authoredMessage = true;
						if (template.siteUrl !== siteUrl) {
							throw error(404, "Email template not found");
						}
						const templateSubject = requiredString(
							template.subject,
							"template subject",
						);
						const templateBody = requiredString(template.body, "template body");
						subject = replaceTemplateVariables(
							templateSubject,
							variables.text,
						);
						message = renderAuthoredMessage(templateBody, variables);
					} else {
						subject = config.defaultSubject(doc);
						message = config.buildDefaultMessage(doc, {
							siteName,
							homeUrl: portalOrigin,
							portalUrl,
							changeNote,
						});
					}
				}
				if (authoredMessage) {
					assertNoUnresolvedTemplateVariables(subject, message);
					message = appendPortalAccess(message, config.docType, portalUrl);
				}
				assertMessageCanBeFrozen(subject, message);

				const prepared = parsePrepareResult(
					await convex.mutation(attemptApi.prepare, {
						siteUrl,
						attemptId: requestedAttemptId,
						document: { type: config.docType, id: doc._id },
						portalOrigin,
						portalToken,
						envelope: {
							from: serverConfig.fromEmail,
							to: clientEmail,
							subject,
							text: message.text,
							html: message.html,
						},
					}),
				);
				if (prepared.outcome === "rejected") {
					if (prepared.reason !== "attempt_conflict") {
						return prepareRejectionResponse(
							requestedAttemptId,
							prepared.reason,
						);
					}
					const frozen = await convex.query(attemptApi.get, {
						siteUrl,
						attemptId: requestedAttemptId,
					});
					if (!frozen) {
						return await deliveryFailureResponse(
							convex,
							attemptApi.getRecovery,
							scope,
							"uncertain",
							503,
							"This email attempt conflicts with a frozen request. Do not start another send until it is reviewed.",
						);
					}
					attempt = parseFrozenAttempt(frozen);
					try {
						assertAttemptScope(attempt, scope);
					} catch {
						return await deliveryFailureResponse(
							convex,
							attemptApi.getRecovery,
							scope,
							"uncertain",
							503,
							"This email attempt is already attached to another frozen request. Do not send again until it is reviewed.",
						);
					}
				} else {
					attempt = prepared.attempt;
					assertAttemptDocumentScope(attempt, scope);
					if (
						prepared.outcome !== "blocked" &&
						attempt.attemptId !== requestedAttemptId
					) {
						throw new Error(
							"Document email attempt does not match this request",
						);
					}
					if (prepared.outcome === "blocked" && !attempt.open) {
						throw new Error("Document email journal returned a closed blocker");
					}
					scope = { ...scope, attemptId: attempt.attemptId };
				}
			}

			if (attempt.status === "sent")
				return documentEmailJson({
					success: true,
					replay: true,
					attemptId: scope.attemptId,
				});
			if (attempt.status === "resolved_not_sent") {
				return documentEmailJson(
					{
						success: false,
						error: "rejected",
						message:
							"This delivery was recorded as not accepted. Start a new send only if you still intend to email the client.",
						attemptId: scope.attemptId,
					},
					409,
				);
			}
			if (
				attempt.status === "uncertain" &&
				attempt.claimId &&
				attempt.providerMessageId
			) {
				try {
					await completeKnownProviderAcceptance(
						convex,
						attemptApi.complete,
						scope,
						attempt,
					);
					return documentEmailJson({
						success: true,
						replay: true,
						attemptId: scope.attemptId,
					});
				} catch {
					return await deliveryFailureResponse(
						convex,
						attemptApi.getRecovery,
						scope,
						"uncertain",
						503,
						"The provider accepted this email, but its local record still needs reconciliation. Retry this exact action; do not create a new send.",
					);
				}
			}
			if (attempt.status === "failed") {
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"failed",
					409,
					"The provider rejected this email attempt. Review the message before starting a new send.",
				);
			}
			const claimId = crypto.randomUUID();
			const claim = parseAttemptResult(
				await convex.mutation(attemptApi.claim, {
					siteUrl,
					attemptId: scope.attemptId,
					claimId,
				}),
				[
					"claimed",
					"busy",
					"sent",
					"failed",
					"uncertain",
					"expired",
					"released",
				],
			) as {
				outcome: DeliveryClaimOutcome;
				attempt: FrozenDocumentEmailAttempt;
			};
			assertAttemptScope(claim.attempt, scope);
			if (claim.outcome === "sent")
				return documentEmailJson({
					success: true,
					replay: true,
					attemptId: scope.attemptId,
				});
			if (
				claim.outcome === "released" &&
				claim.attempt.status !== "resolved_not_sent"
			) {
				throw new Error("Document email journal returned an invalid release");
			}
			if (
				claim.outcome === "released" ||
				(claim.outcome === "expired" &&
					claim.attempt.status === "resolved_not_sent")
			) {
				return documentEmailJson(
					{
						success: false,
						error: "rejected",
						message:
							"This delivery was recorded as not accepted. Start a new send only if you still intend to email the client.",
						attemptId: scope.attemptId,
					},
					409,
				);
			}
			if (claim.outcome === "busy")
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"busy",
					409,
					"Email delivery is already in progress. Wait before trying this action again.",
				);
			if (claim.outcome === "failed") {
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"failed",
					409,
					"The provider rejected this email attempt. Review the message before starting a new send.",
				);
			}
			if (claim.outcome === "uncertain" || claim.outcome === "expired") {
				if (claim.attempt.claimId && claim.attempt.providerMessageId) {
					try {
						await completeKnownProviderAcceptance(
							convex,
							attemptApi.complete,
							scope,
							claim.attempt,
						);
						return documentEmailJson({
							success: true,
							replay: true,
							attemptId: scope.attemptId,
						});
					} catch {
						// The structured uncertainty response below preserves the same attempt.
					}
				}
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"uncertain",
					503,
					"Email delivery status is unknown. Check Resend before starting a new send.",
				);
			}

			let result: Awaited<ReturnType<typeof sendEmail>>;
			try {
				result = await sendEmail(
					{
						from: claim.attempt.envelope.from,
						to: claim.attempt.envelope.to,
						subject: claim.attempt.envelope.subject,
						text: claim.attempt.envelope.text,
						html: claim.attempt.envelope.html,
						tags: claim.attempt.providerTags,
						...(claim.attempt.envelope.replyTo
							? { replyTo: claim.attempt.envelope.replyTo }
							: {}),
					},
					{ idempotencyKey: claim.attempt.providerIdempotencyKey },
				);
			} catch (sendError) {
				await recordAttemptFailure(convex, attemptApi.fail, {
					siteUrl,
					attemptId: scope.attemptId,
					claimId,
					disposition: "uncertain",
					error:
						sendError instanceof Error
							? sendError.message
							: "Provider request failed",
				});
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"uncertain",
					503,
					"Email delivery status is unknown. Check Resend before starting a new send.",
				);
			}

			if (result.error) {
				const message =
					result.error.message || "Email provider rejected the message";
				const disposition = providerErrorDisposition(result.error);
				await recordAttemptFailure(convex, attemptApi.fail, {
					siteUrl,
					attemptId: scope.attemptId,
					claimId,
					disposition,
					error: message,
				});
				return disposition === "failed"
					? await deliveryFailureResponse(
							convex,
							attemptApi.getRecovery,
							scope,
							"failed",
							409,
							"The provider rejected this email. Review the message before starting a new send.",
						)
					: await deliveryFailureResponse(
							convex,
							attemptApi.getRecovery,
							scope,
							"uncertain",
							503,
							"The provider could not confirm this email. Check Resend before starting a new send.",
						);
			}
			const providerMessageId = result.data?.id;
			if (!providerMessageId) {
				const message = "Email provider returned no delivery id";
				await recordAttemptFailure(convex, attemptApi.fail, {
					siteUrl,
					attemptId: scope.attemptId,
					claimId,
					disposition: "uncertain",
					error: message,
				});
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"uncertain",
					503,
					"The provider did not confirm this email. Check Resend before starting a new send.",
				);
			}

			try {
				const completed = parseAttemptResult(
					await convex.mutation(attemptApi.complete, {
						siteUrl,
						attemptId: scope.attemptId,
						claimId,
						providerMessageId,
					}),
					["sent", "replay"],
				);
				assertAttemptScope(completed.attempt, scope);
			} catch (completionError) {
				await recordAttemptFailure(convex, attemptApi.fail, {
					siteUrl,
					attemptId: scope.attemptId,
					claimId,
					disposition: "uncertain",
					providerMessageId,
					error:
						completionError instanceof Error
							? completionError.message
							: "Delivery completion failed",
				});
				return await deliveryFailureResponse(
					convex,
					attemptApi.getRecovery,
					scope,
					"uncertain",
					503,
					"The provider accepted this email, but its local record still needs reconciliation. Retry this exact action; do not create a new send.",
				);
			}

			return documentEmailJson({ success: true, attemptId: scope.attemptId });
		} catch (err: unknown) {
			if (err && typeof err === "object" && "status" in err) throw err;
			handleServerError(err, `Failed to send ${config.docType} email`);
		}
	};
}
