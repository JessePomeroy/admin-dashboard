<script lang="ts">
import {
	type DocumentEmailSource,
	isCompleteDocumentEmailSource,
	renderDocumentEmailSource,
	resolveDocumentEmailSource,
	updateDocumentEmailCustomization,
} from "../documentEmailComposition";
import type { EmailTemplate } from "../types";

interface Props {
	templates: EmailTemplate[];
	variables: Record<string, string>;
	selectedTemplateId: string;
	defaultSubject: string;
	defaultBody: string;
	ontemplateidchange: (id: string) => void;
	onsubjectchange: (subject: string) => void;
	onbodychange: (body: string) => void;
	oncustomcontentchange?: (content: DocumentEmailSource | undefined) => void;
	editedSubject: string;
	editedBody: string;
}

let {
	templates,
	variables,
	selectedTemplateId,
	defaultSubject,
	defaultBody,
	ontemplateidchange,
	onsubjectchange,
	onbodychange,
	oncustomcontentchange,
	editedSubject,
	editedBody,
}: Props = $props();

let editingSource = $state(false);
let localCustomContent = $state<DocumentEmailSource | undefined>();

let baseSource = $derived(
	resolveDocumentEmailSource({
		templates,
		selectedTemplateId,
		defaultSubject,
		defaultBody,
	}),
);
let externalCustomContent = $derived(
	editedSubject || editedBody
		? { subject: editedSubject, body: editedBody }
		: undefined,
);
let customContent = $derived(localCustomContent ?? externalCustomContent);
let customContentValid = $derived(isCompleteDocumentEmailSource(customContent));
let source = $derived(customContent ?? baseSource);
let rendered = $derived(renderDocumentEmailSource(source, variables));
let generatedDefault = $derived(selectedTemplateId === "" && customContent === undefined);

function publishCustomContent(content: DocumentEmailSource | undefined) {
	localCustomContent = content;
	onsubjectchange(content?.subject ?? "");
	onbodychange(content?.body ?? "");
	oncustomcontentchange?.(content);
}

function handleTemplateChange(e: Event) {
	const id = (e.target as HTMLSelectElement).value;
	ontemplateidchange(id);
	editingSource = false;
	publishCustomContent(undefined);
}

function resetCustomization() {
	editingSource = false;
	publishCustomContent(undefined);
}

function handleSourceChange(field: keyof DocumentEmailSource, value: string) {
	publishCustomContent(
		updateDocumentEmailCustomization(baseSource, customContent, field, value),
	);
}

function autoGrow(e: Event) {
	const el = e.target as HTMLTextAreaElement;
	el.style.height = "auto";
	el.style.height = el.scrollHeight + "px";
}
</script>

<div class="preview-panel">
	<div class="preview-header">
		<span class="preview-title">{generatedDefault ? "generated email outline" : "email preview"}</span>
		<div class="preview-actions">
			{#if customContent}
				<button type="button" class="preview-action" onclick={resetCustomization}>
					reset edits
				</button>
			{/if}
			<button type="button" class="preview-action" onclick={() => { editingSource = !editingSource; }}>
				{editingSource ? "preview" : generatedDefault ? "write custom email" : "edit source"}
			</button>
		</div>
	</div>
	{#if generatedDefault && editingSource}
		<p class="preview-note preview-warning" role="status">
			editing this outline replaces the generated layout with a custom email. the secure portal action is still added automatically.
		</p>
	{:else if generatedDefault}
		<p class="preview-note">
			the final generated email also includes the document details, totals, and secure portal action. this outline is not its editable source.
		</p>
	{:else}
		<p class="preview-note">preview values are for reference; final document details are filled after saving.</p>
	{/if}

	<div class="preview-field">
		<label class="preview-label" for="tpl-select">template</label>
		<select id="tpl-select" class="preview-input" value={selectedTemplateId} onchange={handleTemplateChange}>
			<option value="">default email</option>
			{#each templates as t}
				<option value={t._id}>{t.name}</option>
			{/each}
		</select>
	</div>

	<div class="preview-field">
		<label class="preview-label" for="tpl-subject">{editingSource ? "subject source" : "subject"}</label>
		<input
			id="tpl-subject"
			class="preview-input"
			type="text"
			value={editingSource ? source.subject : rendered.subject}
			readonly={!editingSource}
			aria-invalid={!customContentValid}
			oninput={(e) => handleSourceChange("subject", e.currentTarget.value)}
		/>
	</div>

	<div class="preview-field preview-body-field">
		<label class="preview-label" for="tpl-body">{editingSource ? "body source" : "body"}</label>
		<textarea
			id="tpl-body"
			class="preview-input preview-body"
			value={editingSource ? source.body : rendered.body}
			readonly={!editingSource}
			aria-invalid={!customContentValid}
			oninput={(e) => { handleSourceChange("body", e.currentTarget.value); autoGrow(e); }}
			rows="8"
		></textarea>
		{#if !customContentValid}
			<p class="preview-error" role="alert">custom subject and body are both required.</p>
		{/if}
	</div>
</div>

<style>
	.preview-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.preview-title {
		font-family: "Chillax", sans-serif;
		font-size: 0.92rem;
		font-weight: 500;
		color: var(--admin-heading);
	}

	.preview-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.preview-action {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--admin-text-muted);
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.preview-action:hover,
	.preview-action:focus-visible {
		color: var(--admin-heading);
	}

	.preview-action:focus-visible {
		outline: 1px solid var(--admin-accent);
		outline-offset: 3px;
	}

	.preview-note {
		margin: -4px 0 2px;
		color: var(--admin-text-subtle);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.preview-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-body-field {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.preview-label {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		letter-spacing: 0.04em;
		font-weight: 400;
	}

	.preview-input {
		padding: 8px 10px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--admin-text);
		border: 1px solid var(--admin-border);
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.preview-input:focus {
		border-color: var(--admin-accent);
	}

	.preview-input[readonly] {
		cursor: default;
		border-color: transparent;
		background: rgba(255, 255, 255, 0.018);
	}

	.preview-body {
		flex: 1;
		resize: none;
		overflow: hidden;
		min-height: 180px;
		line-height: 1.5;
		white-space: pre-wrap;
		font-family: inherit;
	}

	.preview-error {
		margin: 2px 0 0;
		color: var(--admin-error, #d69a92);
		font-size: 0.72rem;
		line-height: 1.4;
	}

</style>
