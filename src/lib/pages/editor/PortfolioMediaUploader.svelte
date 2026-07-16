<script lang="ts">
import { uploadCmsMediaFile, type CmsMediaUploadStatus } from "../../cmsMediaUpload";
import type { PortfolioMediaAsset } from "../../portfolioEditor";

interface UploadItem {
	id: string;
	file: File;
	status: CmsMediaUploadStatus;
	error: string;
}

let {
	endpoint,
	onReady,
}: {
	endpoint: string;
	onReady: (asset: PortfolioMediaAsset) => void;
} = $props();

let input: HTMLInputElement;
let items = $state<UploadItem[]>([]);
let active = 0;
let sequence = 0;

function itemId() {
	sequence += 1;
	return `cms-upload-${Date.now()}-${sequence}`;
}

function update(id: string, change: Partial<Pick<UploadItem, "status" | "error">>) {
	items = items.map((item) => item.id === id ? { ...item, ...change } : item);
}

function enqueue(files: FileList | File[]) {
	const next = [...files].map((file) => ({
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
	if (event.dataTransfer?.files.length) enqueue(event.dataTransfer.files);
}

async function upload(item: UploadItem) {
	active += 1;
	try {
		const asset = await uploadCmsMediaFile(item.file, {
			endpoint,
			onStatus: (status) => update(item.id, { status, error: "" }),
		});
		onReady(asset);
		update(item.id, { status: "done", error: "" });
	} catch (error) {
		update(item.id, {
			status: "error",
			error: error instanceof Error ? error.message : "The upload failed.",
		});
	} finally {
		active -= 1;
		processQueue();
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
	update(id, { status: "pending", error: "" });
	processQueue();
}

function remove(id: string) {
	items = items.filter((item) => item.id !== id);
}

function statusLabel(status: CmsMediaUploadStatus) {
	if (status === "authorizing") return "preparing";
	if (status === "processing") return "scaling for the site";
	if (status === "done") return "added to this gallery";
	return status;
}
</script>

<div class="uploader" role="group" aria-label="Upload new gallery images" ondragover={(event) => event.preventDefault()} ondrop={handleDrop}>
	<div>
		<strong>upload new images</strong>
		<p>Drop images here or choose them from this device. JPEG, PNG, or WebP up to 20 MB. Originals are privately normalized and the site receives responsive WebP copies.</p>
	</div>
	<label class="upload-button">
		<span>choose images</span>
		<input bind:this={input} type="file" accept="image/jpeg,image/png,image/webp" multiple onchange={(event) => event.currentTarget.files && enqueue(event.currentTarget.files)} />
	</label>
</div>

{#if items.length > 0}
	<ul aria-label="Image upload queue" aria-live="polite">
		{#each items as item (item.id)}
			<li>
				<div><strong>{item.file.name}</strong><span>{statusLabel(item.status)}</span></div>
				{#if item.error}<p role="alert">{item.error}</p>{/if}
				{#if item.status === "error"}
					<button type="button" onclick={() => retry(item.id)}>retry</button>
					<button type="button" class="quiet" onclick={() => remove(item.id)}>remove</button>
				{:else if item.status === "done"}
					<button type="button" class="quiet" onclick={() => remove(item.id)}>dismiss</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.uploader { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 18px; padding: 16px; border: 1px dashed var(--admin-border-strong); border-radius: 8px; background: var(--admin-bg); }
	.uploader strong, li strong { display: block; color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.uploader p { max-width: 650px; margin: 5px 0 0; color: var(--admin-text-muted); font-size: .74rem; line-height: 1.45; }
	.upload-button, button { min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; white-space: nowrap; }
	.upload-button { display: inline-flex; align-items: center; }
	.upload-button input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
	.upload-button:focus-within, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	ul { display: grid; gap: 1px; margin: 0 0 22px; padding: 1px; list-style: none; background: var(--admin-border); }
	li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 12px; background: var(--admin-surface); }
	li div { min-width: 0; }
	li strong, li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	li span { display: block; margin-top: 4px; color: var(--admin-text-subtle); font-size: .68rem; }
	li p { grid-column: 1 / -1; margin: 0; color: var(--status-rose); font-size: .72rem; }
	.quiet { color: var(--admin-text-muted); }
	@media (max-width: 700px) {
		.uploader { align-items: stretch; flex-direction: column; }
		.upload-button, button { min-height: 44px; justify-content: center; }
		li { grid-template-columns: minmax(0, 1fr) auto; }
	}
</style>
