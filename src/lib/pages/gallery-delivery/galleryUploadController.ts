import {
	galleryFileContentType,
	isAllowedGalleryFile,
	isBrowserPreviewableGalleryFile,
	type GalleryUploadPolicy,
} from "../../galleryUploadPolicy";
import { isValidGalleryUploadSize } from "../../galleryUploadSize";
import type { GalleryStoragePort, GalleryUploadSession } from "./galleryStoragePort";

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_UPLOAD_SESSION_REFRESH_BUFFER_MS = 60_000;

export interface GalleryUploadBatchSummary {
	totalCount: number;
	completedCount: number;
	totalSizeBytes: number;
	hasErrors: boolean;
	sourceFileCount: number;
	sourceSizeBytes: number;
	acceptedFileCount: number;
	acceptedSizeBytes: number;
	rejectedFileCount: number;
	rejectedSizeBytes: number;
}

export interface GalleryUploadFile {
	file: File;
	id: string;
	intakeStatus: "accepted" | "rejected";
	status: "pending" | "uploading" | "processing" | "done" | "error";
	progress: number;
	error?: string;
	retryable?: boolean;
	r2Key?: string;
	imageId?: string;
	deleting?: boolean;
	pauseRequested?: boolean;
	controller?: AbortController;
	originalUploaded?: boolean;
	variantsProcessed?: boolean;
	dimensions?: { width: number; height: number };
	deleteRequested?: boolean;
	registrationStarted?: boolean;
}

export interface GalleryUploadSnapshot extends GalleryUploadBatchSummary {
	files: GalleryUploadFile[];
	selectedFileIds: string[];
	deletingSelected: boolean;
	paused: boolean;
	visibleCompletedCount: number;
	retryableErrorCount: number;
	selectableCount: number;
	selectedCount: number;
	allSelectableSelected: boolean;
}

interface GalleryUploadControllerOptions {
	storage: GalleryStoragePort;
	siteUrl: string;
	galleryId: string | (() => string);
	uploadPolicy?: () => GalleryUploadPolicy;
	addImage(input: {
		siteUrl: string;
		galleryId: string;
		r2Key: string;
		filename: string;
		sizeBytes: number;
		width: number;
		height: number;
	}): Promise<string>;
	removeImage(id: string): Promise<void>;
	getImageDimensions(file: File): Promise<{ width: number; height: number }>;
	onupload?: () => void;
	onchange?: (snapshot: GalleryUploadSnapshot) => void;
	logger?: Pick<Console, "warn">;
	randomId?: () => string;
	now?: () => number;
	maxConcurrent?: number;
	uploadSessionRefreshBufferMs?: number;
}

export interface GalleryUploadController {
	getSnapshot(): GalleryUploadSnapshot;
	subscribe(listener: (snapshot: GalleryUploadSnapshot) => void): () => void;
	addFiles(fileList: Iterable<File> | ArrayLike<File>): void;
	retryUpload(id: string): void;
	retryAllUploads(): void;
	pauseUploads(): void;
	resumeUploads(): void;
	canSelectForDelete(file: GalleryUploadFile): boolean;
	isSelected(id: string): boolean;
	toggleSelected(id: string): void;
	toggleSelectAll(): void;
	deleteSelectedFiles(): Promise<void>;
	clearCompleted(): void;
	cancelPendingUploads(): Promise<void>;
	dispose(): Promise<void>;
}

function throwIfCanceled(signal: AbortSignal): void {
	if (signal.aborted) throw new Error("Request canceled");
}

