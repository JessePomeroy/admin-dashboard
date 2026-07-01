<script lang="ts">
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import FeatureGate from "../../components/FeatureGate.svelte";
import { logger } from "../../logger";
import type { TenantAdminServerSession } from "../../adminSession";
import {
	GALLERY_MAX_FILE_SIZE_BYTES,
	GALLERY_MAX_FILE_SIZE_LABEL,
	GALLERY_UPLOAD_ACCEPT,
	galleryFileContentType,
	isAllowedGalleryFile,
} from "../../galleryUploadPolicy";
import { createGalleryStoragePort, type GalleryUploadSession } from "./galleryStoragePort";

let { galleryId, adminSession, onupload, onbatchchange = () => {} }: {
	galleryId: string;
	adminSession: TenantAdminServerSession;
	onupload: () => void;
	onbatchchange?: (summary: UploadBatchSummary) => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();
const storage = createGalleryStoragePort({
	fetch,
	galleryWorkerUrl: config.galleryWorkerUrl,
});

const MAX_CONCURRENT = 3;
const UPLOAD_SESSION_REFRESH_BUFFER_MS = 60_000;

interface UploadBatchSummary {
	totalCount: number;
	completedCount: number;
	totalSizeBytes: number;
	hasErrors: boolean;
}

interface UploadFile {
	file: File;
	id: string;
	status: "pending" | "uploading" | "processing" | "done" | "error";
	progress: number;
	error?: string;
	retryable?: boolean;
	r2Key?: string;
	imageId?: string;
	deleting?: boolean;
	controller?: AbortController;
}

let files = $state<UploadFile[]>([]);
let dragging = $state(false);
let selectedFileIds = $state<string[]>([]);
let deletingSelected = $state(false);
let uploadSession = $state<GalleryUploadSession | null>(null);
let uploadSessionPromise: Promise<GalleryUploadSession> | null = null;
let batchTotalCount = $state(0);
let batchTotalSizeBytes = $state(0);
let clearedCompletedCount = $state(0);

function throwIfCanceled(signal: AbortSignal): void {
	if (signal.aborted) throw new Error("Request canceled");
}

async function ensureUploadSession(): Promise<string> {
	if (uploadSession && uploadSession.expiresAt - UPLOAD_SESSION_REFRESH_BUFFER_MS > Date.now()) {
		return uploadSession.token;
	}

	if (!uploadSessionPromise) {
		uploadSessionPromise = storage.startUploadSession({
			siteUrl: config.siteUrl,
			galleryId,
		}).finally(() => {
			uploadSessionPromise = null;
		});
	}

	uploadSession = await uploadSessionPromise;
	return uploadSession.token;
}

function addFiles(fileList: FileList | File[]) {
	if (files.length === 0) {
		batchTotalCount = 0;
		batchTotalSizeBytes = 0;
		clearedCompletedCount = 0;
	}

	const newFiles: UploadFile[] = [];
	for (const file of fileList) {
		if (!isAllowedGalleryFile(file)) {
			newFiles.push({
				file,
				id: crypto.randomUUID(),
				status: "error",
				progress: 0,
				error: "File type not allowed",
				retryable: false,
			});
			continue;
		}
		if (file.size > GALLERY_MAX_FILE_SIZE_BYTES) {
			newFiles.push({
				file,
				id: crypto.randomUUID(),
				status: "error",
				progress: 0,
				error: `File is over ${GALLERY_MAX_FILE_SIZE_LABEL}`,
				retryable: false,
			});
			continue;
		}
		newFiles.push({
			file,
			id: crypto.randomUUID(),
			status: "pending",
			progress: 0,
		});
	}
	batchTotalCount += newFiles.length;
	batchTotalSizeBytes += newFiles.reduce((sum, uploadFile) => sum + uploadFile.file.size, 0);
	files = [...files, ...newFiles];
	processQueue();
}

function handleDrop(e: DragEvent) {
	e.preventDefault();
	dragging = false;
	if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
}

function handleFileInput(e: Event) {
	const input = e.target as HTMLInputElement;
	if (input.files) addFiles(input.files);
	input.value = "";
}

/**
 * Upload a single file through the full presign → PUT → process → record flow.
 * Returns when the upload is complete (or errored). Concurrency is controlled
 * by `processQueue` which fans out up to MAX_CONCURRENT of these in parallel.
 */
async function uploadOne(next: UploadFile): Promise<void> {
	next.status = "uploading";
	next.controller = new AbortController();
	files = [...files];

	try {
		const contentType = galleryFileContentType(next.file);
		const signal = next.controller.signal;
		const uploadSessionToken = await ensureUploadSession();
		throwIfCanceled(signal);

		const { r2Key, uploadUrl } = await storage.presign({
			siteUrl: config.siteUrl,
			galleryId,
			filename: next.file.name,
			contentType,
			uploadSessionToken,
			signal,
		});
		throwIfCanceled(signal);
		next.r2Key = r2Key;
		files = [...files];

		// 2. Upload file directly to the Worker when it provides a tokenized URL.
		// Fall back to the SvelteKit proxy for older Worker deployments.
		next.progress = 30;
		files = [...files];

		await storage.uploadFile({
			file: next.file,
			r2Key,
			uploadUrl,
			contentType,
			uploadSessionToken,
			signal,
		});
		throwIfCanceled(signal);

		// 3. Process (generate sizes)
		next.status = "processing";
		next.progress = 70;
		files = [...files];

		await storage.process({ r2Key, uploadSessionToken, signal });
		throwIfCanceled(signal);

		// 4. Get image dimensions
		const dims = await getImageDimensions(next.file);
		throwIfCanceled(signal);

		// 5. Record in Convex
		const imageId = await client.mutation(galleryApi.addImage, {
			siteUrl: config.siteUrl,
			galleryId: toId(galleryId),
			r2Key,
			filename: next.file.name,
			sizeBytes: next.file.size,
			width: dims.width,
			height: dims.height,
		});

		next.imageId = imageId as string;
		if (signal.aborted) {
			try {
				await client.mutation(galleryApi.removeImage, { id: toId(next.imageId) });
				next.imageId = undefined;
			} catch (cleanupErr) {
				logger.warn("Failed to clean up canceled gallery image:", next.imageId, cleanupErr);
			}
			throw new Error("Request canceled");
		}
		next.status = "done";
		next.progress = 100;
		files = [...files];
		onupload();
	} catch (err) {
		next.status = "error";
		const message = err instanceof Error ? err.message : "Upload failed";
		next.error = message === "Request canceled" ? "Canceled" : message;
		next.retryable = message === "Request canceled" ? false : next.retryable;
		files = [...files];
	} finally {
		next.controller = undefined;
	}
}

/**
 * Start as many pending uploads as the concurrency limit allows. Each started
 * upload re-invokes processQueue on completion to pick up the next pending
 * item, so the queue drains fully while never exceeding MAX_CONCURRENT
 * in-flight requests.
 */
function processQueue(): void {
	while (true) {
		const uploading = files.filter(
			(f) => f.status === "uploading" || f.status === "processing",
		).length;
		if (uploading >= MAX_CONCURRENT) return;

		const next = files.find((f) => f.status === "pending" && !f.deleting);
		if (!next) return;

		// Mark as uploading synchronously so the next loop iteration sees the
		// updated in-flight count and doesn't pick the same file twice.
		next.status = "uploading";
		files = [...files];

		uploadOne(next).then(processQueue);
	}
}

/** Retry a single errored upload from the start of the pipeline. */
function retryUpload(id: string): void {
	const target = files.find((f) => f.id === id);
	if (!target || target.status !== "error" || target.retryable === false) return;
	target.status = "pending";
	target.error = undefined;
	target.progress = 0;
	target.retryable = undefined;
	target.controller = undefined;
	files = [...files];
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
	files = [...files];
	processQueue();
}

function canSelectForDelete(file: UploadFile): boolean {
	return !file.deleting;
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
}

function toggleSelectAll(): void {
	const selectableIds = files.filter(canSelectForDelete).map((file) => file.id);
	if (selectableIds.length === 0) return;
	const allSelected = selectableIds.every((id) => selectedFileIds.includes(id));
	selectedFileIds = allSelected ? [] : selectableIds;
}

async function deleteR2File(r2Key: string): Promise<void> {
	try {
		await storage.delete({ r2Key, uploadSessionToken: uploadSession?.token });
	} catch (err) {
		logger.warn("Failed to delete R2 image:", r2Key, err);
	}
}

async function deleteSelectedFiles(): Promise<void> {
	if (deletingSelected) return;
	const selectedFiles = files.filter((file) => selectedFileIds.includes(file.id) && canSelectForDelete(file));
	if (selectedFiles.length === 0) return;

	deletingSelected = true;
	const selectedIds = new Set(selectedFiles.map((file) => file.id));
	for (const file of selectedFiles) {
		file.deleting = true;
		file.controller?.abort();
	}
	files = [...files];

	try {
		for (const file of selectedFiles) {
			if (file.imageId) {
				await client.mutation(galleryApi.removeImage, { id: toId(file.imageId) });
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
		selectedFileIds = selectedFileIds.filter((id) => !selectedIds.has(id));
		onupload();
		processQueue();
	} catch (err) {
		for (const file of selectedFiles) {
			file.deleting = false;
			file.status = "error";
			file.error = err instanceof Error ? err.message : "Delete failed";
		}
		files = [...files];
	} finally {
		deletingSelected = false;
	}
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
			URL.revokeObjectURL(url);
		};
		img.onerror = () => {
			resolve({ width: 0, height: 0 });
			URL.revokeObjectURL(url);
		};
		img.src = url;
	});
}

