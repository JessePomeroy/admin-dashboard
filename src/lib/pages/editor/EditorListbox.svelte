<script lang="ts">
import { tick } from "svelte";

type Choice = {
	value: string;
	label: string;
	disabled?: boolean;
};

let {
	id,
	label,
	value,
	options,
	placeholder = "choose an option",
	disabled = false,
	onChange,
}: {
	id: string;
	label: string;
	value?: string;
	options: readonly Choice[];
	placeholder?: string;
	disabled?: boolean;
	onChange: (value: string) => void;
} = $props();

let root = $state<HTMLDivElement>();
let trigger = $state<HTMLButtonElement>();
let menu = $state<HTMLDivElement>();
let open = $state(false);
let opensAbove = $state(false);
let selected = $derived(options.find((option) => option.value === value));

$effect(() => {
	if (disabled) open = false;
});

function optionButtons() {
	return Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
}

async function showMenu(preferLast = false) {
	if (disabled || options.every((option) => option.disabled)) return;
	open = true;
	opensAbove = false;
	await tick();
	const triggerRect = trigger?.getBoundingClientRect();
	const menuHeight = menu?.getBoundingClientRect().height ?? 0;
	if (
		triggerRect
		&& menuHeight > 0
		&& globalThis.innerHeight - triggerRect.bottom < menuHeight + 8
		&& triggerRect.top > menuHeight + 8
	) opensAbove = true;
	const buttons = optionButtons();
	const selectedButton = buttons.find((button) => button.dataset.value === value);
	(selectedButton ?? (preferLast ? buttons.at(-1) : buttons[0]))?.focus();
}

async function closeMenu(restoreFocus = false) {
	open = false;
	if (!restoreFocus) return;
	await tick();
	trigger?.focus();
}

function choose(option: Choice) {
	if (option.disabled) return;
	onChange(option.value);
	void closeMenu(true);
}

function handleTriggerKeydown(event: KeyboardEvent) {
	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		event.preventDefault();
		void showMenu(event.key === "ArrowUp");
	} else if (event.key === "Escape" && open) {
		event.preventDefault();
		event.stopPropagation();
		void closeMenu();
	}
}

function handleOptionKeydown(event: KeyboardEvent) {
	const buttons = optionButtons();
	const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
	if (event.key === "Escape") {
		event.preventDefault();
		event.stopPropagation();
		void closeMenu(true);
		return;
	}
	if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
	event.preventDefault();
	const nextIndex = event.key === "Home"
		? 0
		: event.key === "End"
			? buttons.length - 1
			: (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
	buttons[nextIndex]?.focus();
}

function handleWindowClick(event: MouseEvent) {
	if (open && root && event.target instanceof Node && !root.contains(event.target)) open = false;
}

async function handleFocusOut() {
	await tick();
	if (open && root && !root.contains(document.activeElement)) open = false;
}
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={root} class="listbox-field" onfocusout={() => void handleFocusOut()}>
	<span id={`${id}-label`} class="field-label">{label}</span>
	<button
		bind:this={trigger}
		id={`${id}-trigger`}
		type="button"
		class="listbox-trigger"
		role="combobox"
		aria-haspopup="listbox"
		aria-autocomplete="none"
		aria-expanded={open}
		aria-controls={`${id}-options`}
		aria-labelledby={`${id}-label ${id}-trigger`}
		disabled={disabled}
		onclick={() => open ? void closeMenu() : void showMenu()}
		onkeydown={handleTriggerKeydown}
	>
		<span class:placeholder={!value}>{selected?.label ?? value ?? placeholder}</span>
		<span class="chevron" aria-hidden="true"></span>
	</button>
	{#if open}
		<div bind:this={menu} id={`${id}-options`} class="listbox-options" class:opens-above={opensAbove} role="listbox" aria-labelledby={`${id}-label`}>
			{#each options as option (option.value)}
				<button
					type="button"
					role="option"
					tabindex="-1"
					data-value={option.value}
					aria-selected={option.value === value}
					disabled={option.disabled}
					onclick={() => choose(option)}
					onkeydown={handleOptionKeydown}
				>
					<span>{option.label}</span>
					{#if option.value === value}<span class="selected-mark" aria-hidden="true">✓</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.listbox-field { position: relative; display: grid; min-width: 0; gap: 7px; color: var(--admin-text-muted); font-size: .76rem; }
	.field-label { display: block; }
	.listbox-trigger { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 40px; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 9px 11px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-align: left; cursor: pointer; }
	.listbox-trigger > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.listbox-trigger .placeholder { color: var(--admin-text-subtle); }
	.chevron { width: 7px; height: 7px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: translateY(-2px) rotate(45deg); opacity: .72; }
	.listbox-trigger[aria-expanded="true"] .chevron { transform: translateY(2px) rotate(225deg); }
	.listbox-trigger:focus-visible, .listbox-options button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.listbox-trigger:disabled { opacity: .45; cursor: default; }
	.listbox-options { position: absolute; z-index: 30; top: calc(100% + 5px); right: 0; left: 0; display: grid; max-height: min(280px, 45vh); overflow-y: auto; border: 1px solid var(--admin-border-strong); border-radius: 7px; padding: 4px; background: var(--admin-dropdown-bg); box-shadow: 0 14px 34px color-mix(in srgb, #000 28%, transparent); }
	.listbox-options.opens-above { top: auto; bottom: calc(100% + 5px); }
	.listbox-options button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; width: 100%; min-height: 38px; border: 0; border-radius: 4px; padding: 8px 9px; background: transparent; color: var(--admin-text); font: inherit; font-size: .74rem; text-align: left; cursor: pointer; }
	.listbox-options button:hover:not(:disabled), .listbox-options button[aria-selected="true"] { background: var(--admin-active); color: var(--admin-heading); }
	.listbox-options button:disabled { color: var(--admin-text-subtle); cursor: default; opacity: .72; }
	.selected-mark { color: var(--admin-accent-strong); }
	@media (max-width: 768px) { .listbox-trigger, .listbox-options button { min-height: 44px; } .listbox-options, .listbox-options.opens-above { position: static; margin-top: -2px; } }
</style>
