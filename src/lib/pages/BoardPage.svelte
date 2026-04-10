<script lang="ts">
import { dndzone } from "svelte-dnd-action";
import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../config";
import { addToast } from "../toast";
import { getCategoryColor, toId } from "../utils";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import BoardCardModal from "./board/BoardCardModal.svelte";
import BoardColumn from "./board/BoardColumn.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useConvexClient();
const boardConfigsQuery = useQuery(api.kanban.listBoardConfigs, { siteUrl: config.siteUrl });
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });

let boardConfigs = $derived(boardConfigsQuery.data ?? []);
let allClients = $derived(clientsQuery.data ?? []);
let isLoading = $derived(boardConfigsQuery.isLoading || clientsQuery.isLoading);

// Project types
const photographyTypes = [
	"wedding",
	"portrait",
	"family",
	"commercial",
	"event",
];
const webTypes = ["website", "redesign", "maintenance", "other"];
const allTypes = [...photographyTypes, ...webTypes];

// State
let selectedType = $state(allTypes[0]);
let saving = $state(false);
let selectedClient = $state<any>(null);
let editingColumnId = $state<string | null>(null);
let editingColumnName = $state("");
let showAddColumn = $state(false);
let newColumnName = $state("");
let showColumnMenu = $state<string | null>(null);

// Board config for selected type
let activeConfig = $derived(
	boardConfigs.find((c: any) => c.projectType === selectedType) || null,
);

// Clients for selected type, grouped by column
let typeClients = $derived(
	allClients.filter((c: any) => c.type === selectedType),
);

interface CardItem {
	id: string;
	_id: string;
	name: string;
	email?: string;
	phone?: string;
	category: string;
	type?: string;
	status: string;
	source?: string;
	notes?: string;
	boardColumnId?: string;
	boardPosition?: number;
}

let columns = $state<
	{ id: string; name: string; position: number; cards: CardItem[] }[]
>([]);

// Rebuild columns when config or clients change
$effect(() => {
	if (!activeConfig) {
		columns = [];
		return;
	}

	const sorted = [...activeConfig.columns].sort(
		(a: any, b: any) => a.position - b.position,
	);
	const unassigned = typeClients.filter((c: any) => !c.boardColumnId);

	columns = sorted.map((col: any, i: number) => {
		const colClients = typeClients
			.filter((c: any) => c.boardColumnId === col.id)
			.sort(
				(a: any, b: any) => (a.boardPosition ?? 0) - (b.boardPosition ?? 0),
			);

		// Add unassigned clients to the first column
		const cards = (i === 0 ? [...unassigned, ...colClients] : colClients).map(
			(c: any) => ({
				id: c._id,
				_id: c._id,
				name: c.name,
				email: c.email,
				phone: c.phone,
				category: c.category,
				type: c.type,
				status: c.status,
				source: c.source,
				notes: c.notes,
				boardColumnId: c.boardColumnId,
				boardPosition: c.boardPosition,
			}),
		);

		return { id: col.id, name: col.name, position: col.position, cards };
	});
});

// Drag and drop handlers
function handleConsider(
	columnId: string,
	e: CustomEvent<{ items: CardItem[] }>,
) {
	const col = columns.find((c) => c.id === columnId);
	if (col) col.cards = e.detail.items;
}

async function handleFinalize(
	columnId: string,
	e: CustomEvent<{ items: CardItem[] }>,
) {
	const col = columns.find((c) => c.id === columnId);
	if (!col) return;
	col.cards = e.detail.items;

	// Find the moved card and persist its new position
	for (let i = 0; i < col.cards.length; i++) {
		const card = col.cards[i];
		if (card.boardColumnId !== columnId || card.boardPosition !== i) {
			try {
				await client.mutation(api.kanban.moveCard, {
					clientId: toId(card._id),
					siteUrl: config.siteUrl,
					targetColumnId: columnId,
					targetPosition: i,
				});
			} catch (err) {
				console.error("Failed to move card:", err);
				addToast("Failed to move card.");
			}
		}
	}
}

// Board initialization
async function initBoard() {
	saving = true;
	try {
		await client.mutation(api.kanban.initializeBoard, {
			siteUrl: config.siteUrl,
			projectType: selectedType,
		});
		saving = false;
	} catch (err) {
		console.error("Failed to init board:", err);
		addToast("Failed to initialize board.");
		saving = false;
	}
}

// Column management
async function addColumn() {
	if (!newColumnName.trim() || !activeConfig) return;
	saving = true;
	try {
		await client.mutation(api.kanban.addColumn, {
			configId: activeConfig._id,
			siteUrl: config.siteUrl,
			name: newColumnName.trim(),
		});
		newColumnName = "";
		showAddColumn = false;
		saving = false;
	} catch (err) {
		console.error("Failed to add column:", err);
		addToast("Failed to add column.");
		saving = false;
	}
}

