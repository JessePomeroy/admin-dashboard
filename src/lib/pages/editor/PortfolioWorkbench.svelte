<script lang="ts">
import { useQuery } from "convex-svelte";
import { tick, type Snippet } from "svelte";
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import {
	portfolioGalleryLabel,
	portfolioGalleryStatus,
	slugifyPortfolioTitle,
	type PortfolioGalleryEditorSummary,
	validateNewPortfolioGallery,
} from "../../portfolioEditor";

let {
	selectedGalleryId,
	children,
}: {
	selectedGalleryId?: string;
	children: Snippet;
} = $props();

const config = getAdminConfig();
const portfolioApi = config.api.portfolioEditor;
const portfolioConfig = config.editor?.portfolio;
if (!portfolioApi || !portfolioConfig) {
	throw new Error("Portfolio editor is not configured for this host");
}

const client = useAdminClient();
const baseHref = portfolioConfig.baseHref ?? "/admin/editor/portfolio";
const publishingEnabled = Boolean(portfolioApi.publish);
const savePortfolioDraft = portfolioApi.saveDraft;
const reorderPortfolioGalleries = portfolioApi.reorder;
const galleriesQuery = useQuery(portfolioApi.listForEditor, { siteUrl: config.siteUrl });

let serverGalleries = $derived(
	galleriesQuery.data as PortfolioGalleryEditorSummary[] | undefined,
);
let galleries = $state<PortfolioGalleryEditorSummary[] | undefined>(undefined);
let pendingOrderJson = $state<string | null>(null);
let reorderState = $state<"idle" | "saving" | "error">("idle");
let reorderMessage = $state("");
let dragOrigin = $state<PortfolioGalleryEditorSummary[] | null>(null);
let dragItems = $state<DraggableGallery[] | null>(null);
let search = $state("");
let filter = $state<"all" | "draft" | "published" | "changed">("all");
let creating = $state(false);
let title = $state("");
let slug = $state("");
let slugWasEdited = $state(false);
let errors = $state<{ title?: string; slug?: string }>({});
let createState = $state<"idle" | "saving" | "error">("idle");
let createMessage = $state("");
let newGalleryButton = $state<HTMLButtonElement>();
let createDialog = $state<HTMLDivElement>();
let titleInput = $state<HTMLInputElement>();
let normalizedSearch = $derived(search.trim().toLocaleLowerCase());
let orderingDisabled = $derived(Boolean(normalizedSearch) || filter !== "all");
let filterOptions = $derived(publishingEnabled
	? (["all", "draft", "published", "changed"] as const)
	: (["all", "draft"] as const));
let visibleGalleries = $derived((galleries ?? []).filter((gallery) => {
	const status = publishingEnabled ? portfolioGalleryStatus(gallery) : "draft";
	if (filter === "published" && status !== "published") return false;
	if (filter === "changed" && status !== "draft changes") return false;
	if (filter === "draft" && !["draft", "unpublished"].includes(status)) return false;
	if (!normalizedSearch) return true;
	return `${portfolioGalleryLabel(gallery)} ${gallery.slug}`
		.toLocaleLowerCase()
		.includes(normalizedSearch);
}));
let baseDraggableGalleries = $derived(visibleGalleries.map((gallery) => ({
	...gallery,
	id: gallery.galleryId,
})));
let draggableGalleries = $derived(dragItems ?? baseDraggableGalleries);

$effect(() => {
	if (!serverGalleries) return;
	const serverOrderJson = JSON.stringify(serverGalleries.map(({ galleryId }) => galleryId));
	if (pendingOrderJson && pendingOrderJson !== serverOrderJson) return;
	galleries = serverGalleries;
	if (pendingOrderJson === serverOrderJson) pendingOrderJson = null;
});

function statusLabel(gallery: PortfolioGalleryEditorSummary) {
	return publishingEnabled ? portfolioGalleryStatus(gallery) : "draft";
}

function formatUpdatedAt(value: number) {
	return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}

function updateTitle(event: Event) {
	title = (event.currentTarget as HTMLInputElement).value;
	if (!slugWasEdited) slug = slugifyPortfolioTitle(title);
}

