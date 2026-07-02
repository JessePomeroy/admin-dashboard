<script lang="ts">
import AdminModal from "../../components/AdminModal.svelte";
import StatusDot from "../../components/StatusDot.svelte";
import type { EmailTemplate, Quote, QuotePackage } from "../../types";
import {
	dollarsToCents,
	formatCents,
	formatDollars,
	formatDate,
	formatTimestamp,
	getStatusColor,
	QUOTE_STATUS_COLORS,
} from "../../utils";
import PackageEditor from "./PackageEditor.svelte";

interface EditablePackage {
	name: string;
	description: string;
	price: number;
	included: string[];
}

interface Props {
	quote: Quote;
	nextInvoiceNumber: string;
	saving: boolean;
	sending: boolean;
	templates: EmailTemplate[];
	onclose: () => void;
	onsaveedit: (data: {
		packages: EditablePackage[];
		category: "photography" | "web";
		validUntil: string;
		notes: string;
	}) => Promise<void>;
	onsendquoteemail: (templateId?: string, changeNote?: string) => Promise<void>;
	onquoteaction: (action: string) => Promise<void>;
	ondeletequote: () => Promise<void>;
	oncopysharelink: () => Promise<void>;
	onconverttoinvoice: (data: {
		invoiceNumber: string;
		invoiceType: string;
		dueDate: string;
		notes: string;
	}) => Promise<void>;
	shareLinkCopied: boolean;
	sendResult: "success" | "error" | null;
	onsendresultclear: () => void;
	convertSuccess: boolean;
	converting: boolean;
}

let {
	quote,
	nextInvoiceNumber,
	saving,
	sending,
	onclose,
	onsaveedit,
	onsendquoteemail,
	onquoteaction,
	ondeletequote,
	oncopysharelink,
	onconverttoinvoice,
	shareLinkCopied,
	sendResult,
	onsendresultclear,
	convertSuccess,
	converting,
	templates,
}: Props = $props();

let editMode = $state(false);
let selectedTemplateId = $state<string>("");
let confirmDelete = $state(false);
let confirmResend = $state(false);
let lastChangeNote = $state("");
let showConvertForm = $state(false);

// Edit form state
let editPackages = $state<EditablePackage[]>([]);
let editValidUntil = $state("");
let editNotes = $state("");
let editCategory = $state<"photography" | "web">("photography");
let editNewIncludedItem = $state<Record<number, string>>({});

// Convert to invoice state
let convertInvoiceNumber = $state("");
let convertInvoiceType = $state("one-time");
let convertDueDate = $state("");
let convertNotes = $state("");
let loadedConvertQuoteId = $state<string | null>(null);

$effect(() => {
	if (loadedConvertQuoteId === quote._id) return;
	loadedConvertQuoteId = quote._id;
	convertInvoiceNumber = nextInvoiceNumber;
	convertNotes = quote.notes || "";
});

let detailTotal = $derived(
	quote.packages.reduce((sum: number, pkg: QuotePackage) => sum + pkg.price, 0),
);

let editTotal = $derived(editPackages.reduce((sum, pkg) => sum + pkg.price, 0));

function startEdit() {
	editPackages = quote.packages.map((pkg: QuotePackage) => ({
		name: pkg.name || "",
		description: pkg.description || "",
		price: pkg.price / 100,
		included: [...(pkg.included || [])],
	}));
	editValidUntil = quote.validUntil || "";
	editNotes = quote.notes || "";
	editCategory = (quote.category as "photography" | "web") || "photography";
	editNewIncludedItem = {};
	editMode = true;
}

function cancelEdit() {
	editMode = false;
}

