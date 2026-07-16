<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import {
	portfolioGalleryLabel,
	portfolioGalleryStatus,
	slugifyPortfolioTitle,
	type PortfolioGalleryEditorSummary,
	validateNewPortfolioGallery,
} from "../../portfolioEditor";

const config = getAdminConfig();
const portfolioApi = config.api.portfolioEditor;
if (!portfolioApi || !config.editor?.portfolio) {
	throw new Error("Portfolio editor is not configured for this host");
}
const listPortfolioGalleries = portfolioApi.listForEditor;
const savePortfolioDraft = portfolioApi.saveDraft;

const client = useAdminClient();
const galleriesQuery = useQuery(listPortfolioGalleries, {
	siteUrl: config.siteUrl,
});

let galleries = $derived(
	galleriesQuery.data as PortfolioGalleryEditorSummary[] | undefined,
);
let title = $state("");
let slug = $state("");
let slugWasEdited = $state(false);
let errors = $state<{ title?: string; slug?: string }>({});
let createState = $state<"idle" | "saving" | "error">("idle");
let createMessage = $state("");

function updateTitle(event: Event) {
	title = (event.currentTarget as HTMLInputElement).value;
	if (!slugWasEdited) slug = slugifyPortfolioTitle(title);
}

function updateSlug(event: Event) {
	slugWasEdited = true;
	slug = slugifyPortfolioTitle((event.currentTarget as HTMLInputElement).value);
}

async function createGallery() {
	errors = validateNewPortfolioGallery(title, slug);
	if (errors.title || errors.slug) return;
	createState = "saving";
	createMessage = "";
	try {
		await client.mutation(savePortfolioDraft, {
			siteUrl: config.siteUrl,
			draft: {
				title: title.trim(),
				slug: slug.trim(),
				placements: [],
			},
		});
		createState = "idle";
		createMessage = `Created ${title.trim()} as an unpublished gallery.`;
		title = "";
		slug = "";
		slugWasEdited = false;
		errors = {};
	} catch (error) {
		createState = "error";
		createMessage = error instanceof Error ? error.message : "Could not create gallery.";
	}
}

function formatUpdatedAt(value: number) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(value);
}
</script>

<svelte:head><title>Portfolio — {config.siteName}</title></svelte:head>

