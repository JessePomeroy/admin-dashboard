<script lang="ts">
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import FeatureGate from "../../components/FeatureGate.svelte";
import { logger } from "../../logger";
import type { TenantAdminServerSession } from "../../adminSession";
import { GALLERY_UPLOAD_ACCEPT } from "../../galleryUploadPolicy";
import { createGalleryStoragePort } from "./galleryStoragePort";
import {
	createGalleryUploadController,
	type GalleryUploadBatchSummary,
	type GalleryUploadSnapshot,
} from "./galleryUploadController";

let { galleryId, adminSession, onupload, onbatchchange = () => {} }: {
	galleryId: string;
	adminSession: TenantAdminServerSession;
	onupload: () => void;
	onbatchchange?: (summary: GalleryUploadBatchSummary) => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();
const storage = createGalleryStoragePort({
	fetch,
	galleryWorkerUrl: config.galleryWorkerUrl,
});

let dragging = $state(false);
let uploadState = $state<GalleryUploadSnapshot>({
	files: [],
	selectedFileIds: [],
	deletingSelected: false,
	visibleCompletedCount: 0,
	totalCount: 0,
	completedCount: 0,
	totalSizeBytes: 0,
	hasErrors: false,
	sourceFileCount: 0,
	sourceSizeBytes: 0,
	acceptedFileCount: 0,
	acceptedSizeBytes: 0,
	rejectedFileCount: 0,
	rejectedSizeBytes: 0,
	retryableErrorCount: 0,
	selectableCount: 0,
	selectedCount: 0,
	allSelectableSelected: false,
});

const uploadController = createGalleryUploadController({
	storage,
	siteUrl: config.siteUrl,
	galleryId: () => galleryId,
	addImage: async (input) => {
		const imageId = await client.mutation(galleryApi.addImage, {
			siteUrl: input.siteUrl,
			galleryId: toId(input.galleryId),
			r2Key: input.r2Key,
			filename: input.filename,
			sizeBytes: input.sizeBytes,
			width: input.width,
			height: input.height,
		});
		return imageId as string;
	},
	removeImage: async (id) => {
		await client.mutation(galleryApi.removeImage, { id: toId(id) });
	},
	getImageDimensions,
	onupload: () => onupload(),
	onchange: (snapshot) => {
		uploadState = snapshot;
	},
	logger,
});
uploadState = uploadController.getSnapshot();

interface DroppedFileSystemEntry {
	isFile: boolean;
	isDirectory: boolean;
	file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
	createReader?: () => {
		readEntries: (
			success: (entries: DroppedFileSystemEntry[]) => void,
			error?: (error: DOMException) => void,
		) => void;
	};
}

interface DroppedDataTransferItem {
	webkitGetAsEntry?: () => DroppedFileSystemEntry | null;
}

function readDroppedFile(entry: DroppedFileSystemEntry): Promise<File> {
	return new Promise((resolve, reject) => {
		if (!entry.file) {
			reject(new Error("Dropped file entry is missing a file reader"));
			return;
		}
		entry.file(resolve, reject);
	});
}

function readDirectoryEntries(entry: DroppedFileSystemEntry): Promise<DroppedFileSystemEntry[]> {
	if (!entry.createReader) return Promise.resolve([]);
	const reader = entry.createReader();
	if (!reader) return Promise.resolve([]);
	const entries: DroppedFileSystemEntry[] = [];

	return new Promise((resolve, reject) => {
		function readBatch() {
			reader.readEntries((batch) => {
				if (batch.length === 0) {
					resolve(entries);
					return;
				}
				entries.push(...batch);
				readBatch();
			}, reject);
		}
		readBatch();
	});
}

async function collectDroppedEntryFiles(entry: DroppedFileSystemEntry): Promise<File[]> {
	if (entry.isFile) return [await readDroppedFile(entry)];
	if (!entry.isDirectory) return [];

	const entries = await readDirectoryEntries(entry);
	const nested = await Promise.all(entries.map((child) => collectDroppedEntryFiles(child)));
	return nested.flat();
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
	const items = Array.from(dataTransfer.items ?? []) as DroppedDataTransferItem[];
	const entries = items
		.map((item) => item.webkitGetAsEntry?.())
		.filter((entry): entry is DroppedFileSystemEntry => !!entry);

	if (entries.length === 0) return Array.from(dataTransfer.files ?? []);

	try {
		const nested = await Promise.all(entries.map((entry) => collectDroppedEntryFiles(entry)));
		const files = nested.flat();
		return files.length > 0 ? files : Array.from(dataTransfer.files ?? []);
	} catch (err) {
		logger.warn("Failed to traverse dropped gallery folder:", err);
		return Array.from(dataTransfer.files ?? []);
	}
}

async function handleDrop(e: DragEvent) {
	e.preventDefault();
	dragging = false;
	if (!e.dataTransfer) return;
	uploadController.addFiles(await collectDroppedFiles(e.dataTransfer));
}

function handleFileInput(e: Event) {
	const input = e.target as HTMLInputElement;
	if (input.files) uploadController.addFiles(input.files);
	input.value = "";
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

let files = $derived(uploadState.files);
let completedCount = $derived(uploadState.completedCount);
let totalCount = $derived(uploadState.totalCount);
let totalSizeBytes = $derived(uploadState.totalSizeBytes);
let hasErrors = $derived(uploadState.hasErrors);
let sourceFileCount = $derived(uploadState.sourceFileCount);
let sourceSizeBytes = $derived(uploadState.sourceSizeBytes);
let acceptedFileCount = $derived(uploadState.acceptedFileCount);
let acceptedSizeBytes = $derived(uploadState.acceptedSizeBytes);
let rejectedFileCount = $derived(uploadState.rejectedFileCount);
let rejectedSizeBytes = $derived(uploadState.rejectedSizeBytes);
let retryableErrorCount = $derived(uploadState.retryableErrorCount);
let selectableCount = $derived(uploadState.selectableCount);
let selectedCount = $derived(uploadState.selectedCount);
let allSelectableSelected = $derived(uploadState.allSelectableSelected);

$effect(() => {
	onbatchchange({
		totalCount,
		completedCount,
		totalSizeBytes,
		hasErrors,
		sourceFileCount,
		sourceSizeBytes,
		acceptedFileCount,
		acceptedSizeBytes,
		rejectedFileCount,
		rejectedSizeBytes,
	});
});

function formatFileSize(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} gb`;
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} mb`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kb`;
	return `${bytes} b`;
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
			<p class="drop-text">drag photos and videos here</p>
			<p class="drop-hint">or</p>
			<label class="browse-btn">
				browse files
				<input type="file" multiple accept={GALLERY_UPLOAD_ACCEPT} onchange={handleFileInput} hidden />
			</label>
			<p class="drop-limits">photos, raw files, mov, mp4, webm</p>
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
							onclick={() => uploadController.deleteSelectedFiles()}
							disabled={selectedCount === 0 || uploadState.deletingSelected}
							tabindex={selectedCount > 0 ? 0 : -1}
							aria-hidden={selectedCount === 0}
						>
							{uploadState.deletingSelected ? "deleting..." : `delete selected (${selectedCount})`}
						</button>
					</span>
					<label class="add-more-btn">
						+ add more
						<input type="file" multiple accept={GALLERY_UPLOAD_ACCEPT} onchange={handleFileInput} hidden />
					</label>
					{#if retryableErrorCount > 0}
						<button class="retry-all-btn" onclick={() => uploadController.retryAllUploads()}>
							retry all ({retryableErrorCount})
						</button>
					{/if}
					{#if selectableCount > 0}
						<label class="select-all-control">
							<input
								type="checkbox"
								checked={allSelectableSelected}
								onchange={() => uploadController.toggleSelectAll()}
							/>
							select all
						</label>
					{/if}
					{#if completedCount > 0}
						<button class="clear-btn" onclick={() => uploadController.clearCompleted()}>clear done</button>
					{/if}
				</div>
			</div>
			<div class="upload-summary" aria-label="upload batch summary">
				<span>selected {sourceFileCount} file{sourceFileCount !== 1 ? "s" : ""} — {formatFileSize(sourceSizeBytes)}</span>
				<span>uploadable {acceptedFileCount} — {formatFileSize(acceptedSizeBytes)}</span>
				{#if rejectedFileCount > 0}
					<span class="error-text">skipped {rejectedFileCount} — {formatFileSize(rejectedSizeBytes)}</span>
				{/if}
			</div>

			{#each files as f (f.id)}
				<div class="upload-item" class:done={f.status === "done"} class:error={f.status === "error"}>
					<input
						class="delete-checkbox"
						type="checkbox"
						aria-label={`select ${f.file.name} for deletion`}
						checked={uploadController.isSelected(f.id)}
						disabled={!uploadController.canSelectForDelete(f)}
						onchange={() => uploadController.toggleSelected(f.id)}
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
							<button class="retry-btn" onclick={() => uploadController.retryUpload(f.id)}>retry</button>
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

	.upload-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		margin: -4px 0 10px;
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
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
