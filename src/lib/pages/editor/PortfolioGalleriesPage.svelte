<script lang="ts">
import { getAdminConfig } from "../../config";
import PortfolioWorkbench from "./PortfolioWorkbench.svelte";

const config = getAdminConfig();
const portfolioApi = config.api.portfolioEditor;
if (!portfolioApi || !config.editor?.portfolio) {
	throw new Error("Portfolio editor is not configured for this host");
}

const publishingEnabled = Boolean(portfolioApi.publish);
</script>

<svelte:head><title>Portfolio — {config.siteName}</title></svelte:head>

<PortfolioWorkbench>
	<div class="portfolio-overview">
		<p class="eyebrow">workspace guide</p>
		<h2>select a gallery</h2>
		<p>{publishingEnabled
			? "Public galleries, their order, and whether each one is ready for visitors. Choose a gallery to edit its details, review publication readiness, and arrange its public images."
			: "Gallery drafts, their saved order, and the images prepared for a future public rollout. Choose a draft to edit its details and arrange its images."}</p>
		<div class="workflow-grid">
			<div><span>01</span><strong>details</strong><p>Keep the name, URL, and description together.</p></div>
			<div><span>02</span><strong>images</strong><p>Upload or choose ready media, then set order and accessibility text.</p></div>
			<div><span>03</span><strong>{publishingEnabled ? "publish" : "review"}</strong><p>{publishingEnabled ? "Preview and publish only after the saved revision passes review." : "Saved drafts remain private until publication is connected."}</p></div>
		</div>
	</div>
</PortfolioWorkbench>

<style>
	.portfolio-overview { max-width: 820px; padding: clamp(36px, 6vw, 72px); }
	.eyebrow { margin: 0 0 8px; color: var(--admin-text-subtle); font-size: .65rem; letter-spacing: .16em; text-transform: uppercase; }
	h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: clamp(1.5rem, 3vw, 2.4rem); font-weight: 500; }
	.portfolio-overview > p:not(.eyebrow) { max-width: 620px; margin: 12px 0 0; color: var(--admin-text-muted); line-height: 1.65; }
	.workflow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 36px; }
	.workflow-grid div { min-height: 150px; padding: 20px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.workflow-grid span, .workflow-grid strong { display: block; }
	.workflow-grid span { color: var(--admin-accent-strong); font-size: .64rem; }
	.workflow-grid strong { margin-top: 24px; color: var(--admin-heading); font-weight: 500; }
	.workflow-grid p { margin: 7px 0 0; color: var(--admin-text-muted); font-size: .75rem; line-height: 1.5; }
	@media (max-width: 760px) { .portfolio-overview { padding: 28px 20px 64px; } .workflow-grid { grid-template-columns: 1fr; } }
</style>
