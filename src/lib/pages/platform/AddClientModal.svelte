<script lang="ts">
	let { isOpen, saving, onclose, onsave } = $props<{
		isOpen: boolean;
		saving: boolean;
		onclose: () => void;
		onsave: (data: {
			name: string;
			email: string;
			siteUrl: string;
			sanityProjectId?: string;
			tier: "basic" | "full";
			subscriptionStatus: string;
			adminEmails: string[];
			notes?: string;
		}) => void;
	}>();

	let formName = $state("");
	let formEmail = $state("");
	let formSiteUrl = $state("");
	let formSanityProjectId = $state("");
	let formTier = $state<"basic" | "full">("basic");
	let formSubscriptionStatus = $state<
		"none" | "active" | "canceled" | "past_due"
	>("none");
	let formAdminEmails = $state("");
	let formNotes = $state("");

	const allTiers = ["basic", "full"] as const;
	const allSubscriptionStatuses = [
		"none",
		"active",
		"canceled",
		"past_due",
	] as const;

	function resetForm() {
		formName = "";
		formEmail = "";
		formSiteUrl = "";
		formSanityProjectId = "";
		formTier = "basic";
		formSubscriptionStatus = "none";
		formAdminEmails = "";
		formNotes = "";
	}

	function handleClose() {
		resetForm();
		onclose();
	}

	function handleSubmit() {
		if (!formName || !formEmail || !formSiteUrl) return;
		const adminEmails = formAdminEmails
			.split(",")
			.map((e) => e.trim())
			.filter(Boolean);
		if (adminEmails.length === 0) adminEmails.push(formEmail);
		onsave({
			name: formName,
			email: formEmail,
			siteUrl: formSiteUrl,
			sanityProjectId: formSanityProjectId || undefined,
			tier: formTier,
			subscriptionStatus: formSubscriptionStatus,
			adminEmails,
			notes: formNotes || undefined,
		});
		resetForm();
	}
</script>

{#if isOpen}
	<div class="modal-overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Add platform client" onclick={handleClose} onkeydown={(e) => { if (e.key === "Escape") handleClose(); }}>
		<div class="modal-content" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2 class="modal-title">add platform client</h2>
				<button class="modal-close" aria-label="Close" onclick={handleClose}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</button>
			</div>

			<form class="modal-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="form-group">
					<label class="form-label" for="add-name">name <span class="required">*</span></label>
					<input id="add-name" class="form-input" type="text" bind:value={formName} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="add-email">email <span class="required">*</span></label>
					<input id="add-email" class="form-input" type="email" bind:value={formEmail} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="add-site">site url <span class="required">*</span></label>
					<input id="add-site" class="form-input" type="text" placeholder="example.com" bind:value={formSiteUrl} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="add-sanity">sanity project id</label>
					<input id="add-sanity" class="form-input" type="text" bind:value={formSanityProjectId} />
				</div>
				<div class="form-row">
					<div class="form-group">
						<label class="form-label" for="add-tier">tier</label>
						<select id="add-tier" class="form-input" bind:value={formTier}>
							{#each allTiers as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</div>
					<div class="form-group">
						<label class="form-label" for="add-status">subscription status</label>
						<select id="add-status" class="form-input" bind:value={formSubscriptionStatus}>
							{#each allSubscriptionStatuses as s}
								<option value={s}>{s === "past_due" ? "past due" : s}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="form-group">
					<label class="form-label" for="add-admin-emails">invited admin emails <span class="form-hint">(comma-separated)</span></label>
					<input id="add-admin-emails" class="form-input" type="text" placeholder="email1@example.com, email2@example.com" bind:value={formAdminEmails} />
					<p class="form-hint">leave blank to use the client email. invited admins claim access with their verified Google account.</p>
				</div>
				<div class="form-group">
					<label class="form-label" for="add-notes">notes</label>
					<textarea id="add-notes" class="form-input form-textarea" bind:value={formNotes} rows="3" placeholder="additional notes..."></textarea>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn-cancel" onclick={handleClose}>cancel</button>
					<button type="submit" class="btn-save" disabled={saving || !formName || !formEmail || !formSiteUrl}>
						{saving ? "saving..." : "save client"}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		padding: 1rem;
	}

	.modal-content {
		background: var(--admin-bg);
		border: 1px solid var(--admin-border);
		border-radius: 12px;
		width: 100%;
		max-width: 540px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 28px 20px;
	}

	.modal-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--admin-text-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: color 0.15s;
	}

	.modal-close:hover {
		color: var(--admin-heading);
	}

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

	.form-hint {
		color: var(--admin-text-subtle);
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

	/* Responsive */
	@media (max-width: 768px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-content {
			max-width: 100%;
		}

		.modal-overlay {
			align-items: flex-end;
			padding: 0;
		}

		.modal-content {
			border-radius: 12px 12px 0 0;
		}

		.modal-header {
			padding: 20px 20px 16px;
		}

		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
