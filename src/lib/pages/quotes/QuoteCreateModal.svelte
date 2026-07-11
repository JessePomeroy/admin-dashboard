<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import EmailPreview from "../../components/EmailPreview.svelte";
import type { Client, EmailTemplate, QuotePreset } from "../../types";
import { dollarsToCents, formatDollars } from "../../utils";
import PackageEditor from "./PackageEditor.svelte";

interface EditablePackage {
	name: string;
	description: string;
	price: number;
	included: string[];
}

interface Props {
	clients: Client[];
	presets: QuotePreset[];
	numberPreview: string;
	emailTemplates: EmailTemplate[];
	onsave: (data: {
		clientId: string;
		category: string;
		packages: EditablePackage[];
		validUntil: string;
		notes: string;
	}) => Promise<void>;
	onsaveandsend: (data: {
		clientId: string;
		category: string;
		packages: EditablePackage[];
		validUntil: string;
		notes: string;
		templateId?: string;
		emailSubject?: string;
		emailBody?: string;
	}) => Promise<void>;
	onsaveaspreset: (data: {
		name: string;
		category: string;
		packages: EditablePackage[];
	}) => Promise<void>;
	onclose: () => void;
	saving: boolean;
}

let {
	clients,
	presets,
	numberPreview,
	emailTemplates,
	onsave,
	onsaveandsend,
	onsaveaspreset,
	onclose,
	saving,
}: Props = $props();

let formClientId = $state("");
let formCategory = $state<"photography" | "web">("photography");
let formValidUntil = $state("");
let formNotes = $state("");
let formPackages = $state<EditablePackage[]>([
	{ name: "", description: "", price: 0, included: [] },
]);
let newIncludedItem = $state<Record<number, string>>({});
let formPresetId = $state("");
let selectedTemplateId = $state<string>("");
let editedSubject = $state("");
let editedBody = $state("");
let selectedClientName = $derived(
	clients.find((c) => c._id === formClientId)?.name ?? "",
);

let emailVariables = $derived<Record<string, string>>({
	clientName: selectedClientName,
	quoteNumber: "assigned on save",
	validUntil: formValidUntil,
});

const defaultEmailSubject = "quote {{quoteNumber}}";
const defaultEmailBody = `hi {{clientName}},

here is your quote for review.

please reach out if you have any questions or would like to proceed.

angel's rest`;

let createTotal = $derived(
	formPackages.reduce((sum, pkg) => sum + pkg.price, 0),
);

function loadPreset() {
	if (!formPresetId) return;
	const preset = presets.find((p) => p._id === formPresetId);
	if (!preset) return;
	formPackages = preset.packages.map((pkg) => ({
		name: pkg.name || "",
		description: pkg.description || "",
		price: pkg.price / 100,
		included: [...(pkg.included || [])],
	}));
	if (preset.category) {
		formCategory = preset.category as "photography" | "web";
	}
	newIncludedItem = {};
}

async function handleSave() {
	if (!formClientId || formPackages.length === 0) return;
	await onsave({
		clientId: formClientId,
		category: formCategory,
		packages: formPackages,
		validUntil: formValidUntil,
		notes: formNotes,
	});
}

async function handleSaveAndSend() {
	if (!formClientId || formPackages.length === 0) return;
	await onsaveandsend({
		clientId: formClientId,
		category: formCategory,
		packages: formPackages,
		validUntil: formValidUntil,
		notes: formNotes,
		templateId: selectedTemplateId || undefined,
		emailSubject: editedSubject || undefined,
		emailBody: editedBody || undefined,
	});
}

async function handleSaveAsPreset() {
	const name = prompt("preset name:");
	if (!name) return;
	await onsaveaspreset({
		name,
		category: formCategory,
		packages: formPackages,
	});
}
</script>

<AdminModal title="new quote" onclose={onclose} size={emailTemplates.length > 0 ? "full" : "wide"}>
	<div class="modal-split">
	<form class="modal-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
		<div class="form-row">
			<div class="form-group">
				<label class="form-label" for="create-number">quote # preview</label>
				<input id="create-number" class="form-input" type="text" value={numberPreview} readonly />
				<span class="field-note">final number is assigned when saved</span>
			</div>
			<div class="form-group">
				<label class="form-label" for="create-client">client <span class="required">*</span></label>
				<select id="create-client" class="form-input" bind:value={formClientId} required>
					<option value="">select client...</option>
					{#each clients as client (client._id)}
						<option value={client._id}>{client.name}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="form-label" for="create-category">category</label>
				<select id="create-category" class="form-input" bind:value={formCategory}>
					<option value="photography">photography</option>
					<option value="web">web</option>
				</select>
			</div>
			<div class="form-group">
				<label class="form-label" for="create-valid">valid until</label>
				<input id="create-valid" class="form-input" type="date" bind:value={formValidUntil} />
			</div>
		</div>

		<div class="form-group">
			<label class="form-label" for="create-notes">notes</label>
			<textarea id="create-notes" class="form-input form-textarea" bind:value={formNotes} rows="2" placeholder="additional notes..."></textarea>
		</div>

		{#if presets.length > 0}
			<div class="preset-load-row">
				<select class="form-input" bind:value={formPresetId} onchange={loadPreset}>
					<option value="">load preset...</option>
					{#each presets as p (p._id)}
						<option value={p._id}>{p.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<PackageEditor
			packages={formPackages}
			{newIncludedItem}
			priceLabel="price ($)"
			onpackageschange={(pkgs) => { formPackages = pkgs; }}
			onnewincludeditemchange={(items) => { newIncludedItem = items; }}
		/>

		<div class="packages-actions-row">
			<button type="button" class="btn-add-item" onclick={handleSaveAsPreset} disabled={saving || formPackages.length === 0}>save as preset</button>
		</div>

		<div class="totals-line">
			<span class="total-amount">total: {formatDollars(createTotal)}</span>
		</div>

		<div class="modal-actions">
			<button type="button" class="btn-cancel" onclick={onclose}>cancel</button>
			<button type="submit" class="btn-save-draft" disabled={saving || !formClientId || formPackages.length === 0}>
				{saving ? "saving..." : "save as draft"}
			</button>
			<button type="button" class="btn-save" onclick={handleSaveAndSend} disabled={saving || !formClientId || formPackages.length === 0}>
				{saving ? "sending..." : "save & send"}
			</button>
		</div>
	</form>

	{#if emailTemplates.length > 0}
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
				{editedSubject}
				{editedBody}
			/>
		</div>
	{/if}
	</div>
</AdminModal>

<style>
	.modal-split {
		display: flex;
		gap: 0;
		min-height: 0;
	}

	.modal-form {
		flex: 1;
		min-width: 0;
		padding: 0 28px 28px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.preview-side {
		flex: 0 0 380px;
		padding: 0 28px 28px 0;
		border-left: 1px solid var(--admin-border);
		padding-left: 28px;
		display: flex;
		flex-direction: column;
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

	.field-note {
		font-size: 0.72rem;
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

	.preset-load-row {
		margin-bottom: 4px;
	}

	.packages-actions-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
	}

	.totals-line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		padding-top: 4px;
	}

	.total-amount {
		font-weight: 500;
		color: var(--admin-heading);
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

	.btn-add-item {
		background: none;
		border: none;
		color: var(--admin-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		font-family: "Synonym", system-ui, sans-serif;
		padding: 4px 0;
		text-align: left;
		transition: color 0.15s;
	}

	.btn-add-item:hover {
		color: var(--admin-heading);
	}

	.btn-add-item:disabled {
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
			padding: 20px 20px 20px 20px;
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
