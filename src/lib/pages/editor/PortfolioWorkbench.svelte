<script lang="ts">
import { useQuery } from "convex-svelte";
import { tick, type Snippet } from "svelte";
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

async function moveGallery(index: number, direction: -1 | 1) {
	if (!galleries || reorderState === "saving" || orderingDisabled) return;
	const destination = index + direction;
	if (destination < 0 || destination >= galleries.length) return;
	const previous = galleries;
	const reordered = [...galleries];
	[reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
	const galleryIds = reordered.map(({ galleryId }) => galleryId);
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
	<header class="workbench-heading">
		<div>
			<p class="eyebrow">content / portfolio</p>
			<h1>gallery workspace</h1>
		</div>
		<div class="heading-meta">
			<span>{galleries?.length ?? 0} {(galleries?.length ?? 0) === 1 ? "gallery" : "galleries"}</span>
			{#if reorderMessage}<span class:error={reorderState === "error"} role={reorderState === "error" ? "alert" : "status"}>{reorderMessage}</span>{/if}
		</div>
	</header>

	<div class="workbench-grid">
		<aside class="collection-pane" aria-label="Portfolio galleries">
			<div class="collection-heading">
				<div><span class="eyebrow">collection</span><h2>galleries</h2></div>
				<button bind:this={newGalleryButton} type="button" class="new-gallery" onclick={() => void openCreate()}>new</button>
			</div>
			<p class="collection-note">{publishingEnabled
				? "The public site follows this deliberate order."
				: "This deliberate order is saved with the private drafts."}</p>

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
				<ol class="gallery-list">
					{#each visibleGalleries as gallery}
						{@const sourceIndex = galleries?.findIndex(({ galleryId }) => galleryId === gallery.galleryId) ?? -1}
						<li class:selected={selectedGalleryId === gallery.galleryId}>
							<a href={`${baseHref}/${gallery.galleryId}`} aria-current={selectedGalleryId === gallery.galleryId ? "page" : undefined}>
								<strong>{portfolioGalleryLabel(gallery)}</strong>
								<span>/{gallery.slug} · {gallery.draft?.placementCount ?? gallery.published?.placementCount ?? 0} images</span>
								<small class="status">{statusLabel(gallery)} · {formatUpdatedAt(gallery.updatedAt)}</small>
							</a>
							<div class="order-actions" aria-label={`Reorder ${portfolioGalleryLabel(gallery)}`}>
								<button type="button" onclick={() => void moveGallery(sourceIndex, -1)} disabled={orderingDisabled || sourceIndex <= 0 || reorderState === "saving"} aria-label="Move gallery earlier">↑</button>
								<button type="button" onclick={() => void moveGallery(sourceIndex, 1)} disabled={orderingDisabled || !galleries || sourceIndex === galleries.length - 1 || reorderState === "saving"} aria-label="Move gallery later">↓</button>
							</div>
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
			<div class="create-heading"><div><span class="eyebrow">new record</span><h2 id="create-gallery-heading">new gallery</h2></div><button type="button" class="close" onclick={() => void closeCreate()} aria-label="Close new gallery form">×</button></div>
			<p>{publishingEnabled ? "Create an unpublished gallery, then add details and images before publishing." : "Create and arrange a private gallery draft."}</p>
			<form onsubmit={(event) => { event.preventDefault(); void createGallery(); }}>
				<label>gallery name<input bind:this={titleInput} value={title} oninput={updateTitle} maxlength="120" autocomplete="off" aria-invalid={Boolean(errors.title)} />{#if errors.title}<small class="field-error">{errors.title}</small>{/if}</label>
				<label>{publishingEnabled ? "public URL" : "URL name"}<div class="slug-field"><span>/</span><input value={slug} oninput={updateSlug} maxlength="80" autocomplete="off" spellcheck="false" aria-invalid={Boolean(errors.slug)} /></div>{#if errors.slug}<small class="field-error">{errors.slug}</small>{/if}</label>
				<button type="submit" class="primary" disabled={createState === "saving"}>{createState === "saving" ? "creating…" : publishingEnabled ? "create unpublished gallery" : "create gallery draft"}</button>
			</form>
			{#if createMessage}<p class:error={createState === "error"} class="create-message" role={createState === "error" ? "alert" : "status"}>{createMessage}</p>{/if}
		</div>
	</div>
{/if}

<style>
	.portfolio-workbench { min-height: 100%; background: var(--admin-bg); color: var(--admin-text); }
	.workbench-heading { display: flex; align-items: end; justify-content: space-between; gap: 28px; padding: 24px 32px 20px; border-bottom: 1px solid var(--admin-border); background: color-mix(in srgb, var(--admin-surface) 72%, var(--admin-bg)); }
	.eyebrow { display: block; margin: 0 0 6px; color: var(--admin-text-subtle); font-size: .64rem; letter-spacing: .16em; text-transform: uppercase; }
	h1, h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-weight: 500; }
	h1 { font-size: clamp(1.35rem, 2.2vw, 2rem); } h2 { font-size: 1.08rem; }
	.heading-meta { display: grid; justify-items: end; gap: 5px; color: var(--admin-text-subtle); font-size: .7rem; }
	.heading-meta .error, .collection-message.error, .create-message.error, .field-error { color: var(--status-rose); }
	.workbench-grid { display: grid; grid-template-columns: minmax(270px, 300px) minmax(600px, 1fr); min-height: calc(100vh - 101px); }
	.collection-pane { min-width: 0; padding: 26px 18px 40px; border-right: 1px solid var(--admin-border); background: var(--admin-surface); }
	.collection-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
	.collection-note { margin: -10px 0 18px; color: var(--admin-text-muted); font-size: .7rem; line-height: 1.45; }
	button, input { font: inherit; }
	.new-gallery, .primary { border: 1px solid transparent; border-radius: 6px; padding: 8px 11px; background: var(--admin-accent-strong); color: var(--admin-bg); font-size: .72rem; cursor: pointer; }
	.search-field, .create-panel label { display: grid; gap: 7px; color: var(--admin-text-muted); font-size: .7rem; }
	.search-field input, .create-panel input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); text-transform: none; }
	.filters { display: flex; gap: 4px; margin: 12px 0 18px; overflow-x: auto; }
	.filters button { border: 0; border-radius: 999px; padding: 6px 8px; background: transparent; color: var(--admin-text-subtle); font-size: .66rem; cursor: pointer; }
	.filters button:hover, .filters button.active { background: var(--admin-active); color: var(--admin-heading); }
	.ordering-note { margin: -10px 0 14px; color: var(--admin-text-subtle); font-size: .66rem; line-height: 1.4; }
	.collection-message { margin: 0; padding: 16px 4px; color: var(--admin-text-muted); font-size: .76rem; }
	.gallery-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
	.gallery-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px; border: 1px solid transparent; border-radius: 8px; }
	.gallery-list li:hover, .gallery-list li.selected { border-color: var(--admin-border); background: var(--admin-active); }
	.gallery-list a { display: grid; gap: 4px; min-width: 0; padding: 12px 4px 12px 12px; color: var(--admin-heading); text-decoration: none; }
	.gallery-list strong { overflow: hidden; font-size: .82rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
	.gallery-list span, .gallery-list small { overflow: hidden; color: var(--admin-text-subtle); font-size: .66rem; text-overflow: ellipsis; text-transform: none; white-space: nowrap; }
	.gallery-list small { color: var(--admin-accent-strong); letter-spacing: .04em; text-transform: uppercase; }
	.order-actions { display: grid; gap: 2px; padding-right: 6px; }
	.order-actions button, .close { border: 0; background: transparent; color: var(--admin-text-muted); cursor: pointer; }
	.order-actions button { width: 26px; height: 24px; border-radius: 4px; padding: 0; }
	.order-actions button:hover:not(:disabled) { background: var(--admin-surface-raised); color: var(--admin-heading); }
	.order-actions button:disabled { opacity: .25; cursor: default; }
	.document-pane { min-width: 0; }
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
		.collection-pane, .document-pane { min-height: calc(100vh - 101px); }
	}
	@media (max-width: 768px) {
		.order-actions button { width: 44px; height: 44px; }
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
		.gallery-list li, .filters button { transition: color .16s ease, background-color .16s ease, border-color .16s ease; }
	}
</style>
