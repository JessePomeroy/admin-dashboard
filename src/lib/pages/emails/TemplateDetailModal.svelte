<script lang="ts">
	import DOMPurify from "isomorphic-dompurify";
	import { getCategoryColor } from "../../utils";

	let { template, saving, categories, onclose, onsave, ondelete } = $props<{
		template: any;
		saving: boolean;
		categories: readonly string[];
		onclose: () => void;
		onsave: (data: { name: string; category: string; subject: string; body: string; variables?: string[] }) => void;
		ondelete: () => void;
	}>();

	const commonVariables = [
		"{{clientName}}",
		"{{clientEmail}}",
		"{{eventDate}}",
		"{{eventLocation}}",
		"{{galleryLink}}",
		"{{invoiceLink}}",
		"{{totalPrice}}",
		"{{depositAmount}}",
		"{{bookingDate}}",
	];

	let editMode = $state(false);
	let confirmDelete = $state(false);

	let editName = $state("");
	let editCategory = $state("inquiry-reply");
	let editSubject = $state("");
	let editBody = $state("");
	let editVariables = $state("");

	function parseVariables(input: string): string[] {
		return input
			.split(",")
			.map((v) => v.trim())
			.filter(Boolean);
	}

	function highlightVariables(text: string): string {
		return text.replace(
			/(\{\{[^}]+\}\})/g,
			'<span class="var-highlight">$1</span>',
		);
	}

	function handleClose() {
		editMode = false;
		confirmDelete = false;
		onclose();
	}

	function startEdit() {
		if (!template) return;
		editName = template.name;
		editCategory = template.category;
		editSubject = template.subject;
		editBody = template.body;
		editVariables = (template.variables || []).join(", ");
		editMode = true;
	}

	function cancelEdit() {
		editMode = false;
	}

	function handleSave() {
		if (!editName || !editSubject || !editBody) return;
		const variables = parseVariables(editVariables);
		onsave({
			name: editName,
			category: editCategory,
			subject: editSubject,
			body: editBody,
			variables: variables.length ? variables : undefined,
		});
		editMode = false;
	}

	function handleDelete() {
		ondelete();
	}
</script>

