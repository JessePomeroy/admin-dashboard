<script lang="ts">
type ChangePasswordResult = { error?: { message?: string } | null } | undefined;
type Props = {
	changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<ChangePasswordResult>;
	onSuccess: () => void;
};

let { changePassword, onSuccess }: Props = $props();
let currentPassword = $state("");
let newPassword = $state("");
let error = $state("");
let success = $state(false);
let saving = $state(false);

async function submit(event: Event) {
	event.preventDefault();
	error = "";
	saving = true;
	try {
		const result = await changePassword({ currentPassword, newPassword });
		if (result?.error) {
			error = result.error.message || "Password change failed";
			return;
		}
		success = true;
		currentPassword = "";
		newPassword = "";
		setTimeout(onSuccess, 1500);
	} catch (caught: unknown) {
		error = caught instanceof Error ? caught.message : "Failed to change password";
	} finally {
		saving = false;
	}
}
</script>

<form class="pw-form" onsubmit={submit}>
	{#if error}<p class="pw-error" role="alert">{error}</p>{/if}
	{#if success}
		<p class="pw-success" role="status">password updated</p>
	{:else}
		<input type="password" class="pw-input" placeholder="current password" aria-label="Current password" bind:value={currentPassword} required />
		<input type="password" class="pw-input" placeholder="new password (8+ chars)" aria-label="New password" bind:value={newPassword} required minlength="8" />
		<button type="submit" class="pw-submit" disabled={saving}>{saving ? "..." : "update"}</button>
	{/if}
</form>

<style>
	.pw-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; }
	.pw-input { background: var(--admin-surface); border: 1px solid var(--admin-border); border-radius: 4px; padding: 7px 10px; font-size: 0.8rem; color: var(--admin-heading); font-family: "Synonym", system-ui, sans-serif; outline: none; }
	.pw-input:focus { border-color: var(--admin-accent); }
	.pw-input::placeholder { color: var(--admin-text-subtle); }
	.pw-submit { background: var(--admin-accent); color: var(--admin-bg); border: none; border-radius: 4px; padding: 7px 12px; font-size: 0.8rem; font-family: "Synonym", system-ui, sans-serif; cursor: pointer; margin-top: 2px; }
	.pw-submit:disabled { opacity: 0.5; }
	.pw-error { color: rgb(248, 113, 113); font-size: 0.78rem; margin: 0; }
	.pw-success { color: rgb(74, 222, 128); font-size: 0.78rem; margin: 0; }
</style>
