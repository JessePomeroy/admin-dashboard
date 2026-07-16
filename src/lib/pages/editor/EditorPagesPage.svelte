<script lang="ts">
import { getAdminConfig } from "../../config";
import "../../styles/editorial-page.css";

const config = getAdminConfig();
const quoteConfig = config.editor?.homepageQuote;
const contactConfig = config.editor?.contactPage;
const aboutConfig = config.editor?.aboutPage;
if ((!quoteConfig && !contactConfig && !aboutConfig) || !config.api.siteEditor) {
	throw new Error("Pages editor is not configured for this host");
}
const quoteHref = quoteConfig?.baseHref ?? "/admin/editor/pages/homepage-quote";
const contactHref = contactConfig?.baseHref ?? "/admin/editor/pages/contact";
const aboutHref = aboutConfig?.baseHref ?? "/admin/editor/pages/about";
</script>

<svelte:head><title>Pages — {config.siteName}</title></svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div>
			<h1>pages</h1>
			<p class="description">Only the content areas available for this site appear here. Page layout and design remain intentionally managed outside the Editor.</p>
		</div>
	</header>

	{#if contactConfig || aboutConfig}
	<section aria-labelledby="editable-pages-heading">
		<div class="section-heading">
			<span>01</span>
			<div>
				<h2 id="editable-pages-heading">editable pages</h2>
				<p>Business-facing content inside pages whose structure and operations remain designed and platform-managed.</p>
			</div>
		</div>
		{#if aboutConfig}
			<a class="page-entry" href={aboutHref}>
				<span><strong>about</strong><small>Biography, ordered portraits, selected details, and search description</small></span>
				<span aria-hidden="true">→</span>
			</a>
		{/if}
		{#if contactConfig}
			<a class="page-entry" href={contactHref}>
				<span><strong>contact &amp; booking</strong><small>Visible copy, public details, inquiry choices, and booking link</small></span>
				<span aria-hidden="true">→</span>
			</a>
		{/if}
	</section>
	{/if}

	{#if quoteConfig}
	<section aria-labelledby="homepage-content-heading">
		<div class="section-heading">
			<span>{contactConfig || aboutConfig ? "02" : "01"}</span>
			<div>
				<h2 id="homepage-content-heading">homepage content</h2>
				<p>Focused content slots on the designed Homepage—not access to the page layout itself.</p>
			</div>
		</div>
		<a class="page-entry" href={quoteHref}>
			<span><strong>quote</strong><small>Quote text and attribution</small></span>
			<span aria-hidden="true">→</span>
		</a>
	</section>
	{/if}
</div>
