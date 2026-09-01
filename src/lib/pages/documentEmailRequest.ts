import {
	type DocumentEmailRecovery,
	type DocumentEmailReference,
	type DocumentEmailResolution,
	type DocumentEmailResolutionOutcome,
	isDocumentEmailAttemptId,
	isTerminalDocumentEmailRecovery,
	parseDocumentEmailRecovery,
} from "../documentEmailRecovery";

const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_SEND_TIMEOUT_MS = 20_000;
const DEFAULT_RECOVERY_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const STORAGE_PREFIX = "document-email-request-v1:";
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TrackedRequest = {
	attemptId: string;
	endpoint: string;
	body: Record<string, unknown>;
	inFlight?: Promise<{ attemptId: string }>;
};

export interface DocumentEmailRequestOptions {
	retries?: number;
	retryDelayMs?: number;
	attemptId?: string;
	requestTimeoutMs?: number;
	createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
	fetchImpl?: typeof globalThis.fetch;
}

export interface DocumentEmailRecoveryRequestOptions {
	requestTimeoutMs?: number;
	createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
	fetchImpl?: typeof globalThis.fetch;
}

export interface PendingDocumentEmailRequest {
	attemptId: string;
	endpoint: string;
	body: Record<string, unknown>;
}

export interface HydratedDocumentEmailAttempt {
	attemptId: string;
	recovery?: DocumentEmailRecovery;
}

export type DocumentEmailFailureKind =
	| "busy"
	| "failed"
	| "uncertain"
	| "rejected";

export class DocumentEmailRequestError extends Error {
	readonly kind: DocumentEmailFailureKind;
	readonly status: number;
	readonly attemptId: string;
	readonly recovery?: DocumentEmailRecovery;

	constructor(input: {
		kind: DocumentEmailFailureKind;
		status: number;
		attemptId: string;
		message: string;
		recovery?: DocumentEmailRecovery;
	}) {
		super(input.message);
		this.name = "DocumentEmailRequestError";
		this.kind = input.kind;
		this.status = input.status;
		this.attemptId = input.attemptId;
		this.recovery = input.recovery;
	}
}

interface FailureResponse {
	error?: unknown;
	message?: unknown;
	attemptId?: unknown;
	recovery?: unknown;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

class DocumentEmailDeadlineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DocumentEmailDeadlineError";
	}
}

function boundedTimeout(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.min(Math.ceil(value), MAX_REQUEST_TIMEOUT_MS)
		: fallback;
}

async function fetchWithDeadline(
	input: RequestInfo | URL,
	init: RequestInit,
	options: DocumentEmailRecoveryRequestOptions,
	fallbackTimeoutMs: number,
	timeoutMessage: string,
): Promise<Response> {
	const timeoutMs = boundedTimeout(options.requestTimeoutMs, fallbackTimeoutMs);
	const signal = (options.createTimeoutSignal ?? AbortSignal.timeout)(timeoutMs);
	try {
		return await (options.fetchImpl ?? globalThis.fetch)(input, {
			...init,
			signal,
		});
	} catch (error) {
		if (signal.aborted) throw new DocumentEmailDeadlineError(timeoutMessage);
		throw error;
	}
}

