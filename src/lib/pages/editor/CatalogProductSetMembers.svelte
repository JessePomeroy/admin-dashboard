<script lang="ts">
import { dragHandle, dragHandleZone } from "svelte-dnd-action";
import type { CatalogProductSetMemberDraftForm } from "../../catalogProductEditor";
let { members, disabled = false, onChange, onRemove }: { members: CatalogProductSetMemberDraftForm[]; disabled?: boolean; onChange: (members: CatalogProductSetMemberDraftForm[]) => void; onRemove?: (member: CatalogProductSetMemberDraftForm) => void } = $props();
type DraggableMember = CatalogProductSetMemberDraftForm & { id: string; isDndShadowItem?: boolean };
let dragItems = $state<DraggableMember[] | null>(null);
let visibleMembers: DraggableMember[] = $derived(dragItems ?? members.map((member) => ({ ...member, id: member.key })));
function finishReorder(event: CustomEvent<{ items: DraggableMember[] }>) {
	dragItems = null;
	onChange(event.detail.items.filter((item) => !item.isDndShadowItem).map(({ id: _id, isDndShadowItem: _shadow, ...member }) => member));
}
</script>
<section aria-labelledby="catalog-set-members-heading">
	<div class="section-heading"><span>04</span><div><h2 id="catalog-set-members-heading">set members</h2><p>{members.length} {members.length === 1 ? "print" : "prints"} in this set. Their order is saved exactly as shown.</p></div></div>
	{#if members.length === 0}
		<p class="empty"><strong>No prints in this set yet.</strong><span>Add artwork above to build the set.</span></p>
	{:else}
		<ol aria-label="Reorder print set members" use:dragHandleZone={{ items: visibleMembers, dragDisabled: disabled || members.length < 2, flipDurationMs: 140, morphDisabled: true, dropTargetStyle: {}, type: "catalog-set-members" }} onconsider={(event) => dragItems = event.detail.items} onfinalize={finishReorder}>
			{#each visibleMembers as member, index (member.id)}
				<li class:dnd-shadow={member.isDndShadowItem}>
					<div class="member-heading"><span class="position">{String(index + 1).padStart(2, "0")}</span><strong>print {index + 1}</strong></div>
					<div class="member-actions">
						<button type="button" class="drag-handle" use:dragHandle disabled={disabled || members.length < 2 || member.isDndShadowItem} aria-label={`Drag set member ${index + 1} to reorder`}><span aria-hidden="true"></span></button>
						{#if onRemove}<button type="button" class="remove" onclick={() => onRemove(member)} disabled={disabled}>remove</button>{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
<style>
	section { padding: 20px 0 24px; border-top: 1px solid var(--admin-border-strong); }
	.section-heading { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px; }
	.section-heading > span, .position { color: var(--admin-text-subtle); font-size: .72rem; padding-top: 4px; }
	.section-heading > div { flex: 1; }
	h2 { margin: 0; color: var(--admin-heading); font-size: 1rem; font-weight: 500; }
	.section-heading p { margin: 5px 0 0; color: var(--admin-text-muted); font-size: .82rem; }
	ol { margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: minmax(140px, 1fr) auto; gap: 18px; align-items: center; padding: 14px 0; border-top: 1px solid var(--admin-border); }
	.member-heading { display: grid; grid-template-columns: 26px 1fr; gap: 8px; align-items: center; }
	.member-heading strong { color: var(--admin-heading); font-size: .82rem; font-weight: 500; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .4; cursor: default; }
	button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.member-actions { display: grid; gap: 6px; }
	.member-actions .remove { color: var(--admin-danger, var(--status-rose)); }
	.drag-handle { display: grid; place-items: center; min-width: 64px; padding: 0; border-color: transparent; color: var(--admin-text-muted); touch-action: none; }
	.drag-handle span { width: 12px; height: 18px; background: radial-gradient(circle, currentColor 1.3px, transparent 1.5px) 0 0 / 6px 6px; opacity: .62; }
	.drag-handle:hover:not(:disabled) { color: var(--admin-heading); }
	.dnd-shadow { opacity: .34; }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	@media (max-width: 900px) { .member-actions { display: flex; flex-wrap: wrap; } }
	@media (max-width: 768px) { section { padding: 18px 0 22px; } .section-heading { flex-wrap: wrap; } button { min-height: 44px; } }
</style>
