<script lang="ts">
type Choice = {
	value: string;
	label: string;
};

let {
	id,
	label,
	value,
	options,
	disabled = false,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	options: readonly Choice[];
	disabled?: boolean;
	onChange: (value: string) => void;
} = $props();
</script>

<fieldset class="segmented-choice">
	<legend>{label}</legend>
	<div>
		{#each options as option (option.value)}
			<label>
				<input
					type="radio"
					name={id}
					value={option.value}
					checked={option.value === value}
					disabled={disabled}
					onchange={() => onChange(option.value)}
				/>
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.segmented-choice { min-width: 0; margin: 0; border: 0; padding: 0; color: var(--admin-text-muted); font-size: .76rem; }
	.segmented-choice legend { margin-bottom: 7px; padding: 0; }
	.segmented-choice > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 3px; background: var(--admin-bg); }
	.segmented-choice label { position: relative; display: grid; min-width: 0; min-height: 36px; place-items: center; border-radius: 4px; padding: 0; color: var(--admin-text-muted); font-size: .72rem; text-align: center; cursor: pointer; }
	.segmented-choice input { position: absolute; width: 1px; height: 1px; margin: -1px; opacity: 0; pointer-events: none; }
	.segmented-choice label:hover:has(input:not(:disabled)), .segmented-choice label:has(input:checked) { background: var(--admin-active); color: var(--admin-heading); }
	.segmented-choice label:has(input:focus-visible) { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.segmented-choice label:has(input:disabled) { opacity: .45; cursor: default; }
	.segmented-choice span { overflow: hidden; padding: 7px 9px; text-overflow: ellipsis; white-space: nowrap; }
	@media (max-width: 768px) { .segmented-choice label { min-height: 44px; } }
</style>
