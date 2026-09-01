<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import EmailPreview from "../../components/EmailPreview.svelte";
import {
	buildDocumentEmailCreateFields,
	type DocumentEmailSource,
	isCompleteDocumentEmailSource,
} from "../../documentEmailComposition";
import { logger } from "../../logger";
import { addToast } from "../../toast";
import type { Client, ContractTemplate, EmailTemplate } from "../../types";
import { dollarsToCents } from "../../utils";

interface Props {
	clients: Client[];
	templates: ContractTemplate[];
	emailTemplates: EmailTemplate[];
	onsave: (payload: Record<string, unknown>) => Promise<void>;
	onsaveandsend: (payload: Record<string, unknown> & { emailTemplateId?: string; emailSubject?: string; emailBody?: string }) => Promise<void>;
	onclose: () => void;
}

let { clients, templates, emailTemplates, onsave, onsaveandsend, onclose }: Props = $props();

let formTitle = $state("");
let formClientId = $state("");
let formCategory = $state<"photography" | "web">("photography");
let formTemplateId = $state("");
let formBody = $state("");
let formEventDate = $state("");
let formEventLocation = $state("");
let formTotalPrice = $state(0);
let formDepositAmount = $state(0);
let saving = $state(false);
let selectedTemplateId = $state<string>("");
let editedSubject = $state("");
let editedBody = $state("");
let customEmailContent = $state<DocumentEmailSource | undefined>();
let customEmailContentValid = $derived(
	isCompleteDocumentEmailSource(customEmailContent),
);

let selectedClientName = $derived(
	clients.find((c) => c._id === formClientId)?.name ?? "",
);

let emailVariables = $derived<Record<string, string>>({
	clientName: selectedClientName,
	title: formTitle,
	eventDate: formEventDate,
	eventLocation: formEventLocation,
	totalPrice: formTotalPrice > 0 ? `$${formTotalPrice.toFixed(2)}` : "",
	depositAmount: formDepositAmount > 0 ? `$${formDepositAmount.toFixed(2)}` : "",
});

const defaultEmailSubject = "contract: {{title}}";
const defaultEmailBody = `hi {{clientName}},

a contract has been prepared for your review.

please review the details and reach out with any questions.

angel's rest`;

function onTemplateSelect() {
	if (!formTemplateId) return;
	const tpl = templates.find((t) => t._id === formTemplateId);
	if (tpl) {
		formBody = tpl.body;
	}
}

async function handleSubmit() {
	if (!formTitle || !formClientId || !formBody) return;
	saving = true;
	try {
		const payload: Record<string, unknown> = {
			title: formTitle,
			clientId: formClientId,
			category: formCategory,
			body: formBody,
		};
		if (formTemplateId) payload.templateId = formTemplateId;
		if (formEventDate) payload.eventDate = formEventDate;
		if (formEventLocation) payload.eventLocation = formEventLocation;
		if (formTotalPrice > 0) payload.totalPrice = dollarsToCents(formTotalPrice);
		if (formDepositAmount > 0)
			payload.depositAmount = dollarsToCents(formDepositAmount);
		await onsave(payload);
	} finally {
		saving = false;
	}
}

async function handleSaveAndSend() {
	if (!formTitle || !formClientId || !formBody) return;
	if (!customEmailContentValid) {
		addToast("Add both a subject and body before sending.");
		return;
	}
	saving = true;
	try {
		const payload: Record<string, unknown> & { emailTemplateId?: string } = {
			title: formTitle,
			clientId: formClientId,
			category: formCategory,
			body: formBody,
		};
		if (formTemplateId) payload.templateId = formTemplateId;
		if (formEventDate) payload.eventDate = formEventDate;
		if (formEventLocation) payload.eventLocation = formEventLocation;
		if (formTotalPrice > 0) payload.totalPrice = dollarsToCents(formTotalPrice);
		if (formDepositAmount > 0)
			payload.depositAmount = dollarsToCents(formDepositAmount);
		Object.assign(
			payload,
			buildDocumentEmailCreateFields(
				{
					templateId: selectedTemplateId || undefined,
					customContent: customEmailContent,
				},
				"emailTemplateId",
			),
		);
		await onsaveandsend(payload);
	} catch (error) {
		logger.error("Failed to create and send contract:", error);
		addToast("Failed to send contract.");
	} finally {
		saving = false;
	}
}
</script>

