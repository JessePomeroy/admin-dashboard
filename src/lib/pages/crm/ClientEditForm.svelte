<script lang="ts">
import { CLIENT_STATUSES } from "../../constants";
import type { Client, ClientCategory } from "../../types";
import { formatStatus } from "../../utils";

interface Props {
	client: Client;
	saving: boolean;
	onsave: (data: Record<string, string | undefined>) => void;
	oncancel: () => void;
}

let { client, saving, onsave, oncancel }: Props = $props();

let formName = $state("");
let formEmail = $state("");
let formPhone = $state("");
let formCategory = $state<ClientCategory>("photography");
let formType = $state("");
let formClientWebsite = $state("");
let formSource = $state("");
let formNotes = $state("");
let formStatus = $state("lead");
let loadedClientId = $state<string | null>(null);

$effect(() => {
	if (loadedClientId === client._id) return;
	loadedClientId = client._id;
	formName = client.name || "";
	formEmail = client.email || "";
	formPhone = client.phone || "";
	formCategory = (client.category as ClientCategory) || "photography";
	formType = client.type || "";
	formClientWebsite = client.siteUrl_client || "";
	formSource = client.source || "";
	formNotes = client.notes || "";
	formStatus = client.status || "lead";
});

const photographyTypes = [
	"wedding",
	"portrait",
	"family",
	"commercial",
	"event",
];
const webTypes = ["website", "redesign", "maintenance", "other"];
const sources = ["referral", "instagram", "website", "word of mouth", "other"];

function formatType(type: string) {
	return type.charAt(0).toUpperCase() + type.slice(1);
}

function handleSave() {
	if (!formName || !formCategory) return;
	const body: Record<string, string | undefined> = {
		name: formName,
		category: formCategory,
		email: formEmail || undefined,
		phone: formPhone || undefined,
		type: formType || undefined,
		source: formSource || undefined,
		notes: formNotes || undefined,
		status: formStatus,
	};
	if (formCategory === "web") {
		body.siteUrl_client = formClientWebsite || undefined;
	}
	onsave(body);
}
</script>

<form class="modal-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
	<div class="form-group">
		<label class="form-label" for="edit-name">name <span class="required">*</span></label>
		<input id="edit-name" class="form-input" type="text" bind:value={formName} required />
	</div>
	<div class="form-row">
		<div class="form-group">
			<label class="form-label" for="edit-email">email</label>
			<input id="edit-email" class="form-input" type="email" bind:value={formEmail} />
		</div>
		<div class="form-group">
			<label class="form-label" for="edit-phone">phone</label>
			<input id="edit-phone" class="form-input" type="tel" bind:value={formPhone} />
		</div>
	</div>
	<div class="form-row">
		<div class="form-group">
			<label class="form-label" for="edit-category">category <span class="required">*</span></label>
			<select id="edit-category" class="form-input" bind:value={formCategory} onchange={() => { formType = ""; }}>
				<option value="photography">photography</option>
				<option value="web">web</option>
			</select>
		</div>
		<div class="form-group">
			<label class="form-label" for="edit-type">type</label>
			<select id="edit-type" class="form-input" bind:value={formType}>
				<option value="">select type...</option>
				{#each formCategory === "photography" ? photographyTypes : webTypes as t}
					<option value={t}>{formatType(t)}</option>
				{/each}
			</select>
		</div>
	</div>
	{#if formCategory === "web"}
		<div class="form-group">
			<label class="form-label" for="edit-website">client website</label>
			<input id="edit-website" class="form-input" type="url" placeholder="https://" bind:value={formClientWebsite} />
		</div>
	{/if}
	<div class="form-row">
		<div class="form-group">
			<label class="form-label" for="edit-source">source</label>
			<select id="edit-source" class="form-input" bind:value={formSource}>
				<option value="">select source...</option>
				{#each sources as s}
					<option value={s}>{formatType(s)}</option>
				{/each}
			</select>
		</div>
		<div class="form-group">
			<label class="form-label" for="edit-status">status</label>
			<select id="edit-status" class="form-input" bind:value={formStatus}>
				{#each CLIENT_STATUSES as s}
					<option value={s}>{formatStatus(s)}</option>
				{/each}
			</select>
		</div>
	</div>
	<div class="form-group">
		<label class="form-label" for="edit-notes">notes</label>
		<textarea id="edit-notes" class="form-input form-textarea" bind:value={formNotes} rows="3"></textarea>
	</div>
	<div class="modal-actions">
		<button type="button" class="btn-cancel" onclick={oncancel}>cancel</button>
		<button type="submit" class="btn-save" disabled={saving || !formName}>
			{saving ? "saving..." : "save changes"}
		</button>
	</div>
</form>

<style>
	@import "../../styles/form-fields.css";
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

	.required {
		color: var(--status-rose);
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

	@media (max-width: 768px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.modal-form {
			padding: 0 20px 20px;
		}
	}
</style>
