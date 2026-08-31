<script lang="ts">
import type { CatalogProductArtworkStatus } from "../../catalogProductArtworkUpload";

type QueueStatus = "pending" | CatalogProductArtworkStatus | "error";
type QueueItem = { id: string; file: File; status: QueueStatus; error: string };

let {
	multiple = false,
	maxFiles = 1,
	disabled = false,
	onUpload,
}: {
	multiple?: boolean;
	maxFiles?: number;
	disabled?: boolean;
	onUpload: (
		file: File,
		onStatus: (status: CatalogProductArtworkStatus) => void,
	) => Promise<void>;
} = $props();

let input: HTMLInputElement;
let items = $state<QueueItem[]>([]);
let active = $state(false);
let sequence = 0;
let limitNotice = $state("");

function update(id: string, change: Partial<Pick<QueueItem, "status" | "error">>) {
	items = items.map((item) => item.id === id ? { ...item, ...change } : item);
}

function enqueue(files: FileList | File[]) {
	if (disabled) return;
	const selected = [...files];
	const reserved = items.length;
	const capacity = Math.max(0, maxFiles - reserved);
	const accepted = selected.slice(0, Math.min(multiple ? selected.length : 1, capacity));
	limitNotice = accepted.length < selected.length
		? `Only ${accepted.length} ${accepted.length === 1 ? "image fits" : "images fit"} in this product.`
		: "";
	items = [
		...items,
		...accepted.map((file) => ({
			id: `catalog-artwork-${Date.now()}-${sequence += 1}`,
			file,
			status: "pending" as const,
			error: "",
		})),
	];
	if (input) input.value = "";
	processQueue();
}

function drop(event: DragEvent) {
	event.preventDefault();
	if (!disabled && event.dataTransfer?.files.length) enqueue(event.dataTransfer.files);
}

async function upload(item: QueueItem) {
	active = true;
	try {
		await onUpload(item.file, (status) => update(item.id, { status, error: "" }));
		items = items.filter((candidate) => candidate.id !== item.id);
	} catch (error) {
		update(item.id, {
			status: "error",
			error: error instanceof Error ? error.message : "The image could not be prepared.",
		});
	} finally {
		active = false;
		processQueue();
	}
}

function processQueue() {
	if (active) return;
	if (items.some((item) => item.status === "error")) return;
	const next = items.find((item) => item.status === "pending");
	if (next) void upload(next);
}

function retry(id: string) {
	if (disabled || active) return;
	update(id, { status: "pending", error: "" });
	processQueue();
}

function remove(id: string) {
	items = items.filter((item) => item.id !== id);
	processQueue();
}
</script>

<label class="uploader" class:disabled aria-label="Upload product artwork" ondragover={(event) => event.preventDefault()} ondrop={drop}>
	<strong>drop {multiple ? "images" : "an image"} here or click to upload</strong>
	<span>JPEG or PNG · 100 MB max</span>
	<input bind:this={input} type="file" accept="image/jpeg,image/png" {multiple} onchange={(event) => event.currentTarget.files && enqueue(event.currentTarget.files)} {disabled} />
</label>

{#if limitNotice}<p class="limit-notice" role="status">{limitNotice}</p>{/if}

{#if items.length > 0}
	<ul aria-label="Product artwork upload queue" aria-live="polite">
		{#each items as item (item.id)}
			<li>
				<div><strong>{item.file.name}</strong><span>{item.status === "pending" ? "waiting" : item.status}</span></div>
				{#if item.error}<p role="alert">{item.error}</p>{/if}
				{#if item.status === "error"}
					<button type="button" onclick={() => retry(item.id)} disabled={disabled || active}>retry</button>
					<button type="button" class="quiet" onclick={() => remove(item.id)}>remove</button>
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
	.uploader:focus-within, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.limit-notice { margin: -8px 0 18px; color: var(--admin-text-muted); font-size: .72rem; }
	ul { display: grid; gap: 1px; margin: 0 0 22px; padding: 1px; list-style: none; background: var(--admin-border); }
	li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 12px; background: var(--admin-surface); }
	li div { min-width: 0; }
	li strong, li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	li span { display: block; margin-top: 4px; color: var(--admin-text-subtle); font-size: .68rem; }
	li p { grid-column: 1 / -1; margin: 0; color: var(--status-rose); font-size: .72rem; }
	button { min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .4; cursor: default; }
	button.quiet { border-color: transparent; color: var(--admin-text-muted); }
</style>
