<script lang="ts">
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import { newAboutHighlight, newAboutSection, type AboutPublishIssue } from "../../aboutPage";
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

type DraggableSection = AboutSectionDraft & { id: string; isDndShadowItem?: boolean };
type DraggableHighlight = AboutHighlightDraft & { id: string; isDndShadowItem?: boolean };

let sectionDragItems = $state<DraggableSection[] | null>(null);
let highlightDragItems = $state<DraggableHighlight[] | null>(null);
let visibleSections: DraggableSection[] = $derived(sectionDragItems ?? sections.map((section) => ({ ...section, id: section.key })));
let visibleHighlights: DraggableHighlight[] = $derived(highlightDragItems ?? highlights.map((highlight) => ({ ...highlight, id: highlight.key })));

function updateSection(key: string, change: Partial<AboutSectionDraft>) {
	onSectionsChange(sections.map((section) => section.key === key ? { ...section, ...change } : section));
}

function updateSectionItem(sectionKey: string, itemIndex: number, value: string) {
	const section = sections.find((item) => item.key === sectionKey);
	if (!section) return;
	const items = [...section.items];
	items[itemIndex] = value;
	updateSection(sectionKey, { items });
}

function addSectionItem(sectionKey: string) {
	const section = sections.find((item) => item.key === sectionKey);
	if (!section || section.items.length >= 20) return;
	updateSection(sectionKey, { items: [...section.items, ""] });
}

function removeSectionItem(sectionKey: string, itemIndex: number) {
	const section = sections.find((item) => item.key === sectionKey);
	if (!section) return;
	updateSection(sectionKey, { items: section.items.filter((_, index) => index !== itemIndex) });
}

function updateHighlight(key: string, change: Partial<AboutHighlightDraft>) {
	onHighlightsChange(highlights.map((highlight) => highlight.key === key ? { ...highlight, ...change } : highlight));
}

function finishSections(event: CustomEvent<{ items: DraggableSection[] }>) {
	sectionDragItems = null;
	onSectionsChange(event.detail.items.filter((item) => !item.isDndShadowItem).map(({ id: _id, isDndShadowItem: _shadow, ...section }) => section));
}

function finishHighlights(event: CustomEvent<{ items: DraggableHighlight[] }>) {
	highlightDragItems = null;
	onHighlightsChange(event.detail.items.filter((item) => !item.isDndShadowItem).map(({ id: _id, isDndShadowItem: _shadow, ...highlight }) => highlight));
}
</script>

