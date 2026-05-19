<script lang="ts">
import { useQuery } from "@mmailaender/convex-svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";
import { addToast } from "../toast";
import { logger } from "../logger";
import type { EmailTemplate } from "../types";
import { getCategoryColor } from "../utils";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import CreateTemplateModal from "./emails/CreateTemplateModal.svelte";
import TemplateDetailModal from "./emails/TemplateDetailModal.svelte";

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useAdminClient();
const templatesQuery = useQuery(api.emailTemplates.list, { siteUrl: config.siteUrl });

let templates = $derived((templatesQuery.data ?? []) as EmailTemplate[]);

// Categories
const categories = [
	"inquiry-reply",
	"booking-confirmation",
	"reminder",
	"gallery-delivery",
	"follow-up",
	"thank-you",
	"custom",
] as const;

// Filter state
let categoryFilter = $state("all");
let searchQuery = $state("");

// Modal state
let showCreateModal = $state(false);
let selectedTemplate = $state<EmailTemplate | null>(null);
let saving = $state(false);

let filteredTemplates = $derived(
	templates.filter((t: EmailTemplate) => {
		if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const matchName = t.name?.toLowerCase().includes(q);
			const matchSubject = t.subject?.toLowerCase().includes(q);
			if (!matchName && !matchSubject) return false;
		}
		return true;
	}),
);

function countVariables(body: string): number {
	const matches = body.match(/\{\{[^}]+\}\}/g);
	return matches ? matches.length : 0;
}

// Create modal
function openCreateModal() {
	showCreateModal = true;
}

function closeCreateModal() {
	showCreateModal = false;
}

async function saveNewTemplate(formData: { name: string; category: string; subject: string; body: string; variables?: string[] }) {
	saving = true;
	try {
		await client.mutation(api.emailTemplates.create, {
			siteUrl: config.siteUrl,
			name: formData.name,
			category: formData.category,
			subject: formData.subject,
			body: formData.body,
			variables: formData.variables,
		});
		closeCreateModal();
	} catch (err) {
		logger.error("Failed to create email template:", err);
		addToast("Failed to create template.");
	} finally {
		saving = false;
	}
}

// Detail modal
function openDetailModal(template: EmailTemplate) {
	selectedTemplate = { ...template };
}

function closeDetailModal() {
	selectedTemplate = null;
}

async function saveEdit(formData: { name: string; category: string; subject: string; body: string; variables?: string[] }) {
	if (!selectedTemplate) return;
	saving = true;
	try {
		await client.mutation(api.emailTemplates.update, {
			templateId: selectedTemplate._id,
			siteUrl: config.siteUrl,
			name: formData.name,
			category: formData.category,
			subject: formData.subject,
			body: formData.body,
			variables: formData.variables,
		});
		selectedTemplate = {
			...selectedTemplate,
			name: formData.name,
			category: formData.category,
			subject: formData.subject,
			body: formData.body,
			variables: formData.variables,
		};
	} catch (err) {
		logger.error("Failed to update email template:", err);
		addToast("Failed to save template.");
	} finally {
		saving = false;
	}
}

async function deleteTemplate() {
	if (!selectedTemplate) return;
	saving = true;
	try {
		await client.mutation(api.emailTemplates.remove, {
			templateId: selectedTemplate._id,
			siteUrl: config.siteUrl,
		});
		closeDetailModal();
	} catch (err) {
		logger.error("Failed to delete email template:", err);
		addToast("Failed to delete template.");
	} finally {
		saving = false;
	}
}
</script>

<FeatureGate feature="emails" adminSession={data.adminSession}>
{#if templatesQuery.isLoading}
	<LoadingState />
{:else}
<div class="emails-page">
	<header class="page-header">
		<div class="header-left">
			<h1>email templates</h1>
			<span class="template-count">{templates.length} template{templates.length !== 1 ? "s" : ""}</span>
		</div>
		<button class="btn-add" onclick={openCreateModal}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
			new template
		</button>
	</header>

	<div class="filter-bar">
		<select class="filter-select" bind:value={categoryFilter}>
			<option value="all">all categories</option>
			{#each categories as cat}
				<option value={cat}>{cat}</option>
			{/each}
		</select>
		<input
			class="filter-search"
			type="text"
			placeholder="search by name or subject..."
			bind:value={searchQuery}
		/>
	</div>

	{#if filteredTemplates.length === 0}
		<div class="empty-state">no email templates found</div>
	{:else}
		<div class="templates-list">
			{#each filteredTemplates as template (template._id)}
				<button
					class="template-item"
					onclick={() => openDetailModal(template)}
				>
					<div class="template-info">
						<span class="template-name">{template.name}</span>
						<span class="template-subject">{template.subject}</span>
					</div>
					<div class="template-meta">
						<span class="category-label" style="color: {getCategoryColor(template.category)}">
							<span class="category-dot" style="background: {getCategoryColor(template.category)}"></span>
							{template.category}
						</span>
						{#if countVariables(template.body) > 0}
							<span class="template-vars">{countVariables(template.body)} var{countVariables(template.body) !== 1 ? "s" : ""}</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<CreateTemplateModal isOpen={showCreateModal} {saving} {categories} onclose={closeCreateModal} onsave={saveNewTemplate} />
<TemplateDetailModal template={selectedTemplate} {saving} {categories} onclose={closeDetailModal} onsave={saveEdit} ondelete={deleteTemplate} />
{/if}
</FeatureGate>

<style>
	.emails-page {
		padding: 48px 40px;
		max-width: 1200px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 24px;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.8rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.template-count {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.btn-add {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		background: transparent;
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.btn-add:hover {
		color: var(--admin-heading);
		border-color: var(--admin-text-muted);
	}

	/* Filter bar */
	.filter-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 24px;
		flex-wrap: wrap;
	}

	.filter-select,
	.filter-search {
		padding: 7px 12px;
		background: transparent;
		color: var(--admin-text);
		border: 1px solid var(--admin-border-strong);
		border-radius: 6px;
		font-size: 0.83rem;
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-select:focus,
	.filter-search:focus {
		border-color: var(--admin-accent);
	}

	.filter-search {
		flex: 1;
		min-width: 180px;
	}

	/* Templates list */
	.templates-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.template-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 0;
		background: none;
		border: none;
		border-bottom: 1px solid var(--admin-border);
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background 0.12s;
		font-family: "Synonym", system-ui, sans-serif;
	}

	.template-item:hover {
		background: var(--admin-active);
	}

	.template-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.template-name {
		font-size: 0.88rem;
		color: var(--admin-heading);
		font-weight: 500;
	}

	.template-subject {
		font-size: 0.8rem;
		color: var(--admin-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.template-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.category-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
	}

	.category-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.template-vars {
		font-size: 0.76rem;
		color: var(--admin-text-subtle);
	}

	/* Empty state */
	.empty-state {
		padding: 48px 0;
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.emails-page {
			padding: 20px 16px;
		}

		.page-header {
			flex-direction: column;
		}

		.header-left {
			flex-direction: column;
			gap: 4px;
		}

		.btn-add {
			align-self: flex-start;
		}

		.filter-bar {
			flex-direction: column;
		}

		.filter-search {
			min-width: unset;
		}

		.template-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
	}
</style>