<AdminModal title="new contract" onclose={onclose} size="full">
	<div class="modal-split">
	<form
		class="modal-form"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<div class="form-group">
			<label class="form-label" for="create-title"
				>title <span class="required">*</span></label
			>
			<input
				id="create-title"
				class="form-input"
				type="text"
				placeholder="e.g. wedding photography contract"
				bind:value={formTitle}
				required
			/>
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="form-label" for="create-client"
					>client <span class="required">*</span></label
				>
				<select
					id="create-client"
					class="form-input"
					bind:value={formClientId}
					required
				>
					<option value="">select client...</option>
					{#each clients as client (client._id)}
						<option value={client._id}>{client.name}</option>
					{/each}
				</select>
			</div>
			<div class="form-group">
				<label class="form-label" for="create-category">category</label
				>
				<select
					id="create-category"
					class="form-input"
					bind:value={formCategory}
				>
					<option value="photography">photography</option>
					<option value="web">web</option>
				</select>
			</div>
		</div>

		<div class="form-group">
			<label class="form-label" for="create-template">template</label>
			<select
				id="create-template"
				class="form-input"
				bind:value={formTemplateId}
				onchange={onTemplateSelect}
			>
				<option value="">none</option>
				{#each templates as tpl (tpl._id)}
					<option value={tpl._id}>{tpl.name}</option>
				{/each}
			</select>
		</div>

		<div class="form-group">
			<label class="form-label" for="create-body"
				>body <span class="required">*</span></label
			>
			<textarea
				id="create-body"
				class="form-input form-textarea form-textarea-large"
				bind:value={formBody}
				rows="10"
				placeholder={"contract text... use {{clientName}}, {{eventDate}}, {{totalPrice}} as template variables"}
				required
			></textarea>
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="form-label" for="create-event-date"
					>event date</label
				>
				<input
					id="create-event-date"
					class="form-input"
					type="date"
					bind:value={formEventDate}
				/>
			</div>
			<div class="form-group">
				<label class="form-label" for="create-event-location"
					>event location</label
				>
				<input
					id="create-event-location"
					class="form-input"
					type="text"
					placeholder="e.g. portland, or"
					bind:value={formEventLocation}
				/>
			</div>
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="form-label" for="create-total-price"
					>total price ($)</label
				>
				<input
					id="create-total-price"
					class="form-input"
					type="number"
					min="0"
					step="0.01"
					bind:value={formTotalPrice}
				/>
			</div>
			<div class="form-group">
				<label class="form-label" for="create-deposit"
					>deposit amount ($)</label
				>
				<input
					id="create-deposit"
					class="form-input"
					type="number"
					min="0"
					step="0.01"
					bind:value={formDepositAmount}
				/>
			</div>
		</div>

		<div class="modal-actions">
			<button type="button" class="btn-cancel" onclick={onclose}
				>cancel</button
			>
			<button
				type="submit"
				class="btn-save-draft"
				disabled={saving || !formTitle || !formClientId || !formBody}
			>
				{saving ? "saving..." : "save as draft"}
			</button>
			<button
				type="button"
				class="btn-save"
				onclick={handleSaveAndSend}
				disabled={saving || !formTitle || !formClientId || !formBody || !customEmailContentValid}
			>
				{saving ? "sending..." : "save & send"}
			</button>
		</div>
	</form>

	<div class="preview-side">
		<EmailPreview
				templates={emailTemplates}
				variables={emailVariables}
				defaultSubject={defaultEmailSubject}
				defaultBody={defaultEmailBody}
				{selectedTemplateId}
				ontemplateidchange={(id) => { selectedTemplateId = id; }}
				onsubjectchange={(s) => { editedSubject = s; }}
				onbodychange={(b) => { editedBody = b; }}
				oncustomcontentchange={(content) => { customEmailContent = content; }}
				{editedSubject}
				{editedBody}
		/>
	</div>
	</div>
</AdminModal>

<style>
	.modal-split {
		display: flex;
		gap: 0;
		min-height: 0;
	}

	.preview-side {
		flex: 0 0 380px;
		padding: 0 28px 28px 0;
		border-left: 1px solid var(--admin-border);
		padding-left: 28px;
		display: flex;
		flex-direction: column;
	}

	.modal-form {
		flex: 1;
		min-width: 0;
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

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 6px;
	}

	.btn-cancel,
	.btn-save,
	.btn-save-draft {
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

	.btn-save-draft {
		background: transparent;
		color: var(--admin-text-muted);
		border-color: var(--admin-border-strong);
	}

	.btn-save-draft:hover {
		color: var(--admin-text);
		border-color: var(--admin-text-muted);
	}

	.btn-save-draft:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
		.modal-split {
			flex-direction: column;
		}

		.preview-side {
			flex: none;
			border-left: none;
			border-top: 1px solid var(--admin-border);
			padding: 20px;
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
