import {
	GALLERY_MAX_FILE_SIZE_LABEL,
	galleryFileContentType,
	isAllowedGalleryFile,
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
	controller?: AbortController;
}

export interface GalleryUploadSnapshot extends GalleryUploadBatchSummary {
	files: GalleryUploadFile[];
	selectedFileIds: string[];
	deletingSelected: boolean;
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
	addFiles(fileList: Iterable<File> | ArrayLike<File>): void;
	retryUpload(id: string): void;
	retryAllUploads(): void;
	canSelectForDelete(file: GalleryUploadFile): boolean;
	isSelected(id: string): boolean;
	toggleSelected(id: string): void;
	toggleSelectAll(): void;
	deleteSelectedFiles(): Promise<void>;
	clearCompleted(): void;
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
		options.onchange?.(getSnapshot());
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
			if (!isAllowedGalleryFile(file)) {
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
						: `File is over ${GALLERY_MAX_FILE_SIZE_LABEL}`,
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

	async function uploadOne(next: GalleryUploadFile): Promise<void> {
		next.status = "uploading";
		next.controller = new AbortController();
		emitChange();

		try {
			const contentType = galleryFileContentType(next.file);
			const signal = next.controller.signal;
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
			throwIfCanceled(signal);

			next.status = "processing";
			next.progress = 70;
			emitChange();

			await options.storage.process({ r2Key, uploadSessionToken, signal });
			throwIfCanceled(signal);

			const dims = await options.getImageDimensions(next.file);
			throwIfCanceled(signal);

			const imageId = await options.addImage({
				siteUrl: options.siteUrl,
				galleryId: getGalleryId(),
				r2Key,
				filename: next.file.name,
				sizeBytes: next.file.size,
				width: dims.width,
				height: dims.height,
			});

			next.imageId = imageId;
			if (signal.aborted) {
				try {
					await options.removeImage(next.imageId);
					next.imageId = undefined;
				} catch (cleanupErr) {
					logger.warn("Failed to clean up canceled gallery image:", next.imageId, cleanupErr);
				}
				throw new Error("Request canceled");
			}

			next.status = "done";
			next.progress = 100;
			emitChange();
			options.onupload?.();
		} catch (err) {
			next.status = "error";
			const message = err instanceof Error ? err.message : "Upload failed";
			next.error = message === "Request canceled" ? "Canceled" : message;
			next.retryable = message === "Request canceled" ? false : next.retryable;
			emitChange();
		} finally {
			next.controller = undefined;
		}
	}

	function processQueue(): void {
		while (true) {
			const uploading = files.filter(
				(file) => file.status === "uploading" || file.status === "processing",
			).length;
			if (uploading >= maxConcurrent) return;

			const next = files.find((file) => file.status === "pending" && !file.deleting);
			if (!next) return;

			next.status = "uploading";
			emitChange();
			uploadOne(next).then(processQueue);
		}
	}

	function retryUpload(id: string): void {
		const target = files.find((file) => file.id === id);
		if (!target || target.status !== "error" || target.retryable === false) return;
		target.status = "pending";
		target.error = undefined;
		target.progress = 0;
		target.retryable = undefined;
		target.controller = undefined;
		emitChange();
		processQueue();
	}

	function retryAllUploads(): void {
		let changed = false;
		for (const file of files) {
			if (file.status !== "error" || file.retryable === false) continue;
			file.status = "pending";
			file.error = undefined;
			file.progress = 0;
			file.retryable = undefined;
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
		try {
			await options.storage.delete({ r2Key, uploadSessionToken: uploadSession?.token });
		} catch (err) {
			logger.warn("Failed to delete R2 image:", r2Key, err);
		}
	}

	async function deleteSelectedFiles(): Promise<void> {
		if (deletingSelected) return;
		const selectedFiles = files.filter(
			(file) => selectedFileIds.includes(file.id) && canSelectForDelete(file),
		);
		if (selectedFiles.length === 0) return;

		deletingSelected = true;
		const selectedIds = new Set(selectedFiles.map((file) => file.id));
		for (const file of selectedFiles) {
			file.deleting = true;
			file.controller?.abort();
		}
		emitChange();

		try {
			for (const file of selectedFiles) {
				if (file.imageId) {
					await options.removeImage(file.imageId);
				}
				if (file.r2Key) {
					await deleteR2File(file.r2Key);
				}
			}

			files = files.filter((file) => !selectedIds.has(file.id));
			batchTotalCount = Math.max(0, batchTotalCount - selectedFiles.length);
			batchTotalSizeBytes = Math.max(
				0,
				batchTotalSizeBytes - selectedFiles.reduce((sum, file) => sum + file.file.size, 0),
			);
			for (const file of selectedFiles) {
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
			selectedFileIds = selectedFileIds.filter((id) => !selectedIds.has(id));
			emitChange();
			options.onupload?.();
			processQueue();
		} catch (err) {
			for (const file of selectedFiles) {
				file.deleting = false;
				file.status = "error";
				file.error = err instanceof Error ? err.message : "Delete failed";
			}
			emitChange();
		} finally {
			deletingSelected = false;
			emitChange();
		}
	}

	function clearCompleted(): void {
		const visibleCompletedCount = files.filter((file) => file.status === "done").length;
		clearedCompletedCount += visibleCompletedCount;
		files = files.filter((file) => file.status !== "done");
		selectedFileIds = selectedFileIds.filter((id) => files.some((file) => file.id === id));
		emitChange();
	}

	return {
		getSnapshot,
		addFiles,
		retryUpload,
		retryAllUploads,
		canSelectForDelete,
		isSelected,
		toggleSelected,
		toggleSelectAll,
		deleteSelectedFiles,
		clearCompleted,
	};
}
