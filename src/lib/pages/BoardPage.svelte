<script lang="ts">
import { useQuery } from "@mmailaender/convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import { addToast } from "../toast";
import { logger } from "../logger";
import type { BoardConfig, Client } from "../types";
import { toId } from "../utils";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import BoardCardModal from "./board/BoardCardModal.svelte";
import BoardColumn, { type CardItem, type ColumnData } from "./board/BoardColumn.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
const boardConfigsQuery = useQuery(api.kanban.listBoardConfigs, { siteUrl: config.siteUrl });
const clientsQuery = useQuery(api.crm.listClients, { siteUrl: config.siteUrl });

let boardConfigs = $derived((boardConfigsQuery.data ?? []) as BoardConfig[]);
let allClients = $derived((clientsQuery.data ?? []) as Client[]);
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
let selectedClient = $state<CardItem | null>(null);
let editingColumnId = $state<string | null>(null);
let editingColumnName = $state("");
let showAddColumn = $state(false);
let newColumnName = $state("");
let showColumnMenu = $state<string | null>(null);

// Board config for selected type
let activeConfig = $derived(
	boardConfigs.find((c: BoardConfig) => c.projectType === selectedType) || null,
);

// Clients for selected type, grouped by column
let typeClients = $derived(
	allClients.filter((c: Client) => c.type === selectedType),
);

let columns = $state<ColumnData[]>([]);

// Rebuild columns when config or clients change
$effect(() => {
	if (!activeConfig) {
		columns = [];
		return;
	}

	const sorted = [...activeConfig.columns].sort(
		(a: BoardConfig["columns"][number], b: BoardConfig["columns"][number]) => a.position - b.position,
	);
	const unassigned = typeClients.filter((c: Client) => !c.boardColumnId);

	columns = sorted.map((col: BoardConfig["columns"][number], i: number) => {
		const colClients = typeClients
			.filter((c: Client) => c.boardColumnId === col.id)
			.sort(
				(a: Client, b: Client) => (a.boardPosition ?? 0) - (b.boardPosition ?? 0),
			);

		// Add unassigned clients to the first column
		const cards = (i === 0 ? [...unassigned, ...colClients] : colClients).map(
			(c: Client) => ({
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
				logger.error("Failed to move card:", err);
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
		logger.error("Failed to init board:", err);
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
		logger.error("Failed to add column:", err);
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
		logger.error("Failed to rename column:", err);
		addToast("Failed to rename column.");
	}
}

async function deleteColumn(columnId: string) {
	if (!activeConfig) return;
	const remaining = activeConfig.columns.filter((c: BoardConfig["columns"][number]) => c.id !== columnId);
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
		logger.error("Failed to delete column:", err);
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
				<BoardColumn
					{column}
					canDelete={columns.length > 1}
					{editingColumnId}
					{editingColumnName}
					{showColumnMenu}
					onconsider={handleConsider}
					onfinalize={handleFinalize}
					onrename={renameColumn}
					ondelete={deleteColumn}
					onstartrename={startRename}
					oncancelrename={() => { editingColumnId = null; }}
					ontogglemenu={(id) => { showColumnMenu = showColumnMenu === id ? null : id; }}
					onupdateeditname={(name) => { editingColumnName = name; }}
					oncardclick={openDetail}
				/>
			{/each}

			{#if showAddColumn}
				<div class="add-column-form">
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

	/* Add column form */
	.add-column-form {
		flex: 0 0 280px;
		display: flex;
		flex-direction: column;
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

		.add-column-form {
			flex: none;
			width: 100%;
		}
	}
</style>