function shouldRetry(status: number) {
	return status === 404 || status === 409 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestStorage(): Storage | undefined {
	try {
		return globalThis.sessionStorage;
	} catch {
		return undefined;
	}
}

function storageKey(key: string) {
	return `${STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function readStoredRequest(
	key: string,
	expectedEndpoint: string,
): TrackedRequest | undefined {
	const storage = requestStorage();
	if (!storage) return undefined;
	try {
		const raw = storage.getItem(storageKey(key));
		if (!raw) return undefined;
		const value: unknown = JSON.parse(raw);
		if (
			!isRecord(value) ||
			value.version !== 1 ||
			typeof value.attemptId !== "string" ||
			!UUID_PATTERN.test(value.attemptId) ||
			value.endpoint !== expectedEndpoint ||
			!isRecord(value.body)
		) {
			storage.removeItem(storageKey(key));
			return undefined;
		}
		return {
			attemptId: value.attemptId,
			endpoint: value.endpoint,
			body: structuredClone(value.body),
		};
	} catch {
		storage.removeItem(storageKey(key));
		return undefined;
	}
}

function storeRequest(key: string, request: TrackedRequest) {
	try {
		requestStorage()?.setItem(
			storageKey(key),
			JSON.stringify({
				version: 1,
				attemptId: request.attemptId,
				endpoint: request.endpoint,
				body: request.body,
			}),
		);
	} catch {
		// In-memory single-flight protection remains available when storage is blocked.
	}
}

function storedAttemptId(key: string): string | undefined {
	const storage = requestStorage();
	if (!storage) return undefined;
	try {
		const raw = storage.getItem(storageKey(key));
		if (!raw) return undefined;
		const value: unknown = JSON.parse(raw);
		return isRecord(value) &&
			typeof value.attemptId === "string" &&
			isDocumentEmailAttemptId(value.attemptId)
			? value.attemptId
			: undefined;
	} catch {
		return undefined;
	}
}

function removeStoredRequest(key: string, expectedAttemptId: string): boolean {
	try {
		const storage = requestStorage();
		if (!storage || storedAttemptId(key) !== expectedAttemptId) return false;
		storage.removeItem(storageKey(key));
		return true;
	} catch {
		return false;
	}
}

async function readFailure(response: Response): Promise<{
	kind?: DocumentEmailFailureKind;
	message: string;
	attemptId?: string;
	recovery?: DocumentEmailRecovery;
}> {
	const responseText = await response.text().catch(() => "");
	let body: FailureResponse | null = null;
	try {
		body = responseText ? (JSON.parse(responseText) as FailureResponse) : null;
	} catch {
		// Preserve the redacted response text below when the route did not return JSON.
	}
	const kind =
		body?.error === "busy" ||
		body?.error === "failed" ||
		body?.error === "uncertain" ||
		body?.error === "rejected"
			? body.error
			: undefined;
	let recovery: DocumentEmailRecovery | undefined;
	try {
		recovery =
			body?.recovery === undefined
				? undefined
				: parseDocumentEmailRecovery(body.recovery);
	} catch {
		// A malformed projection must never replace the locally tracked attempt.
	}
	const responseAttemptId =
		typeof body?.attemptId === "string" &&
		isDocumentEmailAttemptId(body.attemptId) &&
		(recovery === undefined || recovery.attemptId === body.attemptId)
			? body.attemptId
			: undefined;
	const message =
		typeof body?.message === "string" &&
		body.message.length > 0 &&
		body.message.length <= 512
			? body.message
			: `Email request failed (${response.status})`;
	return {
		kind,
		message,
		...(responseAttemptId ? { attemptId: responseAttemptId } : {}),
		...(recovery ? { recovery } : {}),
	};
}

async function successfulAttemptId(
	response: Response,
	fallbackAttemptId: string,
): Promise<string> {
	let value: unknown;
	try {
		value = await response.json();
	} catch {
		return fallbackAttemptId;
	}
	return isRecord(value) &&
		typeof value.attemptId === "string" &&
		isDocumentEmailAttemptId(value.attemptId)
		? value.attemptId
		: fallbackAttemptId;
}

/**
 * Send one explicit document-email action. The attempt ID belongs to the user
 * action, so every transport retry replays the exact same durable attempt.
 */
export async function postDocumentEmail(
	endpoint: string,
	body: Record<string, unknown>,
	options: DocumentEmailRequestOptions = {},
) {
	const retries = options.retries ?? 0;
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	let attemptId = options.attemptId ?? globalThis.crypto.randomUUID();
	let lastError = "";
	let lastStatus = 0;
	let lastKind: DocumentEmailFailureKind = "uncertain";
	let lastRecovery: DocumentEmailRecovery | undefined;

	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetchWithDeadline(
				endpoint,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ ...body, attemptId }),
				},
				options,
				DEFAULT_SEND_TIMEOUT_MS,
				"The email request timed out before delivery could be confirmed",
			);
			if (response.ok) {
				attemptId = await successfulAttemptId(response, attemptId);
				return { attemptId };
			}

			const failure = await readFailure(response);
			if (
				failure.attemptId &&
				(failure.attemptId === attemptId ||
					failure.recovery?.attemptId === failure.attemptId)
			) {
				attemptId = failure.attemptId;
			}
			if (failure.recovery) lastRecovery = failure.recovery;
			lastError = failure.message;
			lastStatus = response.status;
			lastKind =
				failure.kind ??
				(response.status === 409 || response.status >= 500
					? "uncertain"
					: "rejected");
			const retryable =
				failure.kind === "busy" ||
				failure.kind === "uncertain" ||
				(!failure.kind && shouldRetry(response.status));
			if (attempt >= retries || !retryable) break;
		} catch (error) {
			lastError = error instanceof Error ? error.message : "network error";
			lastStatus = 0;
			lastKind = "uncertain";
			if (attempt >= retries) break;
		}

		await sleep(retryDelayMs * (attempt + 1));
	}

	throw new DocumentEmailRequestError({
		kind: lastKind,
		status: lastStatus,
		attemptId,
		message: lastError || "Email delivery could not be confirmed",
		...(lastRecovery ? { recovery: lastRecovery } : {}),
	});
}

export function isAmbiguousDocumentEmailError(
	error: unknown,
): error is DocumentEmailRequestError {
	return (
		error instanceof DocumentEmailRequestError &&
		(error.kind === "busy" || error.kind === "uncertain")
	);
}

export function documentEmailRecoveryFromError(error: unknown):
	| {
			attemptId: string;
			recovery?: DocumentEmailRecovery;
	  }
	| undefined {
	return error instanceof DocumentEmailRequestError
		? {
				attemptId: error.attemptId,
				...(error.recovery ? { recovery: error.recovery } : {}),
			}
		: undefined;
}

export function presentableDocumentEmailRecoveryFromError(error: unknown):
	| {
			attemptId: string;
			recovery?: DocumentEmailRecovery;
	  }
	| undefined {
	const attempt = documentEmailRecoveryFromError(error);
	return attempt &&
		(isAmbiguousDocumentEmailError(error) ||
			(attempt.recovery !== undefined &&
				isTerminalDocumentEmailRecovery(attempt.recovery)))
		? attempt
		: undefined;
}

export function documentEmailFailureMessage(error: unknown): string {
	if (isAmbiguousDocumentEmailError(error)) {
		return "Delivery is still being reconciled. Check Resend before starting another send.";
	}
	if (
		error instanceof DocumentEmailRequestError &&
		error.kind === "failed"
	) {
		return "The email was rejected. Review its content before sending again.";
	}
	if (
		error instanceof DocumentEmailRequestError &&
		error.kind === "rejected" &&
		error.status >= 400 &&
		error.status < 500
	) {
		return error.message;
	}
	return "We couldn't send the email. Review it before trying again.";
}

function recoveryEndpoint(attemptId: string, resolve = false): string {
	const base = `/api/admin/document-email-attempts/${encodeURIComponent(attemptId)}`;
	return resolve ? `${base}/resolve` : base;
}

async function recoveryResponseError(response: Response): Promise<Error> {
	let message = `Document email recovery failed (${response.status})`;
	try {
		const value: unknown = await response.json();
		if (
			isRecord(value) &&
			typeof value.message === "string" &&
			value.message.length > 0 &&
			value.message.length <= 512
		) {
			message = value.message;
		}
	} catch {
		// Keep the bounded generic message.
	}
	return new Error(message);
}

export async function getDocumentEmailRecovery(
	attemptId: string,
	expectedDocument: DocumentEmailReference,
	options: DocumentEmailRecoveryRequestOptions = {},
): Promise<DocumentEmailRecovery> {
	const query = new URLSearchParams({
		documentType: expectedDocument.type,
		documentId: expectedDocument.id,
	});
	const response = await fetchWithDeadline(
		`${recoveryEndpoint(attemptId)}?${query}`,
		{
			headers: { Accept: "application/json" },
			cache: "no-store",
		},
		options,
		DEFAULT_RECOVERY_TIMEOUT_MS,
		"The recovery check timed out. It is safe to try again",
	);
	if (!response.ok) throw await recoveryResponseError(response);
	const value: unknown = await response.json().catch(() => null);
	if (!isRecord(value)) throw new Error("Document email recovery returned an invalid response");
	return parseDocumentEmailRecovery(value.recovery, {
		attemptId,
		document: expectedDocument,
	});
}

export async function getOpenDocumentEmailRecovery(
	expectedDocument: DocumentEmailReference,
	options: DocumentEmailRecoveryRequestOptions = {},
): Promise<DocumentEmailRecovery | null> {
	const query = new URLSearchParams({
		documentType: expectedDocument.type,
		documentId: expectedDocument.id,
	});
	const response = await fetchWithDeadline(
		`/api/admin/document-email-attempts/open?${query}`,
		{
			headers: { Accept: "application/json" },
			cache: "no-store",
		},
		options,
		DEFAULT_RECOVERY_TIMEOUT_MS,
		"The recovery discovery timed out. It is safe to try again",
	);
	if (!response.ok) throw await recoveryResponseError(response);
	const value: unknown = await response.json().catch(() => null);
	if (!isRecord(value)) {
		throw new Error("Document email recovery returned an invalid response");
	}
	return value.recovery === null
		? null
		: parseDocumentEmailRecovery(value.recovery, {
				document: expectedDocument,
			});
}

export async function resolveDocumentEmailRecovery(
	attemptId: string,
	expectedDocument: DocumentEmailReference,
	resolution: DocumentEmailResolution,
	options: DocumentEmailRecoveryRequestOptions = {},
): Promise<{
	outcome: DocumentEmailResolutionOutcome;
	recovery: DocumentEmailRecovery;
}> {
	const response = await fetchWithDeadline(
		recoveryEndpoint(attemptId, true),
		{
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ expectedDocument, resolution }),
		},
		options,
		DEFAULT_RECOVERY_TIMEOUT_MS,
		"The recovery update timed out. Its status is safe to check again",
	);
	if (!response.ok) throw await recoveryResponseError(response);
	const value: unknown = await response.json().catch(() => null);
	if (
		!isRecord(value) ||
		(value.outcome !== "sent" &&
			value.outcome !== "released" &&
			value.outcome !== "replay")
	) {
		throw new Error("Document email resolution returned an invalid response");
	}
	return {
		outcome: value.outcome,
		recovery: parseDocumentEmailRecovery(value.recovery, {
			attemptId,
			document: expectedDocument,
		}),
	};
}

/**
 * Keeps one durable attempt attached to each document action until delivery is
 * either confirmed or definitely rejected. Ambiguous retries therefore replay
 * the exact provider key instead of creating a second email.
 */
export function createDocumentEmailRequestTracker() {
	const attempts = new Map<string, TrackedRequest>();

	function trackedRequest(
		key: string,
		expectedEndpoint: string,
	): TrackedRequest | undefined {
		const request = attempts.get(key) ?? readStoredRequest(key, expectedEndpoint);
		if (!request || request.endpoint !== expectedEndpoint) return undefined;
		attempts.set(key, request);
		return request;
	}

	function pending(
		key: string,
		expectedEndpoint: string,
	): PendingDocumentEmailRequest | undefined {
		const request = trackedRequest(key, expectedEndpoint);
		return request
			? {
					attemptId: request.attemptId,
					endpoint: request.endpoint,
					body: structuredClone(request.body),
				}
			: undefined;
	}

	function clearResolved(key: string, attemptId: string): boolean {
		const current = attempts.get(key);
		if (current && current.attemptId !== attemptId) return false;
		let cleared = false;
		if (current?.attemptId === attemptId) {
			attempts.delete(key);
			cleared = true;
		}
		return removeStoredRequest(key, attemptId) || cleared;
	}

	function adoptAttempt(
		key: string,
		request: TrackedRequest,
		attemptId: string,
	) {
		if (request.attemptId === attemptId) return;
		request.attemptId = attemptId;
		if (attempts.get(key) === request) storeRequest(key, request);
	}

	function adoptRecoveryAttempt(
		key: string,
		endpoint: string,
		recovery: DocumentEmailRecovery,
	) {
		let request = trackedRequest(key, endpoint);
		if (!request) {
			request = {
				attemptId: recovery.attemptId,
				endpoint,
				// The durable journal, not the resumed browser, owns the frozen body.
				// Supplying its canonical ID is sufficient to replay that exact envelope.
				body: {},
			};
			attempts.set(key, request);
			storeRequest(key, request);
			return;
		}
		adoptAttempt(key, request, recovery.attemptId);
	}

	return {
		pending,
		async hydrate(
			key: string,
			endpoint: string,
			document: DocumentEmailReference,
			options: DocumentEmailRecoveryRequestOptions = {},
		): Promise<HydratedDocumentEmailAttempt | null> {
			const local = pending(key, endpoint);
			const [openResult, exactResult] = await Promise.allSettled([
				getOpenDocumentEmailRecovery(document, options),
				local
					? getDocumentEmailRecovery(local.attemptId, document, options)
					: Promise.resolve(null),
			]);

			if (openResult.status === "fulfilled" && openResult.value) {
				adoptRecoveryAttempt(key, endpoint, openResult.value);
				return {
					attemptId: openResult.value.attemptId,
					recovery: openResult.value,
				};
			}

			if (exactResult.status === "fulfilled" && exactResult.value) {
				const latest = pending(key, endpoint);
				if (latest && latest.attemptId !== exactResult.value.attemptId) {
					return { attemptId: latest.attemptId };
				}
				if (isTerminalDocumentEmailRecovery(exactResult.value)) {
					clearResolved(key, exactResult.value.attemptId);
				}
				return {
					attemptId: exactResult.value.attemptId,
					recovery: exactResult.value,
				};
			}

			const latest = pending(key, endpoint);
			if (latest) return { attemptId: latest.attemptId };
			if (openResult.status === "rejected") throw openResult.reason;
			return null;
		},
		async post(
			key: string,
			endpoint: string,
			body: Record<string, unknown>,
			options: Omit<DocumentEmailRequestOptions, "attemptId"> = {},
		) {
			let request = attempts.get(key) ?? readStoredRequest(key, endpoint);
			if (!request) {
				request = {
					attemptId: globalThis.crypto.randomUUID(),
					endpoint,
					body: structuredClone(body),
				};
				// Reserve the action before the first network boundary. A rapid second
				// click must share both the frozen request and the in-flight operation.
			}
			attempts.set(key, request);
			storeRequest(key, request);
			if (request.inFlight) return request.inFlight;

			const operation = postDocumentEmail(
					request.endpoint,
					request.body,
					{
						...options,
						attemptId: request.attemptId,
					},
				)
				.then((result) => {
					adoptAttempt(key, request, result.attemptId);
					if (attempts.get(key) === request) {
						clearResolved(key, result.attemptId);
					}
					return result;
				})
				.catch((error) => {
					if (attempts.get(key) === request) {
						if (error instanceof DocumentEmailRequestError) {
							adoptAttempt(key, request, error.attemptId);
						}
						if (isAmbiguousDocumentEmailError(error)) {
							delete request.inFlight;
						} else {
							clearResolved(key, request.attemptId);
						}
					}
					throw error;
				});
			request.inFlight = operation;
			return operation;
		},
		clearResolved,
	};
}

/** Preserve accepted, signed, paid, overdue, expired, and other terminal states. */
export function statusAfterSuccessfulDocumentEmail<TStatus extends string>(
	status: TStatus,
): TStatus | "sent" {
	return status === "draft" ? "sent" : status;
}