let visibleCompletedCount = $derived(files.filter((f) => f.status === "done").length);
let completedCount = $derived(clearedCompletedCount + visibleCompletedCount);
let totalCount = $derived(batchTotalCount);
let totalSizeBytes = $derived(batchTotalSizeBytes);
let hasErrors = $derived(files.some((f) => f.status === "error"));
let retryableErrorCount = $derived(files.filter((f) => f.status === "error" && f.retryable !== false).length);
let selectableCount = $derived(files.filter(canSelectForDelete).length);
let selectedCount = $derived(selectedFileIds.filter((id) => files.some((f) => f.id === id && canSelectForDelete(f))).length);
let allSelectableSelected = $derived(selectableCount > 0 && selectedCount === selectableCount);

$effect(() => {
	onbatchchange({
		totalCount,
		completedCount,
		totalSizeBytes,
		hasErrors,
	});
});

function clearCompleted() {
	clearedCompletedCount += visibleCompletedCount;
	files = files.filter((f) => f.status !== "done");
	selectedFileIds = selectedFileIds.filter((id) => files.some((f) => f.id === id));
}

function formatFileSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024).toFixed(0)} KB`;
}
</script>

<FeatureGate feature="galleryDelivery" {adminSession}>
<div
	class="uploader"
	class:dragging
	role="region"
	aria-label="File upload area"
	ondragover={(e) => { e.preventDefault(); dragging = true; }}
	ondragleave={() => (dragging = false)}
	ondrop={handleDrop}
>
	{#if files.length === 0}
		<div class="drop-zone">
			<p class="drop-text">drag photos here</p>
			<p class="drop-hint">or</p>
			<label class="browse-btn">
				browse files
				<input type="file" multiple accept={GALLERY_UPLOAD_ACCEPT} onchange={handleFileInput} hidden />
			</label>
			<p class="drop-limits">jpg, png, webp, tiff, raw — max {GALLERY_MAX_FILE_SIZE_LABEL} per file</p>
		</div>
	{:else}
		<div class="upload-list" aria-live="polite">
			<div class="upload-header">
				<span class="upload-progress-text">
					{completedCount}/{totalCount} uploaded
					{#if hasErrors}
						<span class="error-text">— some failed</span>
					{/if}
				</span>
				<div class="upload-actions">
					<span class="delete-action-slot" class:active={selectedCount > 0}>
						<button
							class="delete-selected-btn"
							onclick={deleteSelectedFiles}
							disabled={selectedCount === 0 || deletingSelected}
							tabindex={selectedCount > 0 ? 0 : -1}
							aria-hidden={selectedCount === 0}
						>
							{deletingSelected ? "deleting..." : `delete selected (${selectedCount})`}
						</button>
					</span>
					<label class="add-more-btn">
						+ add more
						<input type="file" multiple accept={GALLERY_UPLOAD_ACCEPT} onchange={handleFileInput} hidden />
					</label>
					{#if retryableErrorCount > 0}
						<button class="retry-all-btn" onclick={retryAllUploads}>
							retry all ({retryableErrorCount})
						</button>
					{/if}
					{#if selectableCount > 0}
						<label class="select-all-control">
							<input
								type="checkbox"
								checked={allSelectableSelected}
								onchange={toggleSelectAll}
							/>
							select all
						</label>
					{/if}
					{#if completedCount > 0}
						<button class="clear-btn" onclick={clearCompleted}>clear done</button>
					{/if}
				</div>
			</div>

			{#each files as f (f.id)}
				<div class="upload-item" class:done={f.status === "done"} class:error={f.status === "error"}>
					<input
						class="delete-checkbox"
						type="checkbox"
						aria-label={`select ${f.file.name} for deletion`}
						checked={isSelected(f.id)}
						disabled={!canSelectForDelete(f)}
						onchange={() => toggleSelected(f.id)}
					/>
					<span class="file-name">{f.file.name}</span>
					<span class="file-size">{formatFileSize(f.file.size)}</span>
					{#if f.deleting}
						<span class="file-status">deleting...</span>
					{:else if f.status === "uploading" || f.status === "processing"}
						<div class="progress-bar">
							<div class="progress-fill" style="width: {f.progress}%"></div>
						</div>
						<span class="file-status">{f.status === "processing" ? "processing..." : "uploading..."}</span>
					{:else if f.status === "done"}
						<span class="file-status done-text">done</span>
					{:else if f.status === "error"}
						<span class="file-status error-text">{f.error}</span>
						{#if f.retryable !== false}
							<button class="retry-btn" onclick={() => retryUpload(f.id)}>retry</button>
						{/if}
					{:else}
						<span class="file-status">waiting...</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
</FeatureGate>

<style>
	.uploader {
		border: 2px dashed var(--admin-border);
		border-radius: 8px;
		transition: border-color 0.15s;
	}

	.uploader.dragging {
		border-color: var(--admin-accent);
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 48px 24px;
	}

	.drop-text {
		font-size: 0.95rem;
		color: var(--admin-text-muted);
		margin: 0;
	}

	.drop-hint {
		font-size: 0.78rem;
		color: var(--admin-text-subtle);
		margin: 0;
	}

	.browse-btn {
		padding: 7px 18px;
		border: 1px solid var(--admin-accent);
		border-radius: 6px;
		color: var(--admin-accent);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.browse-btn:hover {
		background: var(--admin-accent);
		color: var(--admin-bg);
	}

	.drop-limits {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		margin: 8px 0 0;
	}

	.upload-list {
		padding: 16px;
	}

	.upload-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.upload-progress-text {
		flex: 1 1 auto;
		min-width: 140px;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.upload-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex: 0 1 auto;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
	}

	.delete-action-slot {
		display: inline-flex;
		justify-content: flex-start;
		flex: 0 0 158px;
		width: 158px;
		visibility: hidden;
	}

	.delete-action-slot.active {
		visibility: visible;
	}

	.add-more-btn, .clear-btn, .delete-selected-btn, .retry-all-btn {
		padding: 4px 12px;
		border: 1px solid var(--admin-border);
		border-radius: 5px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.74rem;
		cursor: pointer;
	}

	.retry-all-btn {
		color: var(--admin-accent);
		border-color: color-mix(in srgb, var(--admin-accent) 50%, var(--admin-border));
	}

	.retry-all-btn:hover {
		background: color-mix(in srgb, var(--admin-accent) 12%, transparent);
		border-color: var(--admin-accent);
	}

	.select-all-control {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--admin-text-muted);
		font-size: 0.74rem;
		cursor: pointer;
	}

	.select-all-control input,
	.delete-checkbox {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: var(--admin-accent);
		cursor: pointer;
	}

	.delete-checkbox {
		flex-shrink: 0;
	}

	.delete-checkbox:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}

	.delete-selected-btn {
		color: var(--status-rose);
		border-color: color-mix(in srgb, var(--status-rose) 45%, var(--admin-border));
		white-space: nowrap;
	}

	.delete-selected-btn:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.delete-selected-btn:not(:disabled):hover {
		background: color-mix(in srgb, var(--status-rose) 16%, transparent);
		border-color: var(--status-rose);
		color: var(--status-rose);
	}

	@media (max-width: 640px) {
		.upload-header {
			align-items: stretch;
			flex-direction: column;
		}

		.upload-actions {
			justify-content: flex-start;
		}

		.delete-action-slot:not(.active) {
			display: none;
		}
	}

	.upload-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--admin-border);
		font-size: 0.8rem;
	}

	.upload-item.done { opacity: 0.5; }

	.file-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--admin-text);
	}

	.file-size {
		color: var(--admin-text-subtle);
		flex-shrink: 0;
		font-size: 0.74rem;
	}

	.progress-bar {
		width: 80px;
		height: 4px;
		background: var(--admin-border);
		border-radius: 2px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.progress-fill {
		height: 100%;
		background: var(--admin-accent);
		transition: width 0.3s;
	}

	.file-status {
		font-size: 0.74rem;
		color: var(--admin-text-subtle);
		flex-shrink: 0;
	}

	.done-text { color: var(--status-sage); }
	.error-text { color: var(--status-rose); }

	.retry-btn {
		padding: 3px 10px;
		border: 1px solid var(--admin-border);
		border-radius: 4px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.72rem;
		font-family: inherit;
		cursor: pointer;
		flex-shrink: 0;
	}

	.retry-btn:hover {
		color: var(--admin-heading);
		border-color: var(--admin-border-strong);
	}
</style>
