<script lang="ts">
import { moveAboutItem, newAboutHighlight, newAboutSection, type AboutPublishIssue } from "../../aboutPage";
import type { AboutHighlightDraft, AboutSectionDraft } from "../../config";

let {
	sections,
	highlights,
	publishIssues,
	reviewRequested,
	onSectionsChange,
	onHighlightsChange,
}: {
	sections: AboutSectionDraft[];
	highlights: AboutHighlightDraft[];
	publishIssues: AboutPublishIssue[];
	reviewRequested: boolean;
	onSectionsChange: (sections: AboutSectionDraft[]) => void;
	onHighlightsChange: (highlights: AboutHighlightDraft[]) => void;
} = $props();

function updateSection(index: number, change: Partial<AboutSectionDraft>) {
	onSectionsChange(sections.map((section, itemIndex) => itemIndex === index ? { ...section, ...change } : section));
}

function updateSectionItem(sectionIndex: number, itemIndex: number, value: string) {
	const items = [...sections[sectionIndex].items];
	items[itemIndex] = value;
	updateSection(sectionIndex, { items });
}

function addSectionItem(sectionIndex: number) {
	if (sections[sectionIndex].items.length >= 20) return;
	updateSection(sectionIndex, { items: [...sections[sectionIndex].items, ""] });
}

function removeSectionItem(sectionIndex: number, itemIndex: number) {
	updateSection(sectionIndex, { items: sections[sectionIndex].items.filter((_, index) => index !== itemIndex) });
}

function updateHighlight(index: number, change: Partial<AboutHighlightDraft>) {
	onHighlightsChange(highlights.map((highlight, itemIndex) => itemIndex === index ? { ...highlight, ...change } : highlight));
}
</script>

<section aria-labelledby="about-sections-heading">
	<div class="section-heading"><div><h2 id="about-sections-heading">selected details</h2><p>Optional titled groups for the public design to place where they fit.</p></div><button type="button" onclick={() => onSectionsChange([...sections, newAboutSection()])} disabled={sections.length >= 12}>add section</button></div>
	<div class="ordered-list">
		{#each sections as section, index (section.key)}
			<div class="card">
				<div class="card-header"><strong>section {index + 1}</strong><div class="row-actions"><button type="button" onclick={() => onSectionsChange(moveAboutItem(sections, index, -1))} disabled={index === 0} aria-label={`Move section ${index + 1} earlier`}>↑</button><button type="button" onclick={() => onSectionsChange(moveAboutItem(sections, index, 1))} disabled={index === sections.length - 1} aria-label={`Move section ${index + 1} later`}>↓</button><button type="button" onclick={() => onSectionsChange(sections.filter((_, itemIndex) => itemIndex !== index))}>remove</button></div></div>
				<label>title<input id={`about-section-${section.key}-title`} maxlength="120" value={section.title ?? ""} oninput={(event) => updateSection(index, { title: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-section-${section.key}-title`)} /></label>
				<div class="items">
					{#each section.items as item, itemIndex}
						<div class="item-row"><label>item {itemIndex + 1}<textarea id={`about-section-${section.key}-item-${itemIndex}`} rows="2" maxlength="500" value={item} oninput={(event) => updateSectionItem(index, itemIndex, event.currentTarget.value)} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-section-${section.key}-item-${itemIndex}`)}></textarea></label><button type="button" onclick={() => removeSectionItem(index, itemIndex)}>remove</button></div>
					{/each}
					<button type="button" class="add-item" onclick={() => addSectionItem(index)} disabled={section.items.length >= 20}>add item</button>
				</div>
			</div>
		{/each}
		{#if sections.length === 0}<p class="empty">No selected-detail sections. Introduction or biography copy can stand on its own.</p>{/if}
	</div>
</section>

<section aria-labelledby="about-highlights-heading">
	<div class="section-heading"><div><h2 id="about-highlights-heading">highlights</h2><p>Optional compact label-and-value details, such as a location or discipline.</p></div><button type="button" onclick={() => onHighlightsChange([...highlights, newAboutHighlight()])} disabled={highlights.length >= 12}>add highlight</button></div>
	<div class="ordered-list">
		{#each highlights as highlight, index (highlight.key)}
			<div class="highlight-row">
				<label>label<input id={`about-highlight-${highlight.key}-label`} maxlength="80" value={highlight.label ?? ""} oninput={(event) => updateHighlight(index, { label: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-highlight-${highlight.key}-label`)} /></label>
				<label>value<input id={`about-highlight-${highlight.key}-value`} maxlength="300" value={highlight.value ?? ""} oninput={(event) => updateHighlight(index, { value: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-highlight-${highlight.key}-value`)} /></label>
				<div class="row-actions"><button type="button" onclick={() => onHighlightsChange(moveAboutItem(highlights, index, -1))} disabled={index === 0} aria-label={`Move highlight ${index + 1} earlier`}>↑</button><button type="button" onclick={() => onHighlightsChange(moveAboutItem(highlights, index, 1))} disabled={index === highlights.length - 1} aria-label={`Move highlight ${index + 1} later`}>↓</button><button type="button" onclick={() => onHighlightsChange(highlights.filter((_, itemIndex) => itemIndex !== index))}>remove</button></div>
			</div>
		{/each}
		{#if highlights.length === 0}<p class="empty">No highlights configured.</p>{/if}
	</div>
</section>

<style>
	section { margin-top: 20px; padding: 26px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); }
	.section-heading, .card-header { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.ordered-list { display: grid; gap: 14px; }
	.card { padding: 18px; border: 1px solid var(--admin-border); border-radius: 8px; background: var(--admin-bg); }
	.card-header { margin-bottom: 16px; }
	.card-header strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.row-actions { display: flex; gap: 6px; align-items: center; }
	.row-actions button { min-height: 36px; padding: 7px 9px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; resize: vertical; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	.items { display: grid; gap: 10px; margin-top: 14px; }
	.item-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
	.item-row button { margin-bottom: 1px; }
	.add-item { justify-self: start; }
	.highlight-row { display: grid; grid-template-columns: minmax(150px, .6fr) minmax(220px, 1.4fr) auto; gap: 12px; align-items: end; }
	.empty { margin: 0; color: var(--admin-text-muted); font-size: .8rem; }
	@media (max-width: 820px) { section { padding: 20px; } .section-heading { align-items: flex-start; flex-direction: column; } .highlight-row { grid-template-columns: 1fr; } .item-row { grid-template-columns: 1fr; } .item-row button { justify-self: start; } button { min-height: 44px; } }
</style>