async function renameColumn(columnId: string) {
	if (!editingColumnName.trim() || !activeConfig) return;
	try {
		await client.mutation(api.kanban.renameColumn, {
			configId: activeConfig._id,
			siteUrl: config.siteUrl,
			columnId,
			name: editingColumnName.trim(),
		});
		editingColumnId = null;
	} catch (err) {
		console.error("Failed to rename column:", err);
		addToast("Failed to rename column.");
	}
}

async function deleteColumn(columnId: string) {
	if (!activeConfig) return;
	const remaining = activeConfig.columns.filter((c: any) => c.id !== columnId);
	if (remaining.length === 0) return; // can't delete last column

	try {
		await client.mutation(api.kanban.deleteColumn, {
			configId: activeConfig._id,
			siteUrl: config.siteUrl,
			columnId,
			moveToColumnId: remaining[0].id,
		});
		showColumnMenu = null;
	} catch (err) {
		console.error("Failed to delete column:", err);
		addToast("Failed to delete column.");
	}
}

function startRename(columnId: string, currentName: string) {
	editingColumnId = columnId;
	editingColumnName = currentName;
	showColumnMenu = null;
}

function openDetail(card: CardItem) {
	selectedClient = card;
}

</script>

<FeatureGate feature="board" tier={data.tier}>
{#if isLoading}
	<LoadingState />
{:else}
<div class="board-page">
	<header class="page-header">
		<div class="header-top">
			<h1>board</h1>
			<div class="header-controls">
				<select bind:value={selectedType} class="type-select">
					<optgroup label="photography">
						{#each photographyTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</optgroup>
					<optgroup label="web">
						{#each webTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</optgroup>
				</select>
				{#if activeConfig}
					<button class="action-btn" onclick={() => (showAddColumn = true)}>
						+ column
					</button>
				{/if}
			</div>
		</div>
	</header>

	{#if !activeConfig}
		<div class="empty-state">
			<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="5" height="14" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/>
			</svg>
			<p class="empty-title">no board for {selectedType}</p>
			<p class="empty-desc">initialize a board with default columns for this project type</p>
			<button class="init-btn" onclick={initBoard} disabled={saving}>
				{saving ? "creating..." : "initialize board"}
			</button>
		</div>
	{:else}
		<div class="board-container">
			{#each columns as column (column.id)}
				<div class="board-column">
					<div class="column-header">
						{#if editingColumnId === column.id}
							<form onsubmit={(e) => { e.preventDefault(); renameColumn(column.id); }} class="rename-form">
								<input
									type="text"
									bind:value={editingColumnName}
									class="rename-input"
									onkeydown={(e) => { if (e.key === "Escape") editingColumnId = null; }}
								/>
								<button type="submit" class="rename-save">save</button>
							</form>
						{:else}
							<div class="column-title-row">
								<h3 class="column-title">{column.name}</h3>
								<span class="column-count">{column.cards.length}</span>
							</div>
							<div class="column-actions">
								<button
									class="column-menu-btn"
									aria-label="Column options"
									aria-expanded={showColumnMenu === column.id}
									onclick={() => (showColumnMenu = showColumnMenu === column.id ? null : column.id)}
									onkeydown={(e) => { if (e.key === "Escape") showColumnMenu = null; }}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
										<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
									</svg>
								</button>
								{#if showColumnMenu === column.id}
									<div class="column-dropdown">
										<button onclick={() => startRename(column.id, column.name)}>rename</button>
										{#if columns.length > 1}
											<button class="danger" onclick={() => deleteColumn(column.id)}>delete</button>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<div
						class="column-body"
						use:dndzone={{ items: column.cards, type: "card", dropTargetStyle: {} }}
						onconsider={(e) => handleConsider(column.id, e)}
						onfinalize={(e) => handleFinalize(column.id, e)}
					>
						{#each column.cards as card (card.id)}
							<button class="board-card" onclick={() => openDetail(card)}>
								<span class="card-name">{card.name}</span>
								<div class="card-meta">
									<span class="category-dot" style="background: {getCategoryColor(card.category)}"></span>
									<span>{card.type || card.category}</span>
								</div>
								{#if card.email}
									<span class="card-email">{card.email}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/each}

			{#if showAddColumn}
				<div class="board-column add-column-form">
					<form onsubmit={(e) => { e.preventDefault(); addColumn(); }}>
						<input
							type="text"
							bind:value={newColumnName}
							placeholder="column name"
							class="add-column-input"
						/>
						<div class="add-column-actions">
							<button type="submit" class="action-btn" disabled={saving || !newColumnName.trim()}>
								add
							</button>
							<button type="button" class="cancel-btn" onclick={() => { showAddColumn = false; newColumnName = ""; }}>
								cancel
							</button>
						</div>
					</form>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Client detail modal -->
{#if selectedClient}
	<BoardCardModal client={selectedClient} onclose={() => (selectedClient = null)} />
{/if}
{/if}
</FeatureGate>

<style>
	.board-page {
		padding: 48px 40px;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.type-select {
		background: var(--admin-surface);
		color: var(--admin-text);
		border: 1px solid var(--admin-border);
		padding: 8px 12px;
		border-radius: 6px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.85rem;
		text-transform: lowercase;
		cursor: pointer;
	}

	.type-select option,
	.type-select optgroup {
		background: var(--admin-bg);
		color: var(--admin-text);
	}

	.action-btn {
		background: var(--admin-accent);
		color: #fff;
		border: none;
		padding: 8px 16px;
		border-radius: 6px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.82rem;
		cursor: pointer;
		text-transform: lowercase;
		transition: opacity 0.15s;
	}

	.action-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		text-align: center;
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: var(--admin-text-subtle);
		margin-bottom: 20px;
	}

	.empty-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.1rem;
		color: var(--admin-heading);
		margin: 0 0 8px;
	}

	.empty-desc {
		font-size: 0.85rem;
		color: var(--admin-text-muted);
		margin: 0 0 24px;
	}

	.init-btn {
		background: var(--admin-accent);
		color: #fff;
		border: none;
		padding: 10px 24px;
		border-radius: 6px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.88rem;
		cursor: pointer;
		text-transform: lowercase;
		transition: opacity 0.15s;
	}

	.init-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.init-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Board layout */
	.board-container {
		display: flex;
		gap: 20px;
		overflow-x: auto;
		padding-bottom: 20px;
		min-height: calc(100vh - 200px);
	}

	.board-column {
		flex: 0 0 280px;
		display: flex;
		flex-direction: column;
		min-height: 200px;
	}

	/* Column header */
	.column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0 14px;
		border-bottom: 1px solid var(--admin-border);
		margin-bottom: 14px;
		position: relative;
	}

	.column-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.column-title {
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--admin-text-muted);
		letter-spacing: 0.03em;
		margin: 0;
	}

	.column-count {
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		background: var(--admin-surface);
		padding: 2px 7px;
		border-radius: 10px;
	}

	.column-actions {
		position: relative;
	}

	.column-menu-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		color: var(--admin-text-subtle);
		transition: color 0.15s;
	}

	.column-menu-btn:hover {
		color: var(--admin-text);
	}

	.column-menu-btn svg {
		width: 16px;
		height: 16px;
	}

	.column-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		background: var(--admin-bg);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		padding: 4px;
		z-index: 20;
		min-width: 120px;
	}

	.column-dropdown button {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: var(--admin-text);
		padding: 8px 12px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.82rem;
		cursor: pointer;
		border-radius: 4px;
		text-transform: lowercase;
	}

	.column-dropdown button:hover {
		background: var(--admin-surface);
	}

	.column-dropdown button.danger {
		color: var(--status-rose);
	}

	/* Rename form */
	.rename-form {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}

	.rename-input {
		flex: 1;
		background: var(--admin-surface);
		border: 1px solid var(--admin-border-strong);
		color: var(--admin-text);
		padding: 4px 8px;
		border-radius: 4px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.82rem;
		text-transform: lowercase;
	}

	.rename-save {
		background: none;
		border: none;
		color: var(--admin-accent);
		font-size: 0.78rem;
		cursor: pointer;
		font-family: "Synonym", system-ui, sans-serif;
		text-transform: lowercase;
	}

	/* Column body (drop zone) */
	.column-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 60px;
	}

	/* Cards */
	.board-card {
		display: block;
		width: 100%;
		text-align: left;
		background: var(--admin-surface-raised);
		border: 1px solid var(--admin-border);
		border-radius: 8px;
		padding: 14px 16px;
		cursor: grab;
		transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
	}

	.board-card:hover {
		background: rgba(255, 255, 255, 0.07);
		border-color: var(--admin-border-strong);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.board-card:active {
		cursor: grabbing;
	}

	.card-name {
		display: block;
		font-size: 0.88rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin-bottom: 8px;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: var(--admin-text-muted);
	}

	.category-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.card-email {
		display: block;
		font-size: 0.72rem;
		color: var(--admin-text-subtle);
		margin-top: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Add column form */
	.add-column-form {
		padding-top: 0;
	}

	.add-column-input {
		width: 100%;
		background: var(--admin-surface);
		border: 1px solid var(--admin-border-strong);
		color: var(--admin-text);
		padding: 8px 12px;
		border-radius: 6px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.85rem;
		text-transform: lowercase;
		margin-bottom: 10px;
		box-sizing: border-box;
	}

	.add-column-actions {
		display: flex;
		gap: 8px;
	}

	.cancel-btn {
		background: none;
		border: 1px solid var(--admin-border);
		color: var(--admin-text-muted);
		padding: 8px 16px;
		border-radius: 6px;
		font-family: "Synonym", system-ui, sans-serif;
		font-size: 0.82rem;
		cursor: pointer;
		text-transform: lowercase;
	}

	/* Mobile */
	@media (max-width: 768px) {
		.board-page {
			padding: 24px 16px;
		}

		.header-top {
			flex-direction: column;
			align-items: flex-start;
			gap: 16px;
		}

		.board-container {
			flex-direction: column;
			overflow-x: visible;
		}

		.board-column {
			flex: none;
			width: 100%;
		}

		.board-card {
			cursor: pointer;
		}
	}
</style>