function buildChangeNote(): string {
	const changes: string[] = [];
	const oldPkgs = quote.packages;
	const newPkgs = editPackages;
	if (oldPkgs.length !== newPkgs.length) {
		changes.push("packages updated");
	} else {
		const pkgsChanged = newPkgs.some((pkg, i) => {
			const old = oldPkgs[i];
			return pkg.name !== (old.name || "")
				|| pkg.description !== (old.description || "")
				|| dollarsToCents(pkg.price) !== old.price;
		});
		if (pkgsChanged) changes.push("packages updated");
	}
	if ((editValidUntil || "") !== (quote.validUntil || "")) changes.push("valid until updated");
	if ((editNotes || "") !== (quote.notes || "")) changes.push("notes updated");
	return changes.join(", ");
}

async function handleSaveEdit() {
	if (editPackages.length === 0) return;
	lastChangeNote = buildChangeNote();
	await onsaveedit({
		packages: editPackages,
		category: editCategory,
		validUntil: editValidUntil,
		notes: editNotes,
	});
	editMode = false;
	if (quote.status !== "draft") {
		confirmResend = true;
	}
}

async function handleResend() {
	confirmResend = false;
	await handleSendEmail(selectedTemplateId || undefined, lastChangeNote);
}

function dismissResend() {
	confirmResend = false;
}

async function handleSendEmail(templateId?: string, changeNote?: string) {
	await onsendquoteemail(templateId, changeNote);
}

async function handleConvert() {
	if (!convertInvoiceNumber) return;
	await onconverttoinvoice({
		invoiceNumber: convertInvoiceNumber,
		invoiceType: convertInvoiceType,
		dueDate: convertDueDate,
		notes: convertNotes,
	});
	showConvertForm = false;
}
</script>