function updateSlug(event: Event) {
	slugWasEdited = true;
	slug = slugifyPortfolioTitle((event.currentTarget as HTMLInputElement).value);
}

function generateSlug() {
	slug = slugifyPortfolioTitle(title);
	slugWasEdited = false;
}

async function openCreate() {
	creating = true;
	await tick();
	titleInput?.focus();
}

async function closeCreate() {
	if (createState === "saving") return;
	creating = false;
	errors = {};
	createMessage = "";
	await tick();
	newGalleryButton?.focus();
}

function handleDialogKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		void closeCreate();
		return;
	}
	if (event.key !== "Tab") return;
	const focusable = Array.from(createDialog?.querySelectorAll<HTMLElement>(
		'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
	) ?? []);
	const first = focusable[0];
	const last = focusable.at(-1);
	if (!first || !last) return;
	if (!focusable.includes(document.activeElement as HTMLElement)) {
		event.preventDefault();
		(event.shiftKey ? last : first).focus();
		return;
	}
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

async function createGallery() {
	errors = validateNewPortfolioGallery(title, slug);
	if (errors.title || errors.slug) return;
	createDialog?.querySelector<HTMLButtonElement>(".close")?.focus();
	createState = "saving";
	createMessage = "";
	try {
		await client.mutation(savePortfolioDraft, {
			siteUrl: config.siteUrl,
			draft: { title: title.trim(), slug: slug.trim(), placements: [] },
		});
		createState = "idle";
		createMessage = publishingEnabled ? "Unpublished gallery created." : "Gallery draft created.";
		title = "";
		slug = "";
		slugWasEdited = false;
		errors = {};
	} catch (error) {
		createState = "error";
		createMessage = error instanceof Error ? error.message : "Could not create gallery.";
	}
}

type DraggableGallery = PortfolioGalleryEditorSummary & {
	id: string;
	isDndShadowItem?: boolean;
};

function summariesFromDrag(items: DraggableGallery[]) {
	return items.map(({ id: _id, isDndShadowItem: _shadow, ...gallery }) => gallery);
}

function handleGalleryConsider(event: CustomEvent<{ items: DraggableGallery[] }>) {
	if (!galleries || reorderState === "saving" || orderingDisabled) return;
	dragOrigin ??= [...galleries];
	dragItems = event.detail.items;
}

async function handleGalleryFinalize(event: CustomEvent<{ items: DraggableGallery[] }>) {
	if (!galleries || reorderState === "saving" || orderingDisabled) return;
	const previous = dragOrigin ?? [...galleries];
	const reordered = summariesFromDrag(event.detail.items);
	dragOrigin = null;
	dragItems = null;
	const galleryIds = reordered.map(({ galleryId }) => galleryId);
	if (galleryIds.join("\u0000") === previous.map(({ galleryId }) => galleryId).join("\u0000")) {
		galleries = reordered;
		return;
	}
	galleries = reordered;
	pendingOrderJson = JSON.stringify(galleryIds);
	reorderState = "saving";
	reorderMessage = "saving order…";
	try {
		await client.mutation(reorderPortfolioGalleries, { siteUrl: config.siteUrl, galleryIds });
		reorderState = "idle";
		reorderMessage = "order saved";
	} catch (error) {
		pendingOrderJson = null;
		galleries = previous;
		reorderState = "error";
		reorderMessage = error instanceof Error ? error.message : "Could not save gallery order.";
	}
}
</script>