<section aria-labelledby="about-sections-heading">
	<div class="section-heading"><div><h2 id="about-sections-heading">selected details</h2><p>Optional titled groups shown with the biography.</p></div><button type="button" onclick={() => onSectionsChange([...sections, newAboutSection()])} disabled={sections.length >= 12}>add section</button></div>
	<div class="ordered-list" aria-label="Reorder selected-detail sections" use:dragHandleZone={{ items: visibleSections, dragDisabled: sections.length < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "about-sections" }} onconsider={(event) => sectionDragItems = event.detail.items} onfinalize={finishSections}>
		{#each visibleSections as section, index (section.id)}
			<div class="card" class:dnd-shadow={section.isDndShadowItem}>
				<div class="card-header"><strong>section {index + 1}</strong><div class="row-actions"><button type="button" class="drag-handle" use:dragHandle disabled={sections.length < 2 || section.isDndShadowItem} aria-label={`Drag section ${index + 1} to reorder`}><span aria-hidden="true"></span></button><button type="button" onclick={() => onSectionsChange(sections.filter((item) => item.key !== section.key))} disabled={section.isDndShadowItem}>remove</button></div></div>
				<label>title<input id={`about-section-${section.key}-title`} maxlength="120" value={section.title ?? ""} oninput={(event) => updateSection(section.key, { title: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-section-${section.key}-title`)} disabled={section.isDndShadowItem} /></label>
				<div class="items">
					{#each section.items as item, itemIndex}
						<div class="item-row"><label>item {itemIndex + 1}<textarea id={`about-section-${section.key}-item-${itemIndex}`} rows="2" maxlength="500" value={item} oninput={(event) => updateSectionItem(section.key, itemIndex, event.currentTarget.value)} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-section-${section.key}-item-${itemIndex}`)} disabled={section.isDndShadowItem}></textarea></label><button type="button" onclick={() => removeSectionItem(section.key, itemIndex)} disabled={section.isDndShadowItem}>remove</button></div>
					{/each}
					<button type="button" class="add-item" onclick={() => addSectionItem(section.key)} disabled={section.items.length >= 20 || section.isDndShadowItem}>add item</button>
				</div>
			</div>
		{/each}
		{#if sections.length === 0}<p class="empty">No selected-detail sections. Introduction or biography copy can stand on its own.</p>{/if}
	</div>
</section>

<section aria-labelledby="about-highlights-heading">
	<div class="section-heading"><div><h2 id="about-highlights-heading">highlights</h2><p>Optional compact label-and-value details, such as a location or discipline.</p></div><button type="button" onclick={() => onHighlightsChange([...highlights, newAboutHighlight()])} disabled={highlights.length >= 12}>add highlight</button></div>
	<div class="ordered-list" aria-label="Reorder highlights" use:dragHandleZone={{ items: visibleHighlights, dragDisabled: highlights.length < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "about-highlights" }} onconsider={(event) => highlightDragItems = event.detail.items} onfinalize={finishHighlights}>
		{#each visibleHighlights as highlight, index (highlight.id)}
			<div class="highlight-row" class:dnd-shadow={highlight.isDndShadowItem}>
				<label>label<input id={`about-highlight-${highlight.key}-label`} maxlength="80" value={highlight.label ?? ""} oninput={(event) => updateHighlight(highlight.key, { label: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-highlight-${highlight.key}-label`)} disabled={highlight.isDndShadowItem} /></label>
				<label>value<input id={`about-highlight-${highlight.key}-value`} maxlength="300" value={highlight.value ?? ""} oninput={(event) => updateHighlight(highlight.key, { value: event.currentTarget.value })} aria-invalid={reviewRequested && publishIssues.some((issue) => issue.fieldId === `about-highlight-${highlight.key}-value`)} disabled={highlight.isDndShadowItem} /></label>
				<div class="row-actions"><button type="button" class="drag-handle" use:dragHandle disabled={highlights.length < 2 || highlight.isDndShadowItem} aria-label={`Drag highlight ${index + 1} to reorder`}><span aria-hidden="true"></span></button><button type="button" onclick={() => onHighlightsChange(highlights.filter((item) => item.key !== highlight.key))} disabled={highlight.isDndShadowItem}>remove</button></div>
			</div>
		{/each}
		{#if highlights.length === 0}<p class="empty">No highlights configured.</p>{/if}
	</div>
</section>

<style>
	section { margin-top: 20px; padding: 24px 0 28px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading, .card-header { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .8rem; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 13px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.ordered-list { display: grid; }
	.card { padding: 18px 0 22px; border-top: 1px solid var(--admin-border); }
	.card-header { margin-bottom: 16px; }
	.card-header strong { color: var(--admin-heading); font-size: .78rem; font-weight: 500; }
	.row-actions { display: flex; gap: 6px; align-items: center; }
	.row-actions button { min-height: 36px; padding: 7px 9px; }
	.drag-handle { display: grid; place-items: center; min-width: 42px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.dnd-shadow { opacity: .34; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; resize: vertical; }
	[aria-invalid="true"] { border-color: var(--status-rose); }
	.items { display: grid; gap: 10px; margin-top: 14px; }
	.item-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
	.item-row button { margin-bottom: 1px; }
	.add-item { justify-self: start; }
	.highlight-row { display: grid; grid-template-columns: minmax(150px, .6fr) minmax(220px, 1.4fr) auto; gap: 12px; align-items: end; padding: 16px 0; border-top: 1px solid var(--admin-border); }
	.empty { margin: 0; color: var(--admin-text-muted); font-size: .8rem; }
	@media (max-width: 820px) { section { padding: 22px 0 26px; } .section-heading { align-items: flex-start; flex-direction: column; } .highlight-row { grid-template-columns: 1fr; } .item-row { grid-template-columns: 1fr; } .item-row button { justify-self: start; } button { min-height: 44px; } }
</style>
