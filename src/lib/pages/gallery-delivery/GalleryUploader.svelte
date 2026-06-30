<script lang="ts">
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import FeatureGate from "../../components/FeatureGate.svelte";
import type { TenantAdminServerSession } from "../../adminSession";
import {
	GALLERY_MAX_FILE_SIZE_BYTES,
	GALLERY_MAX_FILE_SIZE_LABEL,
	GALLERY_UPLOAD_ACCEPT,
	galleryFileContentType,
	isAllowedGalleryFile,
} from "../../galleryUploadPolicy";

let { galleryId, adminSession, onupload }: {
	galleryId: string;
	adminSession: TenantAdminServerSession;
	onupload: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const galleryApi = api.galleryDelivery!;
const client = useAdminClient();

const MAX_CONCURRENT = 3;
// Per-step timeout. Presign is fast; the PUT upload and process step can take
// a while for large images but should never hang indefinitely.
const PRESIGN_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const PROCESS_TIMEOUT_MS = 60_000;
const DIRECT_UPLOAD_FALLBACK_STATUSES = new Set([401, 403, 404]);

interface UploadFile {
	file: File;
	id: string;
	status: "pending" | "uploading" | "processing" | "done" | "error";
	progress: number;
	error?: string;
	retryable?: boolean;
}

let files = $state<UploadFile[]>([]);
let dragging = $state(false);

/**
 * Wrap a fetch with an AbortController so large uploads on flaky networks
 * don't hang forever. Throws a clear timeout error on expiry.
 */
async function fetchWithTimeout(
	input: RequestInfo | URL,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		return await fetch(input, { ...init, signal: ctrl.signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

async function uploadFileToStorage(
	file: File,
	r2Key: string,
	uploadUrl: string | undefined,
	contentType: string,
): Promise<Response> {
	const proxyEndpoint = `/api/admin/galleries/upload?key=${encodeURIComponent(r2Key)}`;
	const requestInit = {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: file,
	};

	if (uploadUrl && config.galleryWorkerUrl) {
		const directEndpoint = new URL(uploadUrl, config.galleryWorkerUrl).toString();
		const directRes = await fetchWithTimeout(
			directEndpoint,
			requestInit,
			UPLOAD_TIMEOUT_MS,
		);
		if (directRes.ok || !DIRECT_UPLOAD_FALLBACK_STATUSES.has(directRes.status)) {
			return directRes;
		}
	}

	return fetchWithTimeout(proxyEndpoint, requestInit, UPLOAD_TIMEOUT_MS);
}

function addFiles(fileList: FileList | File[]) {
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
	files = [...files];

	try {
		const contentType = galleryFileContentType(next.file);

		// 1. Get presign URL from our SvelteKit API (proxies to Worker)
		const presignRes = await fetchWithTimeout(
			"/api/admin/galleries/presign",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					siteUrl: config.siteUrl,
					galleryId,
					filename: next.file.name,
					contentType,
				}),
			},
			PRESIGN_TIMEOUT_MS,
		);
		if (!presignRes.ok) throw new Error("Failed to get upload URL");
		const { r2Key, uploadUrl } = await presignRes.json() as {
			r2Key: string;
			uploadUrl?: string;
		};

		// 2. Upload file directly to the Worker when it provides a tokenized URL.
		// Fall back to the SvelteKit proxy for older Worker deployments.
		next.progress = 30;
		files = [...files];

		const uploadRes = await uploadFileToStorage(next.file, r2Key, uploadUrl, contentType);
		if (!uploadRes.ok) throw new Error("Upload failed");

		// 3. Process (generate sizes)
		next.status = "processing";
		next.progress = 70;
		files = [...files];

		const processRes = await fetchWithTimeout(
			"/api/admin/galleries/process",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ r2Key }),
			},
			PROCESS_TIMEOUT_MS,
		);
		if (!processRes.ok) throw new Error("Processing failed");

		// 4. Get image dimensions
		const dims = await getImageDimensions(next.file);

		// 5. Record in Convex
		await client.mutation(galleryApi.addImage, {
			siteUrl: config.siteUrl,
			galleryId: toId(galleryId),
			r2Key,
			filename: next.file.name,
			sizeBytes: next.file.size,
			width: dims.width,
			height: dims.height,
		});

		next.status = "done";
		next.progress = 100;
		files = [...files];
		onupload();
	} catch (err) {
		next.status = "error";
		next.error = err instanceof Error ? err.message : "Upload failed";
		files = [...files];
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

		const next = files.find((f) => f.status === "pending");
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
	files = [...files];
	processQueue();
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

let completedCount = $derived(files.filter((f) => f.status === "done").length);
let totalCount = $derived(files.length);
let hasErrors = $derived(files.some((f) => f.status === "error"));

function clearCompleted() {
	files = files.filter((f) => f.status !== "done");
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
					<label class="add-more-btn">
						+ add more
						<input type="file" multiple accept={GALLERY_UPLOAD_ACCEPT} onchange={handleFileInput} hidden />
					</label>
					{#if completedCount > 0}
						<button class="clear-btn" onclick={clearCompleted}>clear done</button>
					{/if}
				</div>
			</div>

			{#each files as f (f.id)}
				<div class="upload-item" class:done={f.status === "done"} class:error={f.status === "error"}>
					<span class="file-name">{f.file.name}</span>
					<span class="file-size">{formatFileSize(f.file.size)}</span>
					{#if f.status === "uploading" || f.status === "processing"}
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
		margin-bottom: 12px;
	}

	.upload-progress-text {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.upload-actions {
		display: flex;
		gap: 8px;
	}

	.add-more-btn, .clear-btn {
		padding: 4px 12px;
		border: 1px solid var(--admin-border);
		border-radius: 5px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.74rem;
		cursor: pointer;
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
