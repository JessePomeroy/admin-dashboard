<script lang="ts">
import { moveCatalogProductSetMember, type CatalogProductSetMemberDraftForm } from "../../catalogProductEditor";
let { members, disabled = false, onChange, onRemove }: { members: CatalogProductSetMemberDraftForm[]; disabled?: boolean; onChange: (members: CatalogProductSetMemberDraftForm[]) => void; onRemove?: (member: CatalogProductSetMemberDraftForm) => void } = $props();
</script>
<section aria-labelledby="catalog-set-members-heading">
	<div class="section-heading"><span>04</span><div><h2 id="catalog-set-members-heading">set members</h2><p>{members.length} {members.length === 1 ? "print" : "prints"} in this set. Their order is saved exactly as shown.</p></div></div>
	{#if members.length === 0}
		<p class="empty"><strong>No set members yet.</strong><span>Add a display image and its matching verified print master below.</span></p>
	{:else}
		<ol>
			{#each members as member, index (member.key)}
				<li>
					<div class="member-heading"><span class="position">{String(index + 1).padStart(2, "0")}</span><div><strong>member {index + 1}</strong><small>{member.key}</small></div></div>
					<dl>
						<div><dt>image link</dt><dd>{member.mediaPlacementKey}</dd></div>
						<div><dt>print file link</dt><dd>{member.printSourceKey}</dd></div>
					</dl>
					<div class="member-actions" role="group" aria-label={`Reorder set member ${index + 1}`}>
						<button type="button" onclick={() => onChange([...moveCatalogProductSetMember(members, index, -1)])} disabled={disabled || index === 0} aria-label={`Move set member ${index + 1} earlier`}>↑</button>
						<button type="button" onclick={() => onChange([...moveCatalogProductSetMember(members, index, 1)])} disabled={disabled || index === members.length - 1} aria-label={`Move set member ${index + 1} later`}>↓</button>
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
	li { display: grid; grid-template-columns: minmax(140px, .45fr) minmax(320px, 1.55fr) auto; gap: 18px; align-items: start; padding: 20px 0; border-top: 1px solid var(--admin-border); }
	.member-heading { display: grid; grid-template-columns: 26px 1fr; gap: 8px; }
	.member-heading strong, .member-heading small { display: block; }
	.member-heading strong { color: var(--admin-heading); font-size: .82rem; font-weight: 500; }
	.member-heading small, dt { overflow: hidden; margin-top: 5px; color: var(--admin-text-subtle); font-size: .65rem; text-overflow: ellipsis; }
	dl { display: grid; grid-template-columns: repeat(2, minmax(140px, 1fr)); gap: 14px; margin: 0; }
	dl div { min-width: 0; }
	dt, dd { margin: 0; }
	dd { overflow: hidden; margin-top: 7px; color: var(--admin-heading); font-size: .78rem; text-overflow: ellipsis; }
	button { min-height: 40px; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 12px; background: transparent; color: var(--admin-text); font: inherit; font-size: .76rem; cursor: pointer; }
	button:disabled { opacity: .4; cursor: default; }
	button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.member-actions { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; }
	.member-actions .remove { grid-column: 1 / -1; color: var(--admin-danger, var(--status-rose)); }
	.empty { display: grid; gap: 7px; margin: 0; padding: 20px; border: 1px dashed var(--admin-border); border-radius: 10px; color: var(--admin-text-muted); }
	.empty strong { color: var(--admin-heading); font-weight: 500; }
	@media (max-width: 900px) { li { grid-template-columns: 1fr; } .member-actions { display: flex; flex-wrap: wrap; } }
	@media (max-width: 768px) { section { padding: 18px 0 22px; } .section-heading { flex-wrap: wrap; } dl { grid-template-columns: 1fr; } button { min-height: 44px; } }
</style>
