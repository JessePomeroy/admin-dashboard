<script lang="ts">
	import EmailTemplateFields from "./EmailTemplateFields.svelte";
	import AdminModal from "../../components/AdminModal.svelte";
	import { parseEmailTemplateVariables } from "../../emailTemplatePreview";

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
		const variables = parseEmailTemplateVariables(formVariables);
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
			<EmailTemplateFields mode="create" {categories}
				bind:name={formName} bind:category={formCategory}
				bind:subject={formSubject} bind:body={formBody} bind:variables={formVariables}
			/>

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
		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