export function createGalleryUploadController(
	options: GalleryUploadControllerOptions,
): GalleryUploadController {
	let files: GalleryUploadFile[] = [];
	let selectedFileIds: string[] = [];
	let deletingSelected = false;
	let paused = false;
	let uploadSession: GalleryUploadSession | null = null;
	let uploadSessionPromise: Promise<GalleryUploadSession> | null = null;
	let batchTotalCount = 0;
	let batchTotalSizeBytes = 0;
	let batchSourceFileCount = 0;
	let batchSourceSizeBytes = 0;
	let batchAcceptedFileCount = 0;
	let batchAcceptedSizeBytes = 0;
	let batchRejectedFileCount = 0;
	let batchRejectedSizeBytes = 0;
	let clearedCompletedCount = 0;
	const inFlight = new Map<string, Promise<void>>();
	const listeners = new Set<(snapshot: GalleryUploadSnapshot) => void>();
	let disposed = false;
	let deletion: Promise<void> | undefined;
	let disposal: Promise<void> | undefined;

	const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
	const uploadSessionRefreshBufferMs = options.uploadSessionRefreshBufferMs
		?? DEFAULT_UPLOAD_SESSION_REFRESH_BUFFER_MS;
	const now = options.now ?? Date.now;
	const logger = options.logger ?? console;
	const randomId = options.randomId ?? (() => crypto.randomUUID());
	const getGalleryId = () =>
		typeof options.galleryId === "function" ? options.galleryId() : options.galleryId;

	function canSelectForDelete(file: GalleryUploadFile): boolean {
		return !file.deleting;
	}

	function getSnapshot(): GalleryUploadSnapshot {
		const visibleCompletedCount = files.filter((file) => file.status === "done").length;
		const completedCount = clearedCompletedCount + visibleCompletedCount;
		const hasErrors = files.some((file) => file.status === "error");
		const retryableErrorCount = files.filter(
			(file) => file.status === "error" && file.retryable !== false,
		).length;
		const selectableCount = files.filter(canSelectForDelete).length;
		const selectedCount = selectedFileIds.filter((id) =>
			files.some((file) => file.id === id && canSelectForDelete(file))
		).length;

		return {
			files: [...files],
			selectedFileIds: [...selectedFileIds],
			deletingSelected,
			paused,
			visibleCompletedCount,
			totalCount: batchTotalCount,
			completedCount,
			totalSizeBytes: batchTotalSizeBytes,
			hasErrors,
			sourceFileCount: batchSourceFileCount,
			sourceSizeBytes: batchSourceSizeBytes,
			acceptedFileCount: batchAcceptedFileCount,
			acceptedSizeBytes: batchAcceptedSizeBytes,
			rejectedFileCount: batchRejectedFileCount,
			rejectedSizeBytes: batchRejectedSizeBytes,
			retryableErrorCount,
			selectableCount,
			selectedCount,
			allSelectableSelected: selectableCount > 0 && selectedCount === selectableCount,
		};
	}

	function emitChange(): void {
		const snapshot = getSnapshot();
		options.onchange?.(snapshot);
		for (const listener of listeners) listener(snapshot);
	}

	async function ensureUploadSession(): Promise<string> {
		if (uploadSession && uploadSession.expiresAt - uploadSessionRefreshBufferMs > now()) {
			return uploadSession.token;
		}

		if (!uploadSessionPromise) {
			uploadSessionPromise = options.storage.startUploadSession({
				siteUrl: options.siteUrl,
				galleryId: getGalleryId(),
			}).finally(() => {
				uploadSessionPromise = null;
			});
		}

		uploadSession = await uploadSessionPromise;
		return uploadSession.token;
	}

	function addFiles(fileList: Iterable<File> | ArrayLike<File>): void {
		if (disposed) return;
		if (files.length === 0) {
			batchTotalCount = 0;
			batchTotalSizeBytes = 0;
			batchSourceFileCount = 0;
			batchSourceSizeBytes = 0;
			batchAcceptedFileCount = 0;
			batchAcceptedSizeBytes = 0;
			batchRejectedFileCount = 0;
			batchRejectedSizeBytes = 0;
			clearedCompletedCount = 0;
		}

		const newFiles: GalleryUploadFile[] = [];
		const sourceFiles = Array.from(fileList);
		batchSourceFileCount += sourceFiles.length;
		batchSourceSizeBytes += sourceFiles.reduce((sum, file) => sum + file.size, 0);

		for (const file of sourceFiles) {
			if (!isAllowedGalleryFile(file, options.uploadPolicy?.())) {
				newFiles.push({
					file,
					id: randomId(),
					intakeStatus: "rejected",
					status: "error",
					progress: 0,
					error: "File type not allowed",
					retryable: false,
				});
				batchRejectedFileCount += 1;
				batchRejectedSizeBytes += file.size;
				continue;
			}
			if (!isValidGalleryUploadSize(file.size)) {
				newFiles.push({
					file,
					id: randomId(),
					intakeStatus: "rejected",
					status: "error",
					progress: 0,
					error: file.size <= 0
						? "File is empty"
						: "File size is not supported by this browser",
					retryable: false,
				});
				batchRejectedFileCount += 1;
				batchRejectedSizeBytes += file.size;
				continue;
			}
			newFiles.push({
				file,
				id: randomId(),
				intakeStatus: "accepted",
				status: "pending",
				progress: 0,
			});
			batchAcceptedFileCount += 1;
			batchAcceptedSizeBytes += file.size;
		}

		batchTotalCount += newFiles.length;
		batchTotalSizeBytes += newFiles.reduce((sum, uploadFile) => sum + uploadFile.file.size, 0);
		files = [...files, ...newFiles];
		emitChange();
		processQueue();
	}

	async function registerFile(file: GalleryUploadFile): Promise<string> {
		if (!file.r2Key || !file.dimensions) throw new Error("Uploaded file identity is missing");
		file.registrationStarted = true;
		return await options.addImage({
			siteUrl: options.siteUrl, galleryId: getGalleryId(), r2Key: file.r2Key,
			filename: file.file.name, sizeBytes: file.file.size,
			width: file.dimensions.width, height: file.dimensions.height,
		});
	}

	async function uploadOne(next: GalleryUploadFile): Promise<void> {
		next.status = "uploading";
		next.controller = new AbortController();
		emitChange();

		try {
			const contentType = galleryFileContentType(next.file);
			const signal = next.controller.signal;
			if (!next.originalUploaded) {
				// An upload's response may fail after bytes reached storage. Retain
				// that exact target until cleanup succeeds before issuing a new key.
				if (next.r2Key) {
					await deleteR2File(next.r2Key);
					next.r2Key = undefined;
				}
				const uploadSessionToken = await ensureUploadSession();
				throwIfCanceled(signal);
				const { r2Key, uploadUrl, uploadToken } = await options.storage.presign({
					siteUrl: options.siteUrl,
					galleryId: getGalleryId(),
					filename: next.file.name,
					contentType,
					sizeBytes: next.file.size,
					uploadSessionToken,
					signal,
				});
				throwIfCanceled(signal);
				next.r2Key = r2Key;
				next.progress = 30;
				emitChange();

				await options.storage.uploadFile({
					file: next.file,
					r2Key,
					uploadUrl,
					uploadToken,
					contentType,
					uploadSessionToken,
					signal,
				});
				next.originalUploaded = true;
				throwIfCanceled(signal);
			}
			const r2Key = next.r2Key;
			if (!r2Key) throw new Error("Uploaded file identity is missing");

			next.status = "processing";
			next.progress = 70;
			emitChange();

			if (!next.variantsProcessed) {
				const uploadSessionToken = await ensureUploadSession();
				await options.storage.process({ r2Key, uploadSessionToken, signal });
				next.variantsProcessed = true;
			}
			throwIfCanceled(signal);

			next.dimensions ??= isBrowserPreviewableGalleryFile(next.file.name)
				? await options.getImageDimensions(next.file)
				: { width: 0, height: 0 };
			throwIfCanceled(signal);

			next.imageId = await registerFile(next);
			// Deletion waits for this flight before cleaning storage and metadata.
			// A pause may still finish a registration already acknowledged by Convex.
			if (next.deleteRequested) throw new Error("Request canceled");

			next.status = "done";
			next.progress = 100;
			emitChange();
			options.onupload?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Upload failed";
			if (message === "Request canceled" && next.pauseRequested && !next.deleting) {
				try {
					if (next.r2Key && !next.originalUploaded) {
						await deleteR2File(next.r2Key);
						next.r2Key = undefined;
					}
					next.status = "pending";
					next.progress = next.originalUploaded ? 70 : 0;
					next.error = undefined;
					next.retryable = undefined;
				} catch (cleanupError) {
					next.status = "error";
					next.error = cleanupError instanceof Error ? cleanupError.message : "Cleanup failed";
				}
			} else {
				next.status = "error";
				next.error = message === "Request canceled" ? "Canceled" : message;
				next.retryable = message === "Request canceled" ? false : next.retryable;
			}
			next.pauseRequested = undefined;
			emitChange();
		} finally {
			next.controller = undefined;
		}
	}

	function processQueue(): void {
		if (paused || disposed) return;
		while (true) {
			const uploading = files.filter(
				(file) => file.status === "uploading" || file.status === "processing",
			).length;
			if (uploading >= maxConcurrent) return;

			const next = files.find((file) => file.status === "pending" && !file.deleting);
			if (!next) return;

			next.status = "uploading";
			emitChange();
			const flight = uploadOne(next);
			inFlight.set(next.id, flight);
			void flight.then(() => {
				inFlight.delete(next.id);
				processQueue();
			});
		}
	}

	function pauseUploads(): void {
		if (paused) return;
		paused = true;
		for (const file of files) {
			if (file.status !== "uploading" && file.status !== "processing") continue;
			file.pauseRequested = true;
			file.controller?.abort();
		}
		emitChange();
	}

	function resumeUploads(): void {
		if (!paused || disposed) return;
		paused = false;
		emitChange();
		processQueue();
	}

	function retryUpload(id: string): void {
		if (disposed) return;
		const target = files.find((file) => file.id === id);
		if (!target || target.status !== "error" || target.retryable === false || target.deleteRequested) return;
		target.status = "pending";
		target.error = undefined;
		target.progress = 0;
		target.retryable = undefined;
		target.pauseRequested = undefined;
		target.controller = undefined;
		emitChange();
		processQueue();
	}

	function retryAllUploads(): void {
		if (disposed) return;
		let changed = false;
		for (const file of files) {
			if (file.status !== "error" || file.retryable === false || file.deleteRequested) continue;
			file.status = "pending";
			file.error = undefined;
			file.progress = 0;
			file.retryable = undefined;
			file.pauseRequested = undefined;
			file.controller = undefined;
			changed = true;
		}
		if (!changed) return;
		emitChange();
		processQueue();
	}

	function isSelected(id: string): boolean {
		return selectedFileIds.includes(id);
	}

	function toggleSelected(id: string): void {
		if (isSelected(id)) {
			selectedFileIds = selectedFileIds.filter((selectedId) => selectedId !== id);
		} else {
			selectedFileIds = [...selectedFileIds, id];
		}
		emitChange();
	}

	function toggleSelectAll(): void {
		const selectableIds = files.filter(canSelectForDelete).map((file) => file.id);
		if (selectableIds.length === 0) return;
		const allSelected = selectableIds.every((id) => selectedFileIds.includes(id));
		selectedFileIds = allSelected ? [] : selectableIds;
		emitChange();
	}

	async function deleteR2File(r2Key: string): Promise<void> {
		await options.storage.delete({ r2Key, uploadSessionToken: await ensureUploadSession() });
	}

	async function deleteSelectedFiles(): Promise<void> {
		if (deletion) return deletion;
		deletion = deleteSelection();
		try { await deletion; } finally { deletion = undefined; }
	}

	async function deleteSelection(): Promise<void> {
		const selectedFiles = files.filter(
			(file) => selectedFileIds.includes(file.id) && canSelectForDelete(file),
		);
		if (selectedFiles.length === 0) return;

		deletingSelected = true;
		for (const file of selectedFiles) {
			file.deleting = true;
			file.deleteRequested = true;
			file.controller?.abort();
		}
		emitChange();

		try {
			for (const file of selectedFiles) {
				try {
					await inFlight.get(file.id);
					// Recover the same id after an ambiguous registration response
					// before deleting bytes that might already have a metadata row.
					if (file.registrationStarted && !file.imageId) file.imageId = await registerFile(file);
					if (file.r2Key) await deleteR2File(file.r2Key);
					if (file.imageId) await options.removeImage(file.imageId);
				} catch (error) {
					logger.warn("Failed to delete gallery file:", error);
					file.deleting = false;
					file.status = "error";
					file.retryable = false;
					file.error = error instanceof Error ? error.message : "Delete failed";
					continue;
				}
				files = files.filter((candidate) => candidate.id !== file.id);
				selectedFileIds = selectedFileIds.filter((id) => id !== file.id);
				batchTotalCount = Math.max(0, batchTotalCount - 1);
				batchTotalSizeBytes = Math.max(0, batchTotalSizeBytes - file.file.size);
				batchSourceFileCount = Math.max(0, batchSourceFileCount - 1);
				batchSourceSizeBytes = Math.max(0, batchSourceSizeBytes - file.file.size);
				if (file.intakeStatus === "rejected") {
					batchRejectedFileCount = Math.max(0, batchRejectedFileCount - 1);
					batchRejectedSizeBytes = Math.max(0, batchRejectedSizeBytes - file.file.size);
				} else {
					batchAcceptedFileCount = Math.max(0, batchAcceptedFileCount - 1);
					batchAcceptedSizeBytes = Math.max(0, batchAcceptedSizeBytes - file.file.size);
				}
			}
			emitChange();
			options.onupload?.();
			processQueue();
		} finally {
			deletingSelected = false;
			emitChange();
		}
	}

	function clearCompleted(): void {
		const visibleCompletedCount = files.filter((file) => file.status === "done" && !file.deleting).length;
		clearedCompletedCount += visibleCompletedCount;
		files = files.filter((file) => file.status !== "done" || file.deleting);
		selectedFileIds = selectedFileIds.filter((id) => files.some((file) => file.id === id));
		emitChange();
	}

	async function cancelPendingUploads(): Promise<void> {
		paused = true;
		for (const file of files) {
			if (file.status === "done") continue;
			file.deleteRequested = true;
			file.controller?.abort();
		}
		if (deletion) await deletion;
		selectedFileIds = files.filter((file) => file.status !== "done").map((file) => file.id);
		await deleteSelectedFiles();
		if (!disposed) paused = false;
		emitChange();
	}

	return {
		getSnapshot,
		subscribe(listener) {
			listeners.add(listener);
			listener(getSnapshot());
			return () => { listeners.delete(listener); };
		},
		addFiles,
		retryUpload,
		retryAllUploads,
		pauseUploads,
		resumeUploads,
		canSelectForDelete,
		isSelected,
		toggleSelected,
		toggleSelectAll,
		deleteSelectedFiles,
		clearCompleted,
		cancelPendingUploads,
		dispose() {
			if (!disposal) {
				disposed = true;
				listeners.clear();
				disposal = cancelPendingUploads();
			}
			return disposal;
		},
	};
}
