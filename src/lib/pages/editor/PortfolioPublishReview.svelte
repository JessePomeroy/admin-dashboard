<script lang="ts">
import type { PortfolioPublishIssue } from "../../portfolioEditor";

let { issues }: { issues: PortfolioPublishIssue[] } = $props();

function focusIssue(fieldId: string) {
	document.getElementById(fieldId)?.focus();
}
</script>

<section class:ready={issues.length === 0} aria-labelledby="publish-review-heading">
	<div class="heading">
		<div>
			<h2 id="publish-review-heading">publishing review</h2>
			<p aria-live="polite">{issues.length === 0 ? "Ready to publish." : `${issues.length} ${issues.length === 1 ? "item needs" : "items need"} attention.`}</p>
		</div>
		<span>{issues.length === 0 ? "ready" : "review"}</span>
	</div>
	{#if issues.length === 0}
		<p class="copy">The gallery has a title, at least one image, and an accessibility decision for every image.</p>
	{:else}
		<ul>
			{#each issues as issue}
				<li><a href={`#${issue.fieldId}`} onclick={(event) => { event.preventDefault(); focusIssue(issue.fieldId); }}>{issue.message}</a></li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	section { margin-top: 0; padding: 20px 0 24px; border-top: 1px solid var(--admin-border-strong); }
	section.ready { border-top-color: color-mix(in srgb, var(--status-sage) 55%, var(--admin-border)); }
	.heading { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	.heading span { border: 1px solid var(--admin-border-strong); border-radius: 999px; padding: 4px 8px; color: var(--admin-text-muted); font-size: .66rem; }
	.ready .heading span { border-color: color-mix(in srgb, var(--status-sage) 55%, transparent); color: var(--status-sage); }
	.copy { margin: 0; color: var(--admin-text-muted); font-size: .8rem; line-height: 1.55; }
	ul { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
	a { color: var(--admin-text); font-size: .78rem; }
</style>
