<script lang="ts">
	import AdminModal from "../../components/AdminModal.svelte";
	import {
		emailTemplateVariablesForCategory,
		getVariableHighlightParts,
	} from "../../emailTemplatePreview";

	let { isOpen, saving, categories, onclose, onsave } = $props<{
		isOpen: boolean;
		saving: boolean;
		categories: readonly string[];
		onclose: () => void;
		onsave: (data: { name: string; category: string; subject: string; body: string; variables?: string[] }) => void;
	}>();

	let formName = $state("");
	let formCategory = $state("inquiry-reply");
	let formSubject = $state("");
	let formBody = $state("");
	let formVariables = $state("");
	let referenceVariables = $derived(
		emailTemplateVariablesForCategory(formCategory),
	);

	function parseVariables(input: string): string[] {
		return input
			.split(",")
			.map((v) => v.trim())
			.filter(Boolean);
	}


	function resetForm() {
		formName = "";
		formCategory = "inquiry-reply";
		formSubject = "";
		formBody = "";
		formVariables = "";
	}

	function handleClose() {
		resetForm();
		onclose();
	}

	function handleSubmit() {
		if (!formName || !formCategory || !formSubject || !formBody) return;
		const variables = parseVariables(formVariables);
		onsave({
			name: formName,
			category: formCategory,
			subject: formSubject,
			body: formBody,
			variables: variables.length ? variables : undefined,
		});
		resetForm();
	}
</script>

{#if isOpen}
	<AdminModal
		title="new email template"
		ariaLabel="Create email template"
		onclose={handleClose}
		--admin-modal-max-width="660px"
		--admin-modal-mobile-max-height="90vh"
		--admin-modal-mobile-header-padding="20px 20px 16px"
	>
		<form
			class="modal-form"
			onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
		>
			<div class="form-row">
				<div class="form-group">
					<label class="form-label" for="create-name">name <span class="required">*</span></label>
					<input id="create-name" class="form-input" type="text" placeholder="e.g. wedding inquiry reply" bind:value={formName} required />
				</div>
				<div class="form-group">
					<label class="form-label" for="create-category">category <span class="required">*</span></label>
					<select id="create-category" class="form-input" bind:value={formCategory} required>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="form-group">
				<label class="form-label" for="create-subject">subject line <span class="required">*</span></label>
				<input id="create-subject" class="form-input" type="text" placeholder="e.g. re: your photography inquiry" bind:value={formSubject} required />
			</div>

			<div class="form-group">
				<label class="form-label" for="create-body">body <span class="required">*</span></label>
				<textarea
					id="create-body"
					class="form-input form-textarea form-textarea-large"
					bind:value={formBody}
					rows="10"
					placeholder={"hi {{clientName}},\n\nthank you for reaching out..."}
					required
				></textarea>
			</div>

			<div class="form-group">
				<label class="form-label" for="create-variables"
					>variable notes (comma-separated; does not create runtime values)</label
				>
				<input id="create-variables" class="form-input" type="text" placeholder="customField1, customField2" bind:value={formVariables} />
			</div>

			<div class="variables-ref">
				<span class="variables-ref-label">
					{formCategory === "custom"
						? "sender-specific variable reference (unsupported values fail before send):"
						: "variables for this sender:"}
				</span>
				<div class="variables-ref-list">
					{#each referenceVariables as v}
						<span class="variable-tag">{v}</span>
					{/each}
				</div>
			</div>

			{#if formBody}
				<div class="preview-section">
					<span class="preview-label">preview</span>
					<div class="preview-body">
						{#each getVariableHighlightParts(formBody) as part}
							{#if part.isVariable}
								<span class="var-highlight">{part.text}</span>
							{:else}
								{part.text}
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			<div class="modal-actions">
				<button type="button" class="btn-cancel" onclick={handleClose}>cancel</button>
				<button type="submit" class="btn-save" disabled={saving || !formName || !formSubject || !formBody}>
					{saving ? "saving..." : "create template"}
				</button>
			</div>
		</form>
	</AdminModal>
{/if}

<style>
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

	@media (max-width: 768px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
