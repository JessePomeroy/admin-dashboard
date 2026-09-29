<script lang="ts">
let {
	id,
	label = "URL name",
	value,
	maxLength,
	onChange,
	onGenerate,
	generateDisabled = false,
	disabled = false,
	invalid = false,
	error,
	help = "Lowercase words separated by hyphens.",
	prefix = "",
}: {
	id: string;
	label?: string;
	value: string;
	maxLength: number;
	onChange: (value: string) => void;
	onGenerate?: () => void;
	generateDisabled?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	error?: string;
	help?: string;
	prefix?: string;
} = $props();
</script>

<div class="editor-slug-field">
	<div class="field-heading">
		<label for={id}>{label}</label>
		{#if onGenerate}<button type="button" class="generate-url" onclick={onGenerate} disabled={generateDisabled}>generate url</button>{/if}
	</div>
	<div class="slug-input">
		{#if prefix}<span aria-hidden="true">{prefix}</span>{/if}
		<input {id} {disabled} maxlength={maxLength} {value} oninput={(event) => onChange(event.currentTarget.value)} autocomplete="off" spellcheck="false" aria-invalid={invalid || Boolean(error)} aria-describedby={help ? `${id}-help` : undefined} />
	</div>
	{#if help}<small id={`${id}-help`}>{help}</small>{/if}
	{#if error}<small class="field-error">{error}</small>{/if}
</div>

<style>
.editor-slug-field { display: grid; gap: 6px; min-width: 0; color: var(--admin-text-muted); font-size: .7rem; }
.field-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; }
label { color: var(--admin-text-muted); }
.slug-input { display: flex; align-items: center; min-width: 0; gap: 7px; }
.slug-input span { color: var(--admin-text-subtle); }
input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--admin-border-strong); border-radius: 3px; padding: 9px 10px; background: var(--editor-control); color: var(--admin-heading); font: inherit; text-transform: none; }
input[aria-invalid="true"] { border-color: var(--status-rose); }
small { color: var(--admin-text-subtle); line-height: 1.45; }
.field-error { color: var(--status-rose); }
button { min-height: 0; border: 0; padding: 4px 0; background: transparent; color: var(--admin-accent-strong); font: inherit; font-size: .68rem; cursor: pointer; white-space: nowrap; text-underline-offset: 3px; }
button:hover:not(:disabled) { text-decoration: underline; }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { color: var(--admin-text-subtle); cursor: default; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--admin-accent-strong); outline-offset: 2px; }
</style>