<AdminModal title={editMode ? "edit quote" : quote.quoteNumber} onclose={onclose} size="wide">
	{#if editMode}
		<form class="modal-form" onsubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
			<div class="form-row">
				<div class="form-group">
					<label class="form-label" for="edit-category">category</label>
					<select id="edit-category" class="form-input" bind:value={editCategory}>
						<option value="photography">photography</option>
						<option value="web">web</option>
					</select>
				</div>
				<div class="form-group">
					<label class="form-label" for="edit-valid">valid until</label>
					<input id="edit-valid" class="form-input" type="date" bind:value={editValidUntil} />
				</div>
			</div>

			<div class="form-group">
				<label class="form-label" for="edit-notes">notes</label>
				<textarea id="edit-notes" class="form-input form-textarea" bind:value={editNotes} rows="2"></textarea>
			</div>

			<PackageEditor
				packages={editPackages}
				newIncludedItem={editNewIncludedItem}
				priceLabel="price ($)"
				onpackageschange={(pkgs) => { editPackages = pkgs; }}
				onnewincludeditemchange={(items) => { editNewIncludedItem = items; }}
			/>

			<div class="totals-line">
				<span class="total-amount">total: {formatDollars(editTotal)}</span>
			</div>

			<div class="modal-actions">
				<button type="button" class="btn-cancel" onclick={cancelEdit}>cancel</button>
				<button type="submit" class="btn-save" disabled={saving || editPackages.length === 0}>
					{saving ? "saving..." : "save changes"}
				</button>
			</div>
		</form>
	{:else}
		<div class="detail-body">
			<div class="detail-meta-line">
				<StatusDot color={getStatusColor(QUOTE_STATUS_COLORS, quote.status)} label={quote.status} />
				{#if quote.category}
					<span class="meta-sep">&middot;</span>
					<span class="detail-category">{quote.category}</span>
				{/if}
				<span class="meta-sep">&middot;</span>
				<span class="detail-client">{quote.clientName}</span>
				{#if quote.validUntil}
					<span class="meta-sep">&middot;</span>
					<span class="detail-due">valid until {formatDate(quote.validUntil)}</span>
				{/if}
			</div>

			<div class="detail-fields">
				{#each quote.packages as pkg}
					<div class="detail-package">
						<div class="detail-package-header">
							<span class="detail-package-name">{pkg.name}</span>
							<span class="detail-package-price">{formatCents(pkg.price)}</span>
						</div>
						{#if pkg.description}
							<p class="detail-package-desc">{pkg.description}</p>
						{/if}
						{#if pkg.included && pkg.included.length > 0}
							<ul class="detail-included-list">
								{#each pkg.included as item}
									<li>{item}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}

				<div class="totals-line">
					<span class="total-amount">total: {formatCents(detailTotal)}</span>
				</div>

				{#if quote.notes}
					<div class="detail-field">
						<span class="detail-label">notes</span>
						<span class="detail-value detail-notes">{quote.notes}</span>
					</div>
				{/if}

				{#if quote.sentAt}
					<div class="detail-field">
						<span class="detail-label">sent</span>
						<span class="detail-value">{formatTimestamp(quote.sentAt)}</span>
					</div>
				{/if}

				{#if quote.acceptedAt}
					<div class="detail-field">
						<span class="detail-label">accepted</span>
						<span class="detail-value">{formatTimestamp(quote.acceptedAt)}</span>
					</div>
				{/if}

				<div class="detail-field">
					<span class="detail-label">created</span>
					<span class="detail-value">{formatTimestamp(quote._creationTime)}</span>
				</div>
			</div>

			<div class="share-link-row">
				<button class="btn-share" onclick={oncopysharelink}>
					{shareLinkCopied ? "link copied!" : "copy share link"}
				</button>
			</div>

			{#if quote.status === "draft" && templates.length > 0}
				<div class="email-template-picker">
					<label class="detail-label" for="email-template">email template</label>
					<select id="email-template" class="template-select" bind:value={selectedTemplateId}>
						<option value="">default email</option>
						{#each templates as t}
							<option value={t._id}>{t.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="modal-actions detail-actions">
				{#if confirmResend}
					<span class="confirm-text">resend updated quote to client?</span>
					<button class="btn-save" onclick={handleResend} disabled={sending}>
						{sending ? "sending..." : "yes, resend"}
					</button>
					<button class="btn-cancel" onclick={dismissResend}>no</button>
				{:else if confirmDelete}
					<span class="confirm-text">delete this quote?</span>
					<button class="btn-danger" onclick={ondeletequote} disabled={saving}>
						{saving ? "deleting..." : "yes, delete"}
					</button>
					<button class="btn-cancel" onclick={() => { confirmDelete = false; }}>no</button>
				{:else if sendResult === "success"}
					<span class="send-success">email sent</span>
				{:else if sendResult === "error"}
					<span class="send-error">failed to send</span>
					<button class="btn-cancel" onclick={onsendresultclear}>dismiss</button>
				{:else if quote.status === "draft"}
					<button class="btn-danger-outline" onclick={() => { confirmDelete = true; }}>delete</button>
					<button class="btn-cancel" onclick={startEdit}>edit</button>
					<button class="btn-send" onclick={() => handleSendEmail(selectedTemplateId || undefined)} disabled={sending}>
						{sending ? "sending..." : "send email"}
					</button>
					<button class="btn-save" onclick={() => onquoteaction("send")} disabled={saving}>
						{saving ? "..." : "mark as sent"}
					</button>
				{:else if quote.status === "sent"}
					<button class="btn-cancel" onclick={startEdit}>edit</button>
					<button class="btn-danger-outline" onclick={() => onquoteaction("decline")} disabled={saving}>decline</button>
					<button class="btn-save" onclick={() => onquoteaction("accept")} disabled={saving}>
						{saving ? "..." : "mark accepted"}
					</button>
				{:else if quote.status === "accepted"}
					<span class="accepted-note">accepted on {formatTimestamp(quote.acceptedAt ?? 0)}</span>
					{#if !quote.convertedToInvoice && !convertSuccess}
						<button class="btn-save" onclick={() => { showConvertForm = !showConvertForm; }} disabled={converting}>
							convert to invoice
						</button>
					{/if}
				{:else if quote.status === "declined"}
					<span class="declined-note">declined</span>
				{:else if quote.status === "expired"}
					<span class="expired-note">expired</span>
				{/if}
			</div>

			{#if quote.status === "accepted"}
				{#if convertSuccess || quote.convertedToInvoice}
					<div class="convert-status">
						<StatusDot color="var(--status-sage)" label="" />
						invoice created — <a class="convert-link" href="/admin/invoicing">view invoices</a>
					</div>
				{:else if showConvertForm}
					<div class="convert-section">
						<div class="convert-section-header">
							<span class="form-label">convert to invoice</span>
						</div>
						<form class="convert-form" onsubmit={(e) => { e.preventDefault(); handleConvert(); }}>
							<div class="form-row">
								<div class="form-group">
									<label class="form-label" for="convert-number">invoice number</label>
									<input id="convert-number" class="form-input" type="text" bind:value={convertInvoiceNumber} required />
								</div>
								<div class="form-group">
									<label class="form-label" for="convert-type">invoice type</label>
									<select id="convert-type" class="form-input" bind:value={convertInvoiceType}>
										<option value="one-time">one-time</option>
										<option value="package">package</option>
										<option value="deposit">deposit</option>
										<option value="milestone">milestone</option>
										<option value="recurring">recurring</option>
									</select>
								</div>
							</div>
							<div class="form-group">
								<label class="form-label" for="convert-due">due date</label>
								<input id="convert-due" class="form-input" type="date" bind:value={convertDueDate} />
							</div>
							<div class="form-group">
								<label class="form-label" for="convert-notes">notes</label>
								<textarea id="convert-notes" class="form-input form-textarea" bind:value={convertNotes} rows="2"></textarea>
							</div>
							<div class="convert-actions">
								<button type="button" class="btn-cancel" onclick={() => { showConvertForm = false; }}>cancel</button>
								<button type="submit" class="btn-save" disabled={converting || !convertInvoiceNumber}>
									{converting ? "creating..." : "create invoice"}
								</button>
							</div>
						</form>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</AdminModal>

<style>
	@import "../../styles/detail-modal.css";

	.detail-category {
		color: var(--admin-text-muted);
		font-size: 0.82rem;
	}

	.detail-package {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--admin-border);
	}

	.detail-package:last-of-type {
		border-bottom: none;
		padding-bottom: 0;
	}

	.detail-package-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.detail-package-name {
		font-weight: 500;
		color: var(--admin-heading);
		font-size: 0.9rem;
	}

	.detail-package-price {
		font-weight: 500;
		color: var(--admin-heading);
		font-variant-numeric: tabular-nums;
		font-size: 0.9rem;
	}

	.detail-package-desc {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		margin: 0;
		line-height: 1.4;
	}

	.detail-included-list {
		list-style: none;
		padding: 0;
		margin: 4px 0 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-included-list li {
		font-size: 0.8rem;
		color: var(--admin-text);
		padding-left: 14px;
		position: relative;
	}

	.detail-included-list li::before {
		content: "\2022";
		position: absolute;
		left: 0;
		color: var(--admin-text-subtle);
	}

	.accepted-note {
		font-size: 0.82rem;
		color: var(--status-sage);
		margin-left: auto;
	}

	.declined-note {
		font-size: 0.82rem;
		color: var(--status-rose);
		margin-left: auto;
	}

	.expired-note {
		font-size: 0.82rem;
		color: var(--admin-text-subtle);
		margin-left: auto;
	}

	.convert-section {
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.convert-section-header {
		margin-bottom: 2px;
	}

	.convert-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.convert-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 4px;
	}

	.convert-status {
		border-top: 1px solid var(--admin-border);
		padding-top: 16px;
	}

	.convert-link {
		color: var(--admin-accent);
		text-decoration: none;
		font-size: 0.8rem;
	}

	.convert-link:hover {
		text-decoration: underline;
	}
</style>
