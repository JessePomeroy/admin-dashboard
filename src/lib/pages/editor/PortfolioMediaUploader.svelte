<script lang="ts">
import { onDestroy } from "svelte";
import { uploadCmsMediaFile, type CmsMediaUploadStatus } from "../../cmsMediaUpload";
import type { PortfolioMediaAsset } from "../../portfolioEditor";

type UploadItemStatus = CmsMediaUploadStatus | "library";

interface UploadItem {
	id: string;
	file: File;
	status: UploadItemStatus;
	error: string;
}

let {
	endpoint,
	onReady,
	contextLabel = "gallery",
	multiple = true,
	maxFiles,
	disabled = false,
}: {
	endpoint: string;
	onReady: (
		asset: PortfolioMediaAsset,
	) => boolean | void | Promise<boolean | void>;
	contextLabel?: string;
	multiple?: boolean;
	maxFiles?: number;
	disabled?: boolean;
} = $props();

let input: HTMLInputElement;
let items = $state<UploadItem[]>([]);
let active = 0;
let sequence = 0;
let limitNotice = $state("");
let destroyed = false;

onDestroy(() => {
	destroyed = true;
});

function itemId() {
	sequence += 1;
	return `cms-upload-${Date.now()}-${sequence}`;
}

function update(id: string, change: Partial<Pick<UploadItem, "status" | "error">>) {
	items = items.map((item) => item.id === id ? { ...item, ...change } : item);
}

function reservedUploadCount() {
	return items.filter((item) => [
		"pending",
		"authorizing",
		"uploading",
		"processing",
	].includes(item.status)).length;
}

function enqueue(files: FileList | File[]) {
	if (disabled) return;
	const selectedFiles = [...files];
	const remaining = maxFiles === undefined
		? selectedFiles.length
		: Math.max(0, maxFiles - reservedUploadCount());
	const maximum = Math.max(0, Math.min(
		multiple ? selectedFiles.length : 1,
		remaining,
	));
	const acceptedFiles = selectedFiles.slice(0, maximum);
	limitNotice = acceptedFiles.length < selectedFiles.length
		? `Only ${acceptedFiles.length} ${acceptedFiles.length === 1 ? "image fits" : "images fit"} in this section.`
		: "";
	const next = acceptedFiles.map((file) => ({
		id: itemId(),
		file,
		status: "pending" as const,
		error: "",
	}));
	items = [...items.filter((item) => item.status !== "done"), ...next];
	if (input) input.value = "";
	processQueue();
}

function handleDrop(event: DragEvent) {
	event.preventDefault();
	if (!disabled && event.dataTransfer?.files.length) enqueue(event.dataTransfer.files);
}

async function upload(item: UploadItem) {
	active += 1;
	try {
		const asset = await uploadCmsMediaFile(item.file, {
			endpoint,
			onStatus: (status) => {
				if (!destroyed) update(item.id, { status, error: "" });
			},
		});
		if (destroyed) return;
		const attached = await onReady(asset);
		if (destroyed) return;
		if (attached === false) {
			update(item.id, { status: "library", error: "" });
		} else {
			items = items.filter((candidate) => candidate.id !== item.id);
		}
	} catch (error) {
		if (destroyed) return;
		update(item.id, {
			status: "error",
			error: error instanceof Error ? error.message : "The upload failed.",
		});
	} finally {
		active -= 1;
		if (!destroyed) processQueue();
	}
}

function processQueue() {
	while (active < 2) {
		const next = items.find((item) => item.status === "pending");
		if (!next) return;
		update(next.id, { status: "authorizing", error: "" });
		void upload(next);
	}
}

function retry(id: string) {
	if (disabled) return;
	if (maxFiles !== undefined && reservedUploadCount() >= maxFiles) {
		limitNotice = "No additional images fit in this section yet.";
		return;
	}
	update(id, { status: "pending", error: "" });
	processQueue();
}

function remove(id: string) {
	items = items.filter((item) => item.id !== id);
}

function statusLabel(status: UploadItemStatus) {
	if (status === "authorizing") return "preparing";
	if (status === "processing") return "scaling for the site";
	if (status === "done") return `added to this ${contextLabel}`;
	if (status === "library") return "saved in the media library; not attached here";
	return status;
}
</script>

<label class="uploader" class:disabled aria-label={`Upload new ${contextLabel} images`} ondragover={(event) => event.preventDefault()} ondrop={handleDrop}>
	<strong>drop {multiple ? "images" : "an image"} here or click to upload</strong>
	<span>JPEG, PNG or WebP · 20 MB max</span>
	<input bind:this={input} type="file" accept="image/jpeg,image/png,image/webp" {multiple} onchange={(event) => event.currentTarget.files && enqueue(event.currentTarget.files)} {disabled} />
</label>

{#if limitNotice}<p class="limit-notice" role="status">{limitNotice}</p>{/if}

{#if items.length > 0}
	<ul aria-label="Image upload queue" aria-live="polite">
		{#each items as item (item.id)}
			<li>
				<div><strong>{item.file.name}</strong><span>{statusLabel(item.status)}</span></div>
				{#if item.error}<p role="alert">{item.error}</p>{/if}
				{#if item.status === "error"}
					<button type="button" onclick={() => retry(item.id)} {disabled}>retry</button>
					<button type="button" class="quiet" onclick={() => remove(item.id)}>remove</button>
				{:else if item.status === "done" || item.status === "library"}
					<button type="button" class="quiet" onclick={() => remove(item.id)}>dismiss</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.uploader { display: grid; place-items: center; gap: 7px; min-height: 112px; box-sizing: border-box; margin-bottom: 18px; padding: 18px; border: 1px dashed var(--admin-border-strong); border-radius: 8px; background: var(--admin-bg); text-align: center; cursor: pointer; }
	.uploader.disabled { opacity: .62; cursor: default; }
	.uploader strong, li strong { display: block; color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.uploader > span { color: var(--admin-text-muted); font-size: .7rem; }
	.uploader input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
	button { min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; white-space: nowrap; }
	.uploader:focus-within, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	ul { display: grid; gap: 1px; margin: 0 0 22px; padding: 1px; list-style: none; background: var(--admin-border); }
	li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 12px; background: var(--admin-surface); }
	li div { min-width: 0; }
	li strong, li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	li span { display: block; margin-top: 4px; color: var(--admin-text-subtle); font-size: .68rem; }
	li p { grid-column: 1 / -1; margin: 0; color: var(--status-rose); font-size: .72rem; }
	.quiet { color: var(--admin-text-muted); }
	.limit-notice { margin: -8px 0 18px; color: var(--admin-text-muted); font-size: .72rem; }
	@media (max-width: 700px) {
		button { min-height: 44px; justify-content: center; }
		li { grid-template-columns: minmax(0, 1fr) auto; }
	}
</style>
