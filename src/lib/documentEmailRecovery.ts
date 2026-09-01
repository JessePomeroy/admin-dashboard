export type DocumentEmailType = "invoice" | "quote" | "contract";

export type DocumentEmailAttemptStatus =
	| "prepared"
	| "claimed"
	| "sent"
	| "failed"
	| "uncertain"
	| "resolved_not_sent";

export interface DocumentEmailReference {
	type: DocumentEmailType;
	id: string;
}

/**
 * Browser-safe view of one durable delivery attempt. The Convex journal keeps
 * the frozen message, portal capability, provider key, and claim authority on
 * the server; this projection contains only what an operator needs to recover
 * an ambiguous send.
 */
export interface DocumentEmailRecovery {
	protocolVersion: 1;
	attemptId: string;
	document: DocumentEmailReference;
	status: DocumentEmailAttemptStatus;
	recipient: string;
	subject: string;
	providerMessageId?: string;
	failure?: string;
	claimCount: number;
	createdAt: number;
	updatedAt: number;
	retryUntil: number;
	resolveNotAcceptedAt: number;
	portalExpired: boolean;
	canRetry: boolean;
	canFinalizeAcceptance: boolean;
	canRecordAcceptance: boolean;
	canResolveNotAccepted: boolean;
}

export type DocumentEmailResolution =
	| { kind: "accepted"; providerMessageId?: string }
	| {
			kind: "not_accepted";
			confirmation: "NOT ACCEPTED";
			note: string;
	  };

export type DocumentEmailResolutionOutcome = "sent" | "released" | "replay";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
	value: unknown,
	label: string,
	maxLength: number,
): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maxLength
	) {
		throw new Error(`Document email recovery returned an invalid ${label}`);
	}
	return value;
}

function optionalString(
	value: unknown,
	label: string,
	maxLength: number,
): string | undefined {
	return value === undefined
		? undefined
		: requiredString(value, label, maxLength);
}

function timestamp(value: unknown, label: string): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0
	) {
		throw new Error(`Document email recovery returned an invalid ${label}`);
	}
	return value;
}

function flag(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Document email recovery returned an invalid ${label}`);
	}
	return value;
}

export function isDocumentEmailAttemptId(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function parseDocumentEmailReference(
	value: unknown,
): DocumentEmailReference {
	if (!isRecord(value)) {
		throw new Error("Document email recovery returned an invalid document");
	}
	if (
		value.type !== "invoice" &&
		value.type !== "quote" &&
		value.type !== "contract"
	) {
		throw new Error("Document email recovery returned an invalid document type");
	}
	return {
		type: value.type,
		id: requiredString(value.id, "document id", 512),
	};
}

export function documentEmailReferencesMatch(
	left: DocumentEmailReference,
	right: DocumentEmailReference,
): boolean {
	return left.type === right.type && left.id === right.id;
}

export function parseDocumentEmailRecovery(
	value: unknown,
	expected?: {
		attemptId?: string;
		document?: DocumentEmailReference;
	},
): DocumentEmailRecovery {
	if (!isRecord(value) || value.protocolVersion !== 1) {
		throw new Error("Document email recovery returned an invalid projection");
	}
	const attemptId = requiredString(value.attemptId, "attempt id", 36);
	if (!isDocumentEmailAttemptId(attemptId)) {
		throw new Error("Document email recovery returned an invalid attempt id");
	}
	const document = parseDocumentEmailReference(value.document);
	if (
		expected?.attemptId !== undefined &&
		expected.attemptId !== attemptId
	) {
		throw new Error("Document email recovery does not match this attempt");
	}
	if (
		expected?.document !== undefined &&
		!documentEmailReferencesMatch(expected.document, document)
	) {
		throw new Error("Document email recovery does not match this document");
	}
	if (
		value.status !== "prepared" &&
		value.status !== "claimed" &&
		value.status !== "sent" &&
		value.status !== "failed" &&
		value.status !== "uncertain" &&
		value.status !== "resolved_not_sent"
	) {
		throw new Error("Document email recovery returned an invalid status");
	}
	if (
		typeof value.claimCount !== "number" ||
		!Number.isSafeInteger(value.claimCount) ||
		value.claimCount < 0
	) {
		throw new Error("Document email recovery returned an invalid claim count");
	}
	const providerMessageId = optionalString(
		value.providerMessageId,
		"provider message id",
		512,
	);
	const failure = optionalString(value.failure, "failure", 4096);

	return {
		protocolVersion: 1,
		attemptId,
		document,
		status: value.status,
		recipient: requiredString(value.recipient, "recipient", 512),
		subject: requiredString(value.subject, "subject", 998),
		...(providerMessageId ? { providerMessageId } : {}),
		...(failure ? { failure } : {}),
		claimCount: value.claimCount,
		createdAt: timestamp(value.createdAt, "created time"),
		updatedAt: timestamp(value.updatedAt, "updated time"),
		retryUntil: timestamp(value.retryUntil, "retry deadline"),
		resolveNotAcceptedAt: timestamp(
			value.resolveNotAcceptedAt,
			"not-accepted eligibility time",
		),
		portalExpired: flag(value.portalExpired, "portal state"),
		canRetry: flag(value.canRetry, "retry action"),
		canFinalizeAcceptance: flag(
			value.canFinalizeAcceptance,
			"finalize action",
		),
		canRecordAcceptance: flag(
			value.canRecordAcceptance,
			"record-acceptance action",
		),
		canResolveNotAccepted: flag(
			value.canResolveNotAccepted,
			"not-accepted action",
		),
	};
}

export function isDocumentEmailRecovery(value: unknown): value is DocumentEmailRecovery {
	try {
		parseDocumentEmailRecovery(value);
		return true;
	} catch {
		return false;
	}
}

export function isTerminalDocumentEmailRecovery(
	recovery: DocumentEmailRecovery,
): boolean {
	return (
		recovery.status === "sent" ||
		recovery.status === "failed" ||
		recovery.status === "resolved_not_sent"
	);
}