<div class="portfolio-workbench" class:has-selection={Boolean(selectedGalleryId)} inert={creating}>
	<header class="workbench-heading editor-workbench-header">
		<div>
			<h1>portfolio</h1>
		</div>
		<div class="heading-meta">
			<span>{galleries?.length ?? 0} {(galleries?.length ?? 0) === 1 ? "gallery" : "galleries"}</span>
			{#if reorderMessage}<span class:error={reorderState === "error"} role={reorderState === "error" ? "alert" : "status"}>{reorderMessage}</span>{/if}
		</div>
	</header>

	<div class="workbench-grid">
		<aside class="collection-pane" aria-label="Portfolio galleries">
			<div class="collection-heading">
				<h2>galleries</h2>
				<button bind:this={newGalleryButton} type="button" class="new-gallery" onclick={() => void openCreate()}>new</button>
			</div>
			<p class="collection-note">{publishingEnabled
				? "The public site follows this deliberate order. Drag galleries to rearrange it."
				: "This deliberate order is saved with the private drafts. Drag galleries to rearrange it."}</p>

			<label class="search-field"><span>search galleries</span><input type="search" placeholder="Search title or URL" bind:value={search} /></label>
			<div class="filters" role="group" aria-label="Filter galleries">
				{#each filterOptions as option}
					<button type="button" class:active={filter === option} aria-pressed={filter === option} onclick={() => filter = option as typeof filter}>{option}</button>
				{/each}
			</div>
			{#if orderingDisabled}<p class="ordering-note">Clear search and choose all to change {publishingEnabled ? "public" : "saved"} order.</p>{/if}

			{#if galleriesQuery.isLoading}
				<p class="collection-message" role="status">loading galleries…</p>
			{:else if galleriesQuery.error}
				<p class="collection-message error" role="alert">Could not load galleries.</p>
			{:else if visibleGalleries.length === 0}
				<p class="collection-message">{(galleries?.length ?? 0) === 0 ? "No galleries yet." : "No galleries match this view."}</p>
			{:else}
				<ol
					class="gallery-list"
					use:dragHandleZone={{
						items: draggableGalleries,
						dragDisabled: orderingDisabled || reorderState === "saving",
						flipDurationMs: 140,
						type: "portfolio-galleries",
					}}
					onconsider={handleGalleryConsider}
					onfinalize={handleGalleryFinalize}
				>
					{#each draggableGalleries as gallery (gallery.id)}
						<li class:selected={selectedGalleryId === gallery.galleryId}>
							<a href={`${baseHref}/${gallery.galleryId}`} aria-current={selectedGalleryId === gallery.galleryId ? "page" : undefined}>
								<strong>{portfolioGalleryLabel(gallery)}</strong>
								<span>/{gallery.slug} · {gallery.draft?.placementCount ?? gallery.published?.placementCount ?? 0} images</span>
								<small class="status">{statusLabel(gallery)} · {formatUpdatedAt(gallery.updatedAt)}</small>
							</a>
							<button
								type="button"
								class="drag-handle"
								use:dragHandle
								disabled={orderingDisabled || reorderState === "saving"}
								aria-label={`Drag ${portfolioGalleryLabel(gallery)} to reorder`}
							>
								<span aria-hidden="true"></span>
							</button>
						</li>
					{/each}
				</ol>
			{/if}
		</aside>

		<section class="document-pane" aria-label="Portfolio gallery">
			{@render children()}
		</section>
	</div>

</div>

{#if creating}
	<div class="create-backdrop" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) void closeCreate(); }}>
		<div bind:this={createDialog} class="create-panel" role="dialog" aria-modal="true" aria-labelledby="create-gallery-heading" tabindex="-1" onkeydown={handleDialogKeydown}>
			<div class="create-heading"><h2 id="create-gallery-heading">new gallery</h2><button type="button" class="close" onclick={() => void closeCreate()} aria-label="Close new gallery form">×</button></div>
			<p>{publishingEnabled ? "Create an unpublished gallery, then add details and images before publishing." : "Create and arrange a private gallery draft."}</p>
			<form onsubmit={(event) => { event.preventDefault(); void createGallery(); }}>
				<label>gallery name<input bind:this={titleInput} value={title} oninput={updateTitle} maxlength="120" autocomplete="off" aria-invalid={Boolean(errors.title)} />{#if errors.title}<small class="field-error">{errors.title}</small>{/if}</label>
				<div class="create-field">
					<div class="field-heading">
						<label for="new-gallery-slug">{publishingEnabled ? "public URL" : "URL name"}</label>
						<button type="button" class="generate-url" onclick={generateSlug} disabled={!title.trim() || createState === "saving"}>generate url</button>
					</div>
					<div class="slug-field"><span>/</span><input id="new-gallery-slug" value={slug} oninput={updateSlug} maxlength="80" autocomplete="off" spellcheck="false" aria-invalid={Boolean(errors.slug)} /></div>
					{#if errors.slug}<small class="field-error">{errors.slug}</small>{/if}
				</div>
				<button type="submit" class="primary" disabled={createState === "saving"}>{createState === "saving" ? "creating…" : publishingEnabled ? "create unpublished gallery" : "create gallery draft"}</button>
			</form>
			{#if createMessage}<p class:error={createState === "error"} class="create-message" role={createState === "error" ? "alert" : "status"}>{createMessage}</p>{/if}
		</div>
	</div>
{/if}

<style>
	.portfolio-workbench { min-height: 100%; background: var(--admin-bg); color: var(--admin-text); }
	.workbench-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding: 13px 20px 12px; border-bottom: 1px solid var(--admin-border); background: var(--editor-canvas); }
	h1, h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-weight: 500; }
	h1 { font-size: clamp(1.18rem, 1.7vw, 1.48rem); } h2 { font-size: 1rem; }
	.heading-meta { display: grid; justify-items: end; gap: 5px; color: var(--admin-text-subtle); font-size: .7rem; }
	.heading-meta .error, .collection-message.error, .create-message.error, .field-error { color: var(--status-rose); }
	.workbench-grid { display: grid; grid-template-columns: minmax(228px, 252px) minmax(520px, 1fr); min-height: calc(100vh - var(--editor-header-height, 64px)); }
	.collection-pane { min-width: 0; padding: 18px 14px 32px; border-right: 1px solid var(--admin-border); background: var(--editor-collection); }
	.collection-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
	.collection-note { margin: -6px 0 13px; color: var(--admin-text-muted); font-size: .66rem; line-height: 1.4; }
	button, input { font: inherit; }
	.new-gallery, .primary { border: 1px solid transparent; border-radius: 6px; padding: 8px 11px; background: var(--admin-accent-strong); color: var(--admin-bg); font-size: .72rem; cursor: pointer; }
	.search-field, .create-panel label, .create-field { display: grid; gap: 7px; color: var(--admin-text-muted); font-size: .7rem; }
	.search-field input, .create-panel input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 3px; padding: 8px 9px; background: var(--editor-control); color: var(--admin-heading); text-transform: none; }
	.field-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; }
	.generate-url { border: 0; padding: 4px 0; background: transparent; color: var(--admin-accent-strong); font: inherit; font-size: .68rem; cursor: pointer; text-underline-offset: 3px; }
	.generate-url:hover:not(:disabled) { text-decoration: underline; }
	.generate-url:active:not(:disabled) { transform: translateY(1px); }
	.generate-url:disabled { color: var(--admin-text-subtle); cursor: default; }
	.filters { display: flex; gap: 4px; margin: 9px 0 13px; overflow-x: auto; }
	.filters button { border: 0; border-radius: 3px; padding: 5px 7px; background: transparent; color: var(--admin-text-subtle); font-size: .66rem; cursor: pointer; }
	.filters button:hover, .filters button.active { background: var(--admin-active); color: var(--admin-heading); }
	.ordering-note { margin: -10px 0 14px; color: var(--admin-text-subtle); font-size: .66rem; line-height: 1.4; }
	.collection-message { margin: 0; padding: 16px 4px; color: var(--admin-text-muted); font-size: .76rem; }
	.gallery-list { display: grid; margin: 0; padding: 0; border-top: 1px solid var(--admin-border); list-style: none; }
	.gallery-list li { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 34px; align-items: center; min-height: 70px; border-bottom: 1px solid var(--admin-border); }
	.gallery-list li::before { position: absolute; inset: 8px auto 8px 0; width: 2px; background: transparent; content: ""; }
	.gallery-list li:hover { background: color-mix(in srgb, var(--admin-heading) 3%, transparent); }
	.gallery-list li.selected { background: transparent; }
	.gallery-list li.selected::before { background: var(--admin-accent-strong); }
	.gallery-list a { display: grid; gap: 3px; min-width: 0; padding: 10px 7px 10px 10px; color: var(--admin-heading); text-decoration: none; }
	.gallery-list strong { overflow: hidden; font-size: .82rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
	.gallery-list span, .gallery-list small { overflow: hidden; color: var(--admin-text-subtle); font-size: .66rem; text-overflow: ellipsis; text-transform: none; white-space: nowrap; }
	.gallery-list small { color: var(--admin-accent-strong); letter-spacing: .04em; text-transform: uppercase; }
	.drag-handle, .close { border: 0; background: transparent; color: var(--admin-text-muted); cursor: pointer; }
	.drag-handle { display: grid; place-items: center; width: 34px; height: 44px; padding: 0; touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.drag-handle:active:not(:disabled) { cursor: grabbing; }
	.drag-handle:disabled { opacity: .2; cursor: default; }
	:global(#dnd-action-dragged-el) { grid-template-columns: minmax(0, 1fr) 34px !important; align-items: center; overflow: hidden; border-radius: 2px !important; outline: 1px solid color-mix(in srgb, currentColor 18%, transparent); box-shadow: 0 10px 24px color-mix(in srgb, currentColor 12%, transparent); opacity: .96; pointer-events: none; }
	:global(#dnd-action-dragged-el > a) { display: grid; gap: 3px; min-width: 0; padding: 10px 7px 10px 10px; color: inherit; text-decoration: none; }
	:global(#dnd-action-dragged-el > a > strong), :global(#dnd-action-dragged-el > a > span), :global(#dnd-action-dragged-el > a > small) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	:global(#dnd-action-dragged-el > a > strong) { font-size: .82rem; font-weight: 500; }
	:global(#dnd-action-dragged-el > a > span) { font-size: .66rem; opacity: .68; }
	:global(#dnd-action-dragged-el > a > small) { font-size: .66rem; letter-spacing: .04em; text-transform: uppercase; opacity: .82; }
	:global(#dnd-action-dragged-el > .drag-handle) { display: grid; place-items: center; width: 100%; height: 44px; padding: 0; border: 0; background: transparent; color: inherit; }
	:global(#dnd-action-dragged-el > .drag-handle > span) { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.document-pane { min-width: 0; background: var(--editor-canvas); }
	.create-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--admin-bg) 76%, transparent); backdrop-filter: blur(9px); }
	.create-panel { width: min(440px, 100%); box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 12px; padding: 24px; background: var(--admin-surface-raised); box-shadow: 0 24px 70px color-mix(in srgb, #000 35%, transparent); }
	.create-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
	.create-panel > p { margin: 10px 0 0; color: var(--admin-text-muted); font-size: .78rem; line-height: 1.55; }
	.create-panel form { display: grid; gap: 17px; margin-top: 22px; }
	.close { width: 44px; height: 44px; font-size: 1.25rem; }
	.slug-field { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 7px; color: var(--admin-text-subtle); }
	.create-message { margin: 16px 0 0; color: var(--status-sage); font-size: .75rem; }
	[aria-invalid="true"] { border-color: var(--status-rose) !important; }
	button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--admin-accent-strong); outline-offset: 2px; }
	@media (min-width: 641px) and (max-width: 1179px) {
		.workbench-grid { display: block; }
		.portfolio-workbench.has-selection .collection-pane, .portfolio-workbench:not(.has-selection) .document-pane { display: none; }
		.collection-pane, .document-pane { min-height: calc(100vh - var(--editor-header-height, 64px)); }
	}
	@media (max-width: 768px) {
		.drag-handle { width: 44px; height: 44px; }
		:global(#dnd-action-dragged-el) { grid-template-columns: minmax(0, 1fr) 44px !important; }
		.new-gallery, .filters button, .primary { min-height: 44px; }
	}
	@media (max-width: 640px) {
		.workbench-heading { align-items: flex-start; padding: 18px 20px; flex-direction: column; }
		.heading-meta { justify-items: start; }
		.workbench-grid { display: block; min-height: 0; }
		.collection-pane { padding: 22px 16px 48px; border-right: 0; }
		.portfolio-workbench.has-selection .collection-pane, .portfolio-workbench:not(.has-selection) .document-pane { display: none; }
		.create-backdrop { align-items: end; padding: 0; }
		.create-panel { border-radius: 14px 14px 0 0; }
	}
	@media (prefers-reduced-motion: no-preference) {
		.gallery-list li, .filters button { transition: color .16s ease, background-color .16s ease; }
	}
</style>