{#if template}
	<div
		class="modal-overlay"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Email template details"
		onclick={handleClose}
		onkeydown={(e) => { if (e.key === "Escape") handleClose(); }}
	>
		<div
			class="modal-content modal-wide"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-header">
				<h2 class="modal-title">
					{editMode ? "edit template" : template.name}
				</h2>
				<button class="modal-close" aria-label="Close" onclick={handleClose}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</button>
			</div>

			{#if editMode}
				<form
					class="modal-form"
					onsubmit={(e) => { e.preventDefault(); handleSave(); }}
				>
					<div class="form-row">
						<div class="form-group">
							<label class="form-label" for="edit-name">name <span class="required">*</span></label>
							<input id="edit-name" class="form-input" type="text" bind:value={editName} required />
						</div>
						<div class="form-group">
							<label class="form-label" for="edit-category">category <span class="required">*</span></label>
							<select id="edit-category" class="form-input" bind:value={editCategory} required>
								{#each categories as cat}
									<option value={cat}>{cat}</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="form-group">
						<label class="form-label" for="edit-subject">subject line <span class="required">*</span></label>
						<input id="edit-subject" class="form-input" type="text" bind:value={editSubject} required />
					</div>

					<div class="form-group">
						<label class="form-label" for="edit-body">body <span class="required">*</span></label>
						<textarea
							id="edit-body"
							class="form-input form-textarea form-textarea-large"
							bind:value={editBody}
							rows="10"
							required
						></textarea>
					</div>

					<div class="form-group">
						<label class="form-label" for="edit-variables">custom variables (comma-separated)</label>
						<input id="edit-variables" class="form-input" type="text" bind:value={editVariables} />
					</div>

					<div class="variables-ref">
						<span class="variables-ref-label">available variables:</span>
						<div class="variables-ref-list">
							{#each commonVariables as v}
								<span class="variable-tag">{v}</span>
							{/each}
						</div>
					</div>

					{#if editBody}
						<div class="preview-section">
							<span class="preview-label">preview</span>
							<div class="preview-body">{@html DOMPurify.sanitize(highlightVariables(editBody))}</div>
						</div>
					{/if}

					<div class="modal-actions">
						<button type="button" class="btn-cancel" onclick={cancelEdit}>cancel</button>
						<button type="submit" class="btn-save" disabled={saving || !editName || !editSubject || !editBody}>
							{saving ? "saving..." : "save changes"}
						</button>
					</div>
				</form>
			{:else}
				<div class="detail-body">
					<div class="detail-meta-line">
						<span class="category-label" style="color: {getCategoryColor(template.category)}">
							<span class="category-dot" style="background: {getCategoryColor(template.category)}"></span>
							{template.category}
						</span>
					</div>

					<div class="detail-field">
						<span class="detail-label">subject</span>
						<span class="detail-value">{template.subject}</span>
					</div>

					<div class="detail-fields">
						<div class="detail-field">
							<span class="detail-label">body</span>
							<div class="detail-body-text">{@html DOMPurify.sanitize(highlightVariables(template.body))}</div>
						</div>

						{#if template.variables?.length}
							<div class="detail-field">
								<span class="detail-label">custom variables</span>
								<div class="variables-ref-list">
									{#each template.variables as v}
										<span class="variable-tag">{v}</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<div class="modal-actions detail-actions">
						{#if confirmDelete}
							<span class="confirm-text">delete this template?</span>
							<button class="btn-danger" onclick={handleDelete} disabled={saving}>
								{saving ? "deleting..." : "yes, delete"}
							</button>
							<button class="btn-cancel" onclick={() => { confirmDelete = false; }}>no</button>
						{:else}
							<button class="btn-danger-outline" onclick={() => { confirmDelete = true; }}>delete</button>
							<button class="btn-cancel" onclick={startEdit}>edit</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
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

	.modal-wide {
		max-width: 660px;
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

	/* Form styles */
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

	.form-textarea-large {
		min-height: 180px;
		line-height: 1.6;
	}

	/* Variables reference */
	.variables-ref {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.variables-ref-label {
		font-size: 0.74rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.02em;
	}

	.variables-ref-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.variable-tag {
		display: inline-block;
		padding: 3px 8px;
		background: rgba(129, 140, 248, 0.08);
		border: 1px solid rgba(129, 140, 248, 0.15);
		border-radius: 4px;
		font-size: 0.74rem;
		color: var(--admin-accent);
		font-family: "Synonym", monospace;
	}

	/* Preview */
	.preview-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-top: 1px solid var(--admin-border);
		padding-top: 14px;
	}

	.preview-label {
		font-size: 0.74rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.02em;
	}

	.preview-body {
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: 0.85rem;
		color: var(--admin-text);
		max-height: 200px;
		overflow-y: auto;
		padding: 8px 0;
	}

	.preview-body :global(.var-highlight) {
		color: var(--admin-accent);
		background: rgba(129, 140, 248, 0.08);
		padding: 1px 3px;
		border-radius: 3px;
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
		flex-wrap: wrap;
	}

	.category-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
	}

	.category-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: 16px;
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

	.detail-body-text {
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: 0.85rem;
		color: var(--admin-text);
		max-height: 300px;
		overflow-y: auto;
		padding: 12px 0;
	}

	.detail-body-text :global(.var-highlight) {
		color: var(--admin-accent);
		background: rgba(129, 140, 248, 0.08);
		padding: 1px 3px;
		border-radius: 3px;
	}

	/* Actions */
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 6px;
	}

	.btn-cancel,
	.btn-save,
	.btn-danger,
	.btn-danger-outline {
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

	.btn-danger {
		background: rgba(248, 113, 113, 0.15);
		border-color: rgba(248, 113, 113, 0.3);
		color: var(--status-rose);
	}

	.btn-danger:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-danger-outline {
		background: transparent;
		color: var(--status-rose);
		border-color: rgba(248, 113, 113, 0.25);
	}

	.btn-danger-outline:hover {
		background: rgba(248, 113, 113, 0.08);
	}

	.detail-actions {
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.confirm-text {
		font-size: 0.82rem;
		color: var(--status-rose);
		margin-right: auto;
		align-self: center;
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

		.detail-body {
			padding: 0 20px 20px;
		}
	}
</style>
