<script lang="ts">
interface EmailTemplate {
	_id: string;
	name: string;
	category: string;
	subject: string;
	body: string;
	variables?: string[];
}

interface Props {
	templates: EmailTemplate[];
	variables: Record<string, string>;
	selectedTemplateId: string;
	defaultSubject: string;
	defaultBody: string;
	ontemplateidchange: (id: string) => void;
	onsubjectchange: (subject: string) => void;
	onbodychange: (body: string) => void;
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
	editedSubject,
	editedBody,
}: Props = $props();

// Initialize with default on mount
$effect(() => {
	if (!editedSubject && !editedBody && defaultSubject && defaultBody) {
		onsubjectchange(replaceVars(defaultSubject));
		onbodychange(replaceVars(defaultBody));
	}
});

function replaceVars(text: string): string {
	let result = text;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
	}
	return result;
}

function handleTemplateChange(e: Event) {
	const id = (e.target as HTMLSelectElement).value;
	ontemplateidchange(id);
	if (id) {
		const tpl = templates.find((t) => t._id === id);
		if (tpl) {
			onsubjectchange(replaceVars(tpl.subject));
			onbodychange(replaceVars(tpl.body));
		}
	} else {
		onsubjectchange(replaceVars(defaultSubject));
		onbodychange(replaceVars(defaultBody));
	}
}

function autoGrow(e: Event) {
	const el = e.target as HTMLTextAreaElement;
	el.style.height = "auto";
	el.style.height = el.scrollHeight + "px";
}
</script>

<div class="preview-panel">
	<div class="preview-header">
		<span class="preview-title">email preview</span>
	</div>

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
		<label class="preview-label" for="tpl-subject">subject</label>
		<input
			id="tpl-subject"
			class="preview-input"
			type="text"
			value={editedSubject}
			oninput={(e) => onsubjectchange(e.currentTarget.value)}
		/>
	</div>

	<div class="preview-field preview-body-field">
		<label class="preview-label" for="tpl-body">body</label>
		<textarea
			id="tpl-body"
			class="preview-input preview-body"
			value={editedBody}
			oninput={(e) => { onbodychange(e.currentTarget.value); autoGrow(e); }}
			rows="8"
		></textarea>
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
	}

	.preview-title {
		font-family: "Chillax", sans-serif;
		font-size: 0.92rem;
		font-weight: 500;
		color: var(--admin-heading);
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

	.preview-body {
		flex: 1;
		resize: none;
		overflow: hidden;
		min-height: 180px;
		line-height: 1.5;
		white-space: pre-wrap;
		font-family: inherit;
	}

	.preview-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 32px 16px;
		color: var(--admin-text-subtle);
		font-size: 0.84rem;
		text-align: center;
	}

	.preview-empty p {
		margin: 0;
	}

	.preview-hint {
		font-size: 0.76rem;
		opacity: 0.7;
	}
</style>
