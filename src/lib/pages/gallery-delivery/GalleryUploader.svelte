<script lang="ts">
import { useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import FeatureGate from "../../components/FeatureGate.svelte";
import type { Tier } from "../../features";

let { galleryId, tier, onupload }: {
	galleryId: string;
	tier: Tier;
	onupload: () => void;
} = $props();

const config = getAdminConfig();
const { api } = config;
const client = useConvexClient();

const MAX_CONCURRENT = 3;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff"];

interface UploadFile {
	file: File;
	id: string;
	status: "pending" | "uploading" | "processing" | "done" | "error";
	progress: number;
	error?: string;
}

let files = $state<UploadFile[]>([]);
let dragging = $state(false);

function addFiles(fileList: FileList | File[]) {
	const newFiles: UploadFile[] = [];
	for (const file of fileList) {
		if (!ALLOWED_TYPES.includes(file.type)) continue;
		if (file.size > MAX_FILE_SIZE) continue;
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

async function processQueue() {
	const uploading = files.filter((f) => f.status === "uploading" || f.status === "processing");
	if (uploading.length >= MAX_CONCURRENT) return;

	const next = files.find((f) => f.status === "pending");
	if (!next) return;

	next.status = "uploading";
	files = [...files];

	try {
		// 1. Get presign URL from our SvelteKit API (proxies to Worker)
		const presignRes = await fetch("/api/admin/galleries/presign", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				siteUrl: config.siteUrl,
				galleryId,
				filename: next.file.name,
				contentType: next.file.type,
			}),
		});
		if (!presignRes.ok) throw new Error("Failed to get upload URL");
		const { r2Key } = await presignRes.json();

		// 2. Upload file via our SvelteKit proxy
		next.progress = 30;
		files = [...files];

		const uploadRes = await fetch(`/api/admin/galleries/upload?key=${encodeURIComponent(r2Key)}`, {
			method: "PUT",
			headers: { "Content-Type": next.file.type },
			body: next.file,
		});
		if (!uploadRes.ok) throw new Error("Upload failed");

		// 3. Process (generate sizes)
		next.status = "processing";
		next.progress = 70;
		files = [...files];

		const processRes = await fetch("/api/admin/galleries/process", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ r2Key }),
		});
		if (!processRes.ok) throw new Error("Processing failed");

		// 4. Get image dimensions
		const dims = await getImageDimensions(next.file);

		// 5. Record in Convex
		await client.mutation(api.galleryDelivery.addImage, {
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
</script>

<FeatureGate feature="galleryDelivery" {tier}>
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
				<input type="file" multiple accept={ALLOWED_TYPES.join(",")} onchange={handleFileInput} hidden />
			</label>
			<p class="drop-limits">jpg, png, webp, tiff — max 50MB per file</p>
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
						<input type="file" multiple accept={ALLOWED_TYPES.join(",")} onchange={handleFileInput} hidden />
					</label>
					{#if completedCount > 0}
						<button class="clear-btn" onclick={clearCompleted}>clear done</button>
					{/if}
				</div>
			</div>

			{#each files as f (f.id)}
				<div class="upload-item" class:done={f.status === "done"} class:error={f.status === "error"}>
					<span class="file-name">{f.file.name}</span>
					<span class="file-size">{(f.file.size / 1024).toFixed(0)} KB</span>
					{#if f.status === "uploading" || f.status === "processing"}
						<div class="progress-bar">
							<div class="progress-fill" style="width: {f.progress}%"></div>
						</div>
						<span class="file-status">{f.status === "processing" ? "processing..." : "uploading..."}</span>
					{:else if f.status === "done"}
						<span class="file-status done-text">done</span>
					{:else if f.status === "error"}
						<span class="file-status error-text">{f.error}</span>
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
</style>
