<script lang="ts">
	import { emailTemplateVariablesForCategory, getVariableHighlightParts } from "../../emailTemplatePreview";

	let { mode, categories, name = $bindable(), category = $bindable(), subject = $bindable(), body = $bindable(), variables = $bindable() } = $props<{
		mode: "create" | "edit";
		categories: readonly string[];
		name: string;
		category: string;
		subject: string;
		body: string;
		variables: string;
	}>();
	let referenceVariables = $derived(emailTemplateVariablesForCategory(category));
</script>

<div class="form-row">
	<div class="form-group">
		<label class="form-label" for={`${mode}-name`}>name <span class="required">*</span></label>
		<input id={`${mode}-name`} class="form-input" type="text" placeholder={mode === "create" ? "e.g. wedding inquiry reply" : undefined} bind:value={name} required />
	</div>
	<div class="form-group">
		<label class="form-label" for={`${mode}-category`}>category <span class="required">*</span></label>
		<select id={`${mode}-category`} class="form-input" bind:value={category} required>
			{#each categories as cat}
				<option value={cat}>{cat}</option>
			{/each}
		</select>
	</div>
</div>

<div class="form-group">
	<label class="form-label" for={`${mode}-subject`}>subject line <span class="required">*</span></label>
	<input id={`${mode}-subject`} class="form-input" type="text" placeholder={mode === "create" ? "e.g. re: your photography inquiry" : undefined} bind:value={subject} required />
</div>

<div class="form-group">
	<label class="form-label" for={`${mode}-body`}>body <span class="required">*</span></label>
	<textarea
		id={`${mode}-body`}
		class="form-input form-textarea form-textarea-large"
		bind:value={body}
		rows="10"
		placeholder={mode === "create" ? "hi {{clientName}},\n\nthank you for reaching out..." : undefined}
		required
	></textarea>
</div>

<div class="form-group">
	<label class="form-label" for={`${mode}-variables`}
		>variable notes (comma-separated; does not create runtime values)</label
	>
	<input id={`${mode}-variables`} class="form-input" type="text" placeholder={mode === "create" ? "customField1, customField2" : undefined} bind:value={variables} />
</div>

<div class="variables-ref">
	<span class="variables-ref-label">
		{category === "custom"
			? "sender-specific variable reference (unsupported values fail before send):"
			: "variables for this sender:"}
	</span>
	<div class="variables-ref-list">
		{#each referenceVariables as v}
			<span class="variable-tag">{v}</span>
		{/each}
	</div>
</div>

{#if body}
	<div class="preview-section">
		<span class="preview-label">preview</span>
		<div class="preview-body">
			{#each getVariableHighlightParts(body) as part}
				{#if part.isVariable}
					<span class="var-highlight">{part.text}</span>
				{:else}
					{part.text}
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	@import "../../styles/form-fields.css";
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

	@media (max-width: 768px) {
		.form-row { grid-template-columns: 1fr; }
	}
</style>
