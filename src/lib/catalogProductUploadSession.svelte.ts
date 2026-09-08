import {
	completeCatalogPrivateEditorUpload,
	declareCatalogPrivateEditorUpload,
	newCatalogPrivateEditorUploadHandle,
	prepareCatalogPrivateEditorUpload,
	putCatalogPrivateEditorUpload,
} from "./catalogPrivateEditorUpload";
import {
	uploadCatalogProductArtwork,
	type CatalogProductArtworkCheckpoint,
	type CatalogProductArtworkStatus,
} from "./catalogProductArtworkUpload";
import type { CatalogEditorPaidFileRelation } from "./catalogProductEditor";

export type ProductUploadDraft = {
	productId: string;
	draftRevisionId: string;
	draftJson: string;
};
type DownloadRelation = { kind: "paid_digital_file"; relationKey: string };
type VerifiedDownload = { relation: DownloadRelation; asset: CatalogEditorPaidFileRelation["asset"] };
type DownloadOperation = {
	uploadHandle: string;
	draft: ProductUploadDraft;
	relation: DownloadRelation;
	controller: AbortController;
	putIssued: boolean;
	onVerified: (result: VerifiedDownload) => void;
};
type DownloadPhase = "idle" | "error" | "reading" | "preparing" | "uploading" | "completing" | "pending";

const AUTO_CHECKS = 3;
const AUTO_INTERVAL_MS = 65_000;
const AUTO_WINDOW_MS = 305_000;

