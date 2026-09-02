<script lang="ts">
import { getAdminConfig } from "../../config";
import PortfolioWorkbench from "./PortfolioWorkbench.svelte";

const config = getAdminConfig();
if (!config.api.portfolioEditor || !config.editor?.portfolio) {
	throw new Error("Portfolio editor is not configured for this host");
}
</script>

<svelte:head><title>Portfolio — {config.siteName}</title></svelte:head>

<PortfolioWorkbench>
	<div class="portfolio-overview">
		<span>portfolio</span>
		<h2>select a gallery</h2>
		<p>Choose one from the list, or create a new gallery.</p>
	</div>
</PortfolioWorkbench>

<style>
	.portfolio-overview { max-width: 620px; padding: clamp(38px, 7vw, 86px) clamp(28px, 6vw, 72px) 96px; }
	.portfolio-overview > span { color: var(--admin-accent-strong); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; }
	h2 { margin: 0; color: var(--admin-heading); font-family: var(--admin-font-display); font-size: clamp(1.3rem, 2.2vw, 1.8rem); font-weight: 500; }
	.portfolio-overview > span + h2 { margin-top: 11px; }
	.portfolio-overview > p { max-width: 48ch; margin: 12px 0 0; color: var(--admin-text-muted); font-size: .82rem; line-height: 1.65; }
	@media (max-width: 760px) { .portfolio-overview { padding: 28px 20px 64px; } }
</style>
