<script lang="ts">
	import AdminModal from "../../components/AdminModal.svelte";
	import { formatTimestampDate } from "../../utils";

	let { client, saving, onclose, onsave, ontiertoggle, onstatusupdate } = $props<{
		client: any;
		saving: boolean;
		onclose: () => void;
		onsave: (data: {
			name: string;
			email: string;
			siteUrl: string;
			tier: "basic" | "full";
			subscriptionStatus: string;
			notes?: string;
		}) => void;
		ontiertoggle: () => void;
		onstatusupdate: (status: "none" | "active" | "canceled" | "past_due") => void;
	}>();

	let editMode = $state(false);

	let formName = $state("");
	let formEmail = $state("");
	let formSiteUrl = $state("");
	let formTier = $state<"basic" | "full">("basic");
	let formSubscriptionStatus = $state<
		"none" | "active" | "canceled" | "past_due"
	>("none");
	let formNotes = $state("");

	const allTiers = ["basic", "full"] as const;
	const allSubscriptionStatuses = [
		"none",
		"active",
		"canceled",
		"past_due",
	] as const;

	function getSubscriptionColor(status: string): string {
		const colors: Record<string, string> = {
			active: "var(--status-sage)",
			canceled: "var(--status-rose)",
			past_due: "var(--status-amber)",
			none: "var(--admin-text-subtle)",
		};
		return colors[status] || "var(--admin-text-subtle)";
	}

	function startEdit() {
		if (!client) return;
		formName = client.name || "";
		formEmail = client.email || "";
		formSiteUrl = client.siteUrl || "";
		formTier = client.tier || "basic";
		formSubscriptionStatus = client.subscriptionStatus || "none";
		formNotes = client.notes || "";
		editMode = true;
	}

	function cancelEdit() {
		editMode = false;
	}

	function handleClose() {
		editMode = false;
		onclose();
	}

	function handleSubmit() {
		if (!formName || !formEmail || !formSiteUrl) return;
		onsave({
			name: formName,
			email: formEmail,
			siteUrl: formSiteUrl,
			tier: formTier,
			subscriptionStatus: formSubscriptionStatus,
			notes: formNotes || undefined,
		});
		editMode = false;
	}
</script>