<div class="portfolio-page">
	<header>
		<div>
			<h1>portfolio</h1>
			<p>Public galleries, their order, and whether each one is ready for visitors.</p>
		</div>
		<span class="count">{galleries?.length ?? 0} {(galleries?.length ?? 0) === 1 ? "gallery" : "galleries"}</span>
	</header>

	<div class="workspace">
		<section class="gallery-list" aria-labelledby="gallery-list-heading">
			<div class="section-heading">
				<h2 id="gallery-list-heading">gallery collection</h2>
				<p>The public site follows this deliberate order.</p>
			</div>

			{#if galleries === undefined}
				<p class="quiet" role="status">loading portfolio…</p>
			{:else if galleries.length === 0}
				<div class="empty">
					<strong>No portfolio galleries yet.</strong>
					<p>Create the first unpublished gallery when you are ready to begin selecting images.</p>
				</div>
			{:else}
				<ol>
					{#each galleries as gallery, index (gallery.galleryId)}
						{@const status = portfolioGalleryStatus(gallery)}
						<li>
							<span class="order" aria-label={`Position ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
							<div class="gallery-summary">
								<div class="gallery-title">
									<h3>{portfolioGalleryLabel(gallery)}</h3>
									<span class:published={status === "published"} class:draft={status === "draft changes"} class="status">{status}</span>
								</div>
								<p>/{gallery.slug} · {gallery.draft?.placementCount ?? gallery.published?.placementCount ?? 0} images · updated {formatUpdatedAt(gallery.updatedAt)}</p>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<aside class="create-panel" aria-labelledby="create-gallery-heading">
			<h2 id="create-gallery-heading">new gallery</h2>
			<p>Create the draft first. Images and details can be added before anything is published.</p>
			<form onsubmit={(event) => { event.preventDefault(); void createGallery(); }}>
				<label>
					gallery name
					<input value={title} oninput={updateTitle} maxlength="120" autocomplete="off" aria-invalid={Boolean(errors.title)} />
					{#if errors.title}<small class="field-error">{errors.title}</small>{/if}
				</label>
				<label>
					public URL
					<div class="slug-field"><span>/</span><input value={slug} oninput={updateSlug} maxlength="80" autocomplete="off" spellcheck="false" aria-invalid={Boolean(errors.slug)} /></div>
					<small>Lowercase words separated by hyphens. The URL locks after publication until redirects are available.</small>
					{#if errors.slug}<small class="field-error">{errors.slug}</small>{/if}
				</label>
				<button type="submit" disabled={createState === "saving"}>{createState === "saving" ? "creating…" : "create unpublished gallery"}</button>
			</form>
			{#if createMessage}<p class:error={createState === "error"} class="message" role={createState === "error" ? "alert" : "status"}>{createMessage}</p>{/if}
		</aside>
	</div>
</div>

<style>
	.portfolio-page { max-width: 1180px; padding: 48px 40px 96px; }
	header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 36px; }
	h1 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.8rem; font-weight: 500; }
	header p { max-width: 620px; margin: 8px 0 0; color: var(--admin-text-muted); line-height: 1.6; }
	.count { color: var(--admin-text-subtle); font-size: .76rem; white-space: nowrap; }
	.workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); gap: 20px; align-items: start; }
	.gallery-list, .create-panel { border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.gallery-list { min-height: 360px; padding: 28px; }
	.create-panel { position: sticky; top: 28px; padding: 24px; }
	.section-heading { margin-bottom: 22px; }
	h2, h3 { margin: 0; color: var(--admin-heading); font-weight: 500; }
	h2 { font-size: 1rem; }
	h3 { font-size: .94rem; }
	.section-heading p, .create-panel > p { margin: 6px 0 0; color: var(--admin-text-muted); font-size: .82rem; line-height: 1.5; }
	ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--admin-border); }
	li { display: grid; grid-template-columns: 38px 1fr; gap: 14px; padding: 18px 0; border-bottom: 1px solid var(--admin-border); }
	.order { padding-top: 2px; color: var(--admin-text-subtle); font-size: .7rem; }
	.gallery-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
	.gallery-summary p { margin: 7px 0 0; color: var(--admin-text-subtle); font-size: .74rem; }
	.status { border: 1px solid var(--admin-border-strong); border-radius: 999px; padding: 4px 8px; color: var(--admin-text-muted); font-size: .66rem; white-space: nowrap; }
	.status.published { border-color: color-mix(in srgb, var(--status-sage) 55%, transparent); color: var(--status-sage); }
	.status.draft { border-color: color-mix(in srgb, var(--status-amber) 55%, transparent); color: var(--status-amber); }
	.empty { display: grid; place-items: center; min-height: 230px; padding: 28px; text-align: center; }
	.empty p { max-width: 390px; margin: 8px 0 0; color: var(--admin-text-muted); line-height: 1.55; }
	.quiet { color: var(--admin-text-muted); }
	form { display: flex; flex-direction: column; gap: 18px; margin-top: 24px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .78rem; }
	input { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; background: var(--admin-bg); color: var(--admin-heading); padding: 11px 12px; font: inherit; text-transform: none; }
	.slug-field { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 7px; color: var(--admin-text-subtle); }
	input:focus, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	small { color: var(--admin-text-subtle); line-height: 1.45; }
	.field-error, .message.error { color: var(--status-rose); }
	button { border: 1px solid transparent; border-radius: 6px; padding: 11px 14px; background: var(--admin-accent); color: var(--admin-bg); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	.message { margin: 16px 0 0; color: var(--status-sage); font-size: .76rem; line-height: 1.5; }
	@media (max-width: 960px) {
		.workspace { grid-template-columns: 1fr; }
		.create-panel { position: static; grid-row: 1; }
	}
	@media (max-width: 768px) {
		.portfolio-page { padding: 28px 20px 72px; }
		header { align-items: flex-start; flex-direction: column; }
		.gallery-list, .create-panel { padding: 20px; }
		.gallery-title { align-items: flex-start; flex-direction: column; gap: 8px; }
		button { min-height: 44px; }
	}
</style>
