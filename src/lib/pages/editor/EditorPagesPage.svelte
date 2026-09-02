<script lang="ts">
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

const config = getAdminConfig();
const quoteConfig = config.editor?.homepageQuote;
const contactConfig = config.editor?.contactPage;
const aboutConfig = config.editor?.aboutPage;
const modelingConfig = config.editor?.modelingPage;
if ((!quoteConfig && !contactConfig && !aboutConfig && !modelingConfig) || !config.api.siteEditor) {
	throw new Error("Pages editor is not configured for this host");
}
const quoteHref = quoteConfig?.baseHref ?? "/admin/editor/pages/homepage-quote";
const contactHref = contactConfig?.baseHref ?? "/admin/editor/pages/contact";
const aboutHref = aboutConfig?.baseHref ?? "/admin/editor/pages/about";
const modelingHref = modelingConfig?.baseHref ?? "/admin/editor/pages/modeling";
const pages = [
	aboutConfig ? { href: aboutHref, name: "about", description: "Biography, portraits, selected details, and search description" } : null,
	modelingConfig ? { href: modelingHref, name: "modeling & acting", description: "Category galleries, image accessibility, visibility, and search description" } : null,
	contactConfig ? { href: contactHref, name: "contact & booking", description: "Public details, inquiry choices, and booking link" } : null,
].filter((page) => page !== null);

function indexLabel(index: number) {
	return String(index + 1).padStart(2, "0");
}
</script>

<svelte:head><title>Pages — {config.siteName}</title></svelte:head>

<div class="settings-page rail-aligned-header pages-index">
	<header class="settings-header">
		<h1>pages</h1>
	</header>

	{#if pages.length > 0}
		<nav aria-label="Editable pages">
			<ol class="page-list">
				{#each pages as page, index}
					<li>
						<a class="page-entry" href={page.href}>
							<span class="index" aria-hidden="true">{indexLabel(index)}</span>
							<span class="entry-copy"><strong>{page.name}</strong><small>{page.description}</small></span>
							<span class="arrow" aria-hidden="true">→</span>
						</a>
					</li>
				{/each}
			</ol>
		</nav>
	{/if}

	{#if quoteConfig}
		<section class="homepage-group" aria-labelledby="homepage-content-heading">
			<h2 id="homepage-content-heading">homepage</h2>
			<ol class="page-list">
				<li>
					<a class="page-entry" href={quoteHref}>
						<span class="index" aria-hidden="true">{indexLabel(pages.length)}</span>
						<span class="entry-copy"><strong>quote</strong><small>Quote text and attribution</small></span>
						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			</ol>
		</section>
	{/if}
</div>

<style>
	.pages-index { max-width: 920px; }
	.pages-index .settings-header { margin-bottom: 18px; }
	.page-list { margin: 0; padding: 0; list-style: none; }
	.page-list .page-entry { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 14px; align-items: center; margin: 0; padding: 18px 8px 18px 4px; border: 0; border-top: 1px solid var(--admin-border); background: transparent; }
	.page-list li:last-child .page-entry { border-bottom: 1px solid var(--admin-border); }
	.index { align-self: start; padding-top: 2px; color: var(--admin-text-subtle); font-size: .62rem; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
	.entry-copy { display: grid; gap: 5px; min-width: 0; }
	.entry-copy strong { color: var(--admin-heading); font-size: .86rem; font-weight: 500; }
	.entry-copy small { color: var(--admin-text-muted); font-size: .72rem; line-height: 1.45; text-wrap: pretty; }
	.arrow { color: var(--admin-text-subtle); transition: color .18s ease, transform .18s ease; }
	.page-entry:hover { background: color-mix(in srgb, var(--admin-heading) 3%, transparent); }
	.page-entry:hover strong, .page-entry:hover .arrow { color: var(--admin-accent-strong); }
	.page-entry:hover .arrow { transform: translateX(3px); }
	.page-entry:active .arrow { transform: translateX(5px); }
	.homepage-group { margin-top: 34px !important; padding: 0 !important; border: 0 !important; }
	.homepage-group h2 { margin: 0 0 10px; color: var(--admin-text-muted); font-size: .7rem; font-weight: 500; letter-spacing: .04em; }
	@media (max-width: 640px) {
		.page-list .page-entry { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; padding-block: 16px; }
		.entry-copy small { max-width: 38ch; }
	}
</style>
