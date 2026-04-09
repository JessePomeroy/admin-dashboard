<script lang="ts">
import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../../config";
import { toId } from "../../utils";
import AdminModal from "../../components/AdminModal.svelte";

let { onclose }: { onclose: () => void } = $props();

const config = getAdminConfig();
const { api } = config;
const client = useConvexClient();

const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });
let clients = $derived(clientsQuery.data ?? []);

let name = $state("");
let selectedClientId = $state("");
let downloadEnabled = $state(true);
let favoritesEnabled = $state(true);
let password = $state("");
let expiryDays = $state("");
let saving = $state(false);
let errorMsg = $state("");

let slug = $derived(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));

async function handleCreate() {
	if (!name.trim() || !selectedClientId) {
		errorMsg = "name and client are required";
		return;
	}

	saving = true;
	errorMsg = "";

	try {
		const expiresAt = expiryDays
			? Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000
			: undefined;

		await client.mutation(api.galleries.create, {
			siteUrl: config.siteUrl,
			clientId: toId(selectedClientId),
			name: name.trim(),
			slug,
			downloadEnabled,
			favoritesEnabled,
			password: password || undefined,
			expiresAt,
		});

		onclose();
	} catch (err) {
		errorMsg = err instanceof Error ? err.message : "Failed to create gallery";
	} finally {
		saving = false;
	}
}
</script>

<AdminModal title="new gallery" {onclose}>
	<form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="form" style="padding: 0 28px 28px;">
		<div class="field">
			<label for="name">gallery name</label>
			<input id="name" type="text" bind:value={name} placeholder="Johnson Wedding" />
			{#if slug}
				<span class="slug-preview">/{slug}</span>
			{/if}
		</div>

		<div class="field">
			<label for="client">client</label>
			<select id="client" bind:value={selectedClientId}>
				<option value="">select a client...</option>
				{#each clients as c (c._id)}
					<option value={c._id}>{c.name}</option>
				{/each}
			</select>
		</div>

		<div class="toggles">
			<label class="toggle">
				<input type="checkbox" bind:checked={downloadEnabled} />
				<span>allow downloads</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={favoritesEnabled} />
				<span>allow favorites</span>
			</label>
		</div>

		<div class="field">
			<label for="password">password (optional)</label>
			<input id="password" type="text" bind:value={password} placeholder="leave blank for token-only access" />
		</div>

		<div class="field">
			<label for="expiry">expires after (days, optional)</label>
			<input id="expiry" type="number" bind:value={expiryDays} placeholder="e.g. 90" min="1" />
		</div>

		{#if errorMsg}
			<p class="error">{errorMsg}</p>
		{/if}

		<div class="actions">
			<button type="button" class="cancel-btn" onclick={onclose}>cancel</button>
			<button type="submit" class="submit-btn" disabled={saving}>
				{saving ? "creating..." : "create gallery"}
			</button>
		</div>
	</form>
</AdminModal>

<style>
	.form { display: flex; flex-direction: column; gap: 18px; }

	.field { display: flex; flex-direction: column; gap: 5px; }
	.field label { font-size: 0.78rem; color: var(--admin-text-muted); }
	.field input, .field select {
		padding: 8px 12px;
		border: 1px solid var(--admin-border);
		border-radius: 5px;
		background: var(--admin-bg);
		color: var(--admin-text);
		font-size: 0.88rem;
		font-family: inherit;
	}

	.slug-preview {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		font-family: monospace;
	}

	.toggles { display: flex; gap: 24px; }
	.toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.82rem;
		color: var(--admin-text);
		cursor: pointer;
	}
	.toggle input { accent-color: var(--admin-accent); }

	.error { color: var(--status-rose); font-size: 0.8rem; margin: 0; }

	.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
	.cancel-btn {
		padding: 7px 18px;
		border: 1px solid var(--admin-border);
		border-radius: 6px;
		background: transparent;
		color: var(--admin-text-muted);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.submit-btn {
		padding: 7px 18px;
		background: var(--admin-accent);
		color: var(--admin-bg);
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.submit-btn:disabled { opacity: 0.5; }
</style>