/** Owns upload lifetimes, never draft mutations or publication authority. */
export function createCatalogProductUploadSession(options: {
	upload: { prepareEndpoint: string; completeEndpoint: string } | null;
	currentDraft: () => ProductUploadDraft | null;
}) {
	let download = $state.raw<DownloadOperation | null>(null);
	let phase = $state<DownloadPhase>("idle");
	let message = $state("");
	let selectedFile = $state<File | null>(null);
	let relation = $state.raw<DownloadRelation | null>(null);
	let version = $state("");
	let manualReady = $state(false);
	let automaticChecksRemaining = $state(0);
	let automaticDeadline = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let artworkController = $state.raw<AbortController | null>(null);
	let artworkCheckpoints = new WeakMap<File, CatalogProductArtworkCheckpoint>();
	const usedHandles = new Set<string>();
	let disposed = false;

	function sameDraft(snapshot: ProductUploadDraft) {
		const current = options.currentDraft();
		return current?.productId === snapshot.productId
			&& current.draftRevisionId === snapshot.draftRevisionId
			&& current.draftJson === snapshot.draftJson;
	}

	function clearTimer() {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		manualReady = false;
	}

	function endDownload(nextPhase: "idle" | "error", nextMessage: string) {
		clearTimer();
		download?.controller.abort();
		download = null;
		phase = nextPhase;
		message = nextMessage;
	}

	function exposeManualCheck(operation: DownloadOperation) {
		if (download !== operation) return;
		automaticChecksRemaining = 0;
		manualReady = true;
		timer = undefined;
		message = "Automatic verification checks are complete. Manual checking is available.";
	}

	function scheduleCheck(operation: DownloadOperation, retryAfterMs: number) {
		clearTimer();
		if (automaticDeadline === 0) automaticDeadline = Date.now() + AUTO_WINDOW_MS;
		const delay = Math.max(retryAfterMs, AUTO_INTERVAL_MS);
		if (automaticChecksRemaining > 0 && Date.now() + delay <= automaticDeadline) {
			message = "Verification is still pending. It will be checked automatically.";
			timer = setTimeout(() => {
				timer = undefined;
				if (download !== operation) return;
				if (Date.now() >= automaticDeadline) return exposeManualCheck(operation);
				automaticChecksRemaining -= 1;
				void reconcile(operation);
			}, delay);
			return;
		}
		automaticChecksRemaining = 0;
		message = "Automatic verification checks are complete. Check again when the action becomes available.";
		timer = setTimeout(() => exposeManualCheck(operation), retryAfterMs);
	}

	async function reconcile(operation: DownloadOperation) {
		if (!options.upload || download !== operation) return;
		phase = "completing";
		message = "Checking verified asset status…";
		const result = await completeCatalogPrivateEditorUpload(
			options.upload.completeEndpoint, operation.uploadHandle, operation.controller.signal,
		).catch((error: unknown) => {
			if (download !== operation) return null;
			throw error;
		});
		if (download !== operation || !result) return;
		if (result.status === "pending") {
			phase = "pending";
			scheduleCheck(operation, result.retryAfterMs);
			return;
		}
		if (result.status === "failed") {
			endDownload("error", "The file could not be verified. Choose it again to retry.");
			return;
		}
		if (!sameDraft(operation.draft) || result.asset.kind !== operation.relation.kind) {
			endDownload("error", "This product changed while the file was uploading. Reload before using it.");
			return;
		}
		// Deliver only the exact verified kind, synchronously with the final identity check.
		operation.onVerified({ relation: operation.relation, asset: result.asset });
		relation = null;
		selectedFile = null;
		version = "";
		endDownload("idle", `${result.asset.originalFilename} is attached to this draft. Save the draft to keep it.`);
	}

	async function startDownload(draft: ProductUploadDraft, onVerified: DownloadOperation["onVerified"]) {
		if (disposed || !options.upload || !selectedFile || !relation || download || !sameDraft(draft)) return;
		let file: File | null = selectedFile;
		const uploadHandle = newCatalogPrivateEditorUploadHandle();
		if (usedHandles.has(uploadHandle)) {
			phase = "error";
			message = "A new upload could not be started. Try again.";
			return;
		}
		usedHandles.add(uploadHandle);
		clearTimer();
		const operation: DownloadOperation = {
			uploadHandle, draft: { ...draft }, relation: { ...relation },
			controller: new AbortController(), putIssued: false, onVerified,
		};
		download = operation;
		phase = "reading";
		message = "Reading and hashing the selected file…";
		try {
			let declaration: Awaited<ReturnType<typeof declareCatalogPrivateEditorUpload>> | null = await declareCatalogPrivateEditorUpload(
				file, "digital_download", uploadHandle, version, operation.controller.signal,
			);
			if (download !== operation) return;
			phase = "preparing";
			message = "Preparing the file…";
			let prepared: Awaited<ReturnType<typeof prepareCatalogPrivateEditorUpload>> | null = await prepareCatalogPrivateEditorUpload(
				options.upload.prepareEndpoint, declaration, operation.controller.signal,
			);
			if (download !== operation || operation.putIssued) return;
			operation.putIssued = true;
			selectedFile = null;
			version = "";
			phase = "uploading";
			message = "Uploading and verifying the file…";
			try {
				await putCatalogPrivateEditorUpload(prepared, file, declaration.contentType, operation.controller.signal);
			} catch {
				if (operation.controller.signal.aborted) return;
				// A lost or rejected PUT response is reconciled only through completion.
			}
			prepared = null;
			declaration = null;
			file = null;
			if (download !== operation) return;
			automaticChecksRemaining = AUTO_CHECKS;
			automaticDeadline = 0;
			await reconcile(operation);
		} catch {
			if (download !== operation) return;
			endDownload("error", "The file could not be prepared safely. Review it and try again.");
		}
	}

	async function uploadArtwork(
		file: File,
		request: {
			draft: ProductUploadDraft;
			productKind: "print" | "print_set";
			mediaEndpoint: string;
			onStatus: (status: CatalogProductArtworkStatus) => void;
			onVerified: (result: Awaited<ReturnType<typeof uploadCatalogProductArtwork>>) => void;
		},
	) {
		const { draft, productKind, mediaEndpoint, onStatus, onVerified } = request;
		if (disposed || !options.upload || artworkController || !sameDraft(draft)) {
			throw new Error("This artwork upload is not available right now.");
		}
		const controller = new AbortController();
		artworkController = controller;
		try {
			const result = await uploadCatalogProductArtwork(file, {
				productKind,
				privatePrepareEndpoint: options.upload.prepareEndpoint,
				privateCompleteEndpoint: options.upload.completeEndpoint,
				mediaEndpoint,
				signal: controller.signal,
				checkpoint: artworkCheckpoints.get(file),
				onCheckpoint: (checkpoint) => {
					if (artworkController === controller) artworkCheckpoints.set(file, checkpoint);
				},
				onCheckpointInvalidated: (checkpoint) => {
					if (artworkController === controller && artworkCheckpoints.get(file) === checkpoint) {
						artworkCheckpoints.delete(file);
					}
				},
				onStatus: (status) => {
					if (artworkController === controller) onStatus(status);
				},
			});
			if (artworkController !== controller || !sameDraft(draft)) {
				throw new Error("This product changed while the image was uploading. Reload it and try again.");
			}
			onVerified(result);
			artworkCheckpoints.delete(file);
		} finally {
			if (artworkController === controller) artworkController = null;
		}
	}

	function reset() {
		endDownload("idle", "");
		selectedFile = null;
		relation = null;
		version = "";
		automaticChecksRemaining = 0;
		automaticDeadline = 0;
		artworkController?.abort();
		artworkController = null;
		artworkCheckpoints = new WeakMap();
	}

	return {
		get phase() { return phase; },
		get message() { return message; },
		get downloadBusy() { return download !== null; },
		get artworkBusy() { return artworkController !== null; },
		get selectedFile() { return selectedFile; },
		get hasDownload() { return relation !== null; },
		get version() { return version; },
		set version(value: string) { version = value; },
		get manualCheckVisible() { return phase === "pending" && automaticChecksRemaining === 0; },
		get manualCheckReady() { return manualReady; },
		selectDownload(file: File | null, nextRelation: DownloadRelation) {
			if (disposed || download) return;
			selectedFile = file;
			relation ??= { ...nextRelation };
			message = "";
		},
		startDownload,
		cancelDownload() {
			if (!download || (phase !== "reading" && phase !== "preparing")) return;
			selectedFile = null;
			endDownload("idle", "Upload cancelled before transfer.");
		},
		async checkDownloadAgain() {
			if (!manualReady || phase !== "pending" || !download) return;
			manualReady = false;
			await reconcile(download);
		},
		draftLoaded(draftRevisionId: string) {
			if (download && download.draft.draftRevisionId !== draftRevisionId) {
				endDownload("error", "This product changed while the file was uploading. Reload before trying again.");
			}
		},
		uploadArtwork,
		reset,
		dispose() { disposed = true; reset(); },
	};
}