{#if client}
	<AdminModal
		title={editMode ? "edit client" : client.name}
		ariaLabel="Platform client details"
		onclose={handleClose}
		--admin-modal-mobile-max-height="90vh"
		--admin-modal-mobile-header-padding="20px 20px 16px"
	>
		{#if editMode}
			<form class="modal-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="form-group">
					<label class="form-label" for="edit-name">name <span class="required">*</span></label>
					<input id="edit-name" class="form-input" type="text" bind:value={formName} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-email">email <span class="required">*</span></label>
					<input id="edit-email" class="form-input" type="email" bind:value={formEmail} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-site">site url <span class="required">*</span></label>
					<input id="edit-site" class="form-input" type="text" placeholder="example.com" bind:value={formSiteUrl} required />
				</div>
				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="edit-tier">tier</label>
						<select id="edit-tier" class="form-input" bind:value={formTier}>
							{#each allTiers as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</div>
					<div class="form-group">
						<label class="form-label" for="edit-status">subscription status</label>
						<select id="edit-status" class="form-input" bind:value={formSubscriptionStatus}>
							{#each allSubscriptionStatuses as s}
								<option value={s}>{s === "past_due" ? "past due" : s}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-notes">notes</label>
					<textarea id="edit-notes" class="form-input form-textarea" bind:value={formNotes} rows="3"></textarea>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn-cancel" onclick={cancelEdit}>cancel</button>
					<button type="submit" class="btn-save" disabled={saving || !formName || !formEmail || !formSiteUrl}>
						{saving ? "saving..." : "save changes"}
					</button>
				</div>
			</form>
		{:else}
			<div class="detail-body">
				<div class="detail-meta-line">
					<span class="tier-text" class:tier-full={client.tier === "full"}>{client.tier} tier</span>
					<span class="meta-sep">&middot;</span>
					<span class="status-indicator">
						<span class="status-dot" style="background: {getSubscriptionColor(client.subscriptionStatus)}"></span>
						{client.subscriptionStatus === "past_due" ? "past due" : client.subscriptionStatus}
					</span>
				</div>

				<div class="detail-fields">
					<div class="detail-field">
						<span class="detail-label">email</span>
						<span class="detail-value">{client.email}</span>
					</div>
					<div class="detail-field">
						<span class="detail-label">site url</span>
						<a class="detail-link" href={client.siteUrl} target="_blank" rel="noopener noreferrer">{client.siteUrl}</a>
					</div>
					{#if client.adminEmails?.length > 0}
						<div class="detail-field">
							<span class="detail-label">admin emails</span>
							<span class="detail-value">{client.adminEmails.join(", ")}</span>
						</div>
					{/if}
					<div class="detail-field">
						<span class="detail-label">added</span>
						<span class="detail-value">{formatTimestampDate(client._creationTime)}</span>
					</div>
					{#if client.notes}
						<div class="detail-field">
							<span class="detail-label">notes</span>
							<span class="detail-value detail-notes">{client.notes}</span>
						</div>
					{/if}
				</div>

				<!-- Quick tier toggle -->
				<div class="detail-status-row">
					<span class="detail-label">tier</span>
					<div class="status-buttons">
						<button
							class="status-btn"
							class:active={client.tier === "basic"}
							style={client.tier === "basic" ? "color: var(--admin-text); border-color: var(--admin-text-muted)" : ""}
							onclick={ontiertoggle}
						>
							basic
						</button>
						<button
							class="status-btn"
							class:active={client.tier === "full"}
							style={client.tier === "full" ? "color: var(--admin-accent-hover); border-color: var(--admin-accent)" : ""}
							onclick={ontiertoggle}
						>
							full
						</button>
					</div>
				</div>

				<!-- Quick subscription status -->
				<div class="detail-status-row">
					<span class="detail-label">subscription</span>
					<div class="status-buttons">
						{#each allSubscriptionStatuses as s}
							<button
								class="status-btn"
								class:active={client.subscriptionStatus === s}
								style={client.subscriptionStatus === s ? `color: ${getSubscriptionColor(s)}; border-color: ${getSubscriptionColor(s)}` : ""}
								onclick={() => onstatusupdate(s)}
							>
								{s === "past_due" ? "past due" : s}
							</button>
						{/each}
					</div>
				</div>

				<div class="modal-actions detail-actions">
					<button class="btn-save" onclick={startEdit}>edit</button>
				</div>
			</div>
		{/if}
	</AdminModal>
{/if}

<style>
	/* Form */
	.modal-form {
		padding: 0 28px 28px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-label {
		font-size: 0.76rem;
		color: var(--admin-text-muted);
		font-weight: 400;
		letter-spacing: 0.02em;
	}

	.required {
		color: var(--status-rose);
	}

	.form-input {
		padding: 8px 10px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-input:focus {
		border-color: var(--admin-accent);
	}

	.form-textarea {
		resize: vertical;
		min-height: 60px;
		font-family: inherit;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 6px;
	}

	.btn-cancel,
	.btn-save {
		padding: 7px 16px;
		border-radius: 6px;
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, opacity 0.15s;
		border: 1px solid transparent;
	}

	.btn-cancel {
		background: transparent;
		color: var(--admin-text-muted);
		border-color: var(--admin-border-strong);
	}

	.btn-cancel:hover {
		color: var(--admin-text);
	}

	.btn-save {
		background: rgba(129, 140, 248, 0.15);
		border-color: rgba(129, 140, 248, 0.25);
		color: var(--admin-accent-hover);
		font-weight: 500;
	}

	.btn-save:hover {
		background: rgba(129, 140, 248, 0.22);
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Detail view */
	.detail-body {
		padding: 0 28px 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.detail-meta-line {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
	}

	.meta-sep {
		color: var(--admin-text-subtle);
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-label {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
		font-weight: 400;
	}

	.detail-value {
		font-size: 0.88rem;
		color: var(--admin-heading);
	}

	.detail-notes {
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.detail-link {
		font-size: 0.88rem;
		color: var(--admin-accent);
		text-decoration: none;
	}

	.detail-link:hover {
		text-decoration: underline;
	}

	.detail-status-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}

	.status-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.status-btn {
		padding: 4px 10px;
		border-radius: 5px;
		font-size: 0.72rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		background: transparent;
		color: var(--admin-text-muted);
		border: 1px solid var(--admin-border);
		transition: all 0.15s;
	}

	.status-btn:hover {
		border-color: var(--admin-border-strong);
		color: var(--admin-text);
	}

	.status-btn.active {
		background: rgba(255, 255, 255, 0.05);
	}

	.detail-actions {
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	/* Tier text */
	.tier-text {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.tier-full {
		color: var(--admin-accent-hover);
	}

	/* Status indicators */
	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--admin-text-muted);
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-form {
			padding: 0 20px 20px;
		}

		.detail-body {
			padding: 0 20px 20px;
		}
	}
</style>
