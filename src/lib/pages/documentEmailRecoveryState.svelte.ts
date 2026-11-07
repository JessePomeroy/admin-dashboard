import { isTerminalDocumentEmailRecovery, type DocumentEmailRecovery, type DocumentEmailReference } from "../documentEmailRecovery";
import { type HydratedDocumentEmailAttempt, createDocumentEmailRequestTracker } from "./documentEmailRequest";

type Tracker = Pick<ReturnType<typeof createDocumentEmailRequestTracker>, "pending" | "hydrate" | "clearResolved">;

/** Presentation state around the durable request tracker, scoped to one document page. */
export function createDocumentEmailRecoveryState(options: {
	type: DocumentEmailReference["type"];
	endpoint: (documentId: string) => string;
	selectedId: () => string | undefined;
	tracker: Tracker;
	onHydrateError: (error: unknown) => void;
}) {
	let visible = $state<{ documentId: string; attempt: HydratedDocumentEmailAttempt } | null>(null);
	const key = (documentId: string) => `${options.type}:${documentId}`;
	const revisions = new Map<string, number>();
	function invalidate(documentId: string) {
		const revision = (revisions.get(documentId) ?? 0) + 1;
		revisions.set(documentId, revision);
		return revision;
	}

	function remember(documentId: string, attempt: HydratedDocumentEmailAttempt) {
		const selected = options.selectedId();
		if (selected && selected !== documentId) return false;
		invalidate(documentId);
		const current = forDocument(documentId);
		if (current?.attemptId === attempt.attemptId && current.recovery && !attempt.recovery) return true;
		visible = { documentId, attempt };
		return true;
	}

	function forDocument(documentId: string) {
		return visible?.documentId === documentId ? visible.attempt : null;
	}

	function clear(documentId: string) {
		invalidate(documentId);
		if (visible?.documentId === documentId) visible = null;
	}

	async function hydrate(documentId: string, onVisible?: () => void) {
		const endpoint = options.endpoint(documentId);
		const pending = options.tracker.pending(key(documentId), endpoint);
		if (pending && remember(documentId, { attemptId: pending.attemptId })) onVisible?.();
		const revision = invalidate(documentId);
		try {
			const hydrated = await options.tracker.hydrate(key(documentId), endpoint, { type: options.type, id: documentId });
			if (revisions.get(documentId) !== revision || options.selectedId() !== documentId) return;
			const latest = options.tracker.pending(key(documentId), endpoint);
			if (hydrated && latest && latest.attemptId !== hydrated.attemptId) return;
			// Only this discovery's unchanged presentation owner may adopt its result.
			if (hydrated) {
				if (remember(documentId, hydrated)) onVisible?.();
			} else if (!latest && visible?.documentId === documentId && (!visible.attempt.recovery || !isTerminalDocumentEmailRecovery(visible.attempt.recovery))) {
				visible = null;
			}
		} catch (error) {
			options.onHydrateError(error);
		}
	}

	function resolve(result: { attemptId: string; recovery: DocumentEmailRecovery }) {
		const documentId = result.recovery.document.id;
		const requestKey = key(documentId);
		options.tracker.clearResolved(requestKey, result.attemptId);
		const pending = options.tracker.pending(requestKey, options.endpoint(documentId));
		if ((pending && pending.attemptId !== result.attemptId)
			|| (visible?.documentId === documentId && visible.attempt.attemptId !== result.attemptId)
			|| (options.selectedId() && options.selectedId() !== documentId)) return false;
		return remember(documentId, { attemptId: result.attemptId, recovery: result.recovery });
	}

	function dismiss(result: { attemptId: string; recovery: DocumentEmailRecovery }) {
		if (visible?.documentId !== result.recovery.document.id || visible.attempt.attemptId !== result.attemptId) return false;
		invalidate(result.recovery.document.id);
		visible = null;
		return true;
	}

	return { remember, forDocument, clear, hydrate, resolve, dismiss };
}
