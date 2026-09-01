<script lang="ts">
import {
	isTerminalDocumentEmailRecovery,
	type DocumentEmailRecovery,
	type DocumentEmailReference,
	type DocumentEmailResolutionOutcome,
} from "../documentEmailRecovery";
import {
	getDocumentEmailRecovery,
	resolveDocumentEmailRecovery,
} from "./documentEmailRequest";

interface Props {
	attemptId: string;
	document: DocumentEmailReference;
	recovery?: DocumentEmailRecovery | null;
	sending?: boolean;
	onretry: () => Promise<void>;
	onresolved: (result: {
		attemptId: string;
		outcome: DocumentEmailResolutionOutcome;
		recovery: DocumentEmailRecovery;
	}) => void | Promise<void>;
	onterminal?: (result: {
		attemptId: string;
		recovery: DocumentEmailRecovery;
	}) => void | Promise<void>;
	ondismiss?: (result: {
		attemptId: string;
		recovery: DocumentEmailRecovery;
	}) => void | Promise<void>;
}

let {
	attemptId,
	document,
	recovery = null,
	sending = false,
	onretry,
	onresolved,
	onterminal,
	ondismiss,
}: Props = $props();

let currentRecovery = $state<DocumentEmailRecovery | null>(null);
let panelElement = $state<HTMLElement | null>(null);
let focusedAttemptId = "";
let notifiedTerminalKey = "";
let localBusy = $state(false);
let actionError = $state("");
let providerMessageId = $state("");
let absenceChecked = $state(false);
let absenceConfirmation = $state("");
let absenceNote = $state("");

function utf8Bytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

async function notifyTerminal(value: DocumentEmailRecovery) {
	if (!isTerminalDocumentEmailRecovery(value)) return;
	const key = `${value.attemptId}:${value.status}:${value.updatedAt}`;
	if (notifiedTerminalKey === key) return;
	notifiedTerminalKey = key;
	try {
		await onterminal?.({ attemptId: value.attemptId, recovery: value });
	} catch (error) {
		notifiedTerminalKey = "";
		actionError =
			error instanceof Error
				? error.message
				: "The terminal delivery state could not be applied.";
	}
}

$effect(() => {
	currentRecovery = recovery;
	if (recovery) void notifyTerminal(recovery);
});

$effect(() => {
	if (!panelElement || focusedAttemptId === attemptId) return;
	focusedAttemptId = attemptId;
	queueMicrotask(() => panelElement?.focus({ preventScroll: true }));
});

let busy = $derived(sending || localBusy);
let canSubmitNotAccepted = $derived(
	currentRecovery?.canResolveNotAccepted === true &&
		absenceChecked &&
		absenceConfirmation === "NOT ACCEPTED" &&
		absenceNote.trim().length > 0 &&
		utf8Bytes(absenceNote.trim()) <= 2048,
);
let providerMessageIdValid = $derived(
	providerMessageId.trim().length > 0 &&
		utf8Bytes(providerMessageId.trim()) <= 512,
);
let providerMessageIdTooLong = $derived(
	providerMessageId.trim().length > 0 &&
		utf8Bytes(providerMessageId.trim()) > 512,
);
let absenceConfirmationInvalid = $derived(
	absenceConfirmation.length > 0 && absenceConfirmation !== "NOT ACCEPTED",
);
let absenceNoteTooLong = $derived(utf8Bytes(absenceNote.trim()) > 2048);
let terminal = $derived(
	currentRecovery ? isTerminalDocumentEmailRecovery(currentRecovery) : false,
);

function recoveryHeading(value: DocumentEmailRecovery | null): string {
	switch (value?.status) {
		case "sent":
			return "email delivery confirmed";
		case "resolved_not_sent":
			return "email recorded as not accepted";
		case "failed":
			return "email delivery rejected";
		default:
			return "email delivery needs review";
	}
}

function recoverySummary(value: DocumentEmailRecovery | null): string {
	switch (value?.status) {
		case "sent":
			return "The provider acceptance is recorded and the document delivery is complete.";
		case "resolved_not_sent":
			return "This attempt was closed without a provider acceptance. No replacement email was sent.";
		case "failed":
			return "The provider definitively rejected this attempt. Review the message before starting a separate send.";
		default:
			return "The original attempt remains locked. Every retry below uses that same frozen message; no replacement send starts automatically.";
	}
}

function utcTime(value: number): string {
	return new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

async function refreshRecovery() {
	localBusy = true;
	actionError = "";
	try {
		currentRecovery = await getDocumentEmailRecovery(attemptId, document);
		await notifyTerminal(currentRecovery);
	} catch (error) {
		actionError =
			error instanceof Error
				? error.message
				: "The delivery status could not be refreshed.";
	} finally {
		localBusy = false;
	}
}

async function dismissTerminal() {
	if (!currentRecovery || !terminal) return;
	try {
		await ondismiss?.({ attemptId, recovery: currentRecovery });
	} catch (error) {
		actionError =
			error instanceof Error
				? error.message
				: "The delivery status could not be dismissed.";
	}
}

async function retrySameDelivery() {
	actionError = "";
	try {
		await onretry();
	} catch (error) {
		actionError =
			error instanceof Error ? error.message : "The delivery retry failed.";
	}
}

async function resolveAccepted(messageId?: string) {
	localBusy = true;
	actionError = "";
	try {
		const result = await resolveDocumentEmailRecovery(attemptId, document, {
			kind: "accepted",
			...(messageId ? { providerMessageId: messageId.trim() } : {}),
		});
		currentRecovery = result.recovery;
		await onresolved({ attemptId, ...result });
	} catch (error) {
		actionError =
			error instanceof Error
				? error.message
				: "The accepted delivery could not be recorded.";
	} finally {
		localBusy = false;
	}
}

async function resolveNotAccepted() {
	if (!canSubmitNotAccepted) return;
	localBusy = true;
	actionError = "";
	try {
		const result = await resolveDocumentEmailRecovery(attemptId, document, {
			kind: "not_accepted",
			confirmation: "NOT ACCEPTED",
			note: absenceNote.trim(),
		});
		currentRecovery = result.recovery;
		await onresolved({ attemptId, ...result });
	} catch (error) {
		actionError =
			error instanceof Error
				? error.message
				: "The delivery could not be released.";
	} finally {
		localBusy = false;
	}
}
</script>

<section
	class="recovery"
	aria-labelledby={`email-recovery-${attemptId}`}
	aria-live="polite"
	tabindex="-1"
	bind:this={panelElement}
>
	<div class="recovery-heading">
		<div>
			<p class="eyebrow">delivery reconciliation</p>
			<h3 id={`email-recovery-${attemptId}`}>{recoveryHeading(currentRecovery)}</h3>
		</div>
		<button class="quiet-action" type="button" onclick={refreshRecovery} disabled={busy}>
			{localBusy ? "checking…" : "refresh status"}
		</button>
	</div>

	<p class="summary">{recoverySummary(currentRecovery)}</p>

	<dl class="facts">
		{#if currentRecovery}
			<div>
				<dt>recipient</dt>
				<dd>{currentRecovery.recipient}</dd>
			</div>
			<div>
				<dt>subject</dt>
				<dd>{currentRecovery.subject}</dd>
			</div>
		{/if}
		<div>
			<dt>attempt</dt>
			<dd><code>{attemptId}</code></dd>
		</div>
	</dl>

	{#if currentRecovery?.failure}
		<p class="provider-note"><span>last provider result</span>{currentRecovery.failure}</p>
	{/if}
	{#if currentRecovery?.portalExpired}
		<p class="warning" role="status">
			The attached client portal link has expired. Resolve this attempt before
			preparing any replacement.
		</p>
	{/if}
	{#if actionError}
		<p class="action-error" role="alert">{actionError}</p>
	{/if}

	{#if terminal && currentRecovery}
		<div class:terminal-error={currentRecovery.status === "failed"} class="terminal-result" role="status">
			<span>{currentRecovery.status === "sent" ? "complete" : currentRecovery.status === "failed" ? "rejected" : "closed without send"}</span>
			{#if ondismiss}
				<button class="quiet-action" type="button" onclick={dismissTerminal} disabled={busy}>
					dismiss status
				</button>
			{/if}
		</div>
	{:else}
		<div class="primary-actions">
			{#if !currentRecovery || currentRecovery.canRetry}
				<button class="primary-action" type="button" onclick={retrySameDelivery} disabled={busy}>
					{sending ? "retrying…" : "retry same delivery"}
				</button>
			{/if}
			{#if currentRecovery?.canFinalizeAcceptance}
				<button class="primary-action" type="button" onclick={() => resolveAccepted()} disabled={busy}>
					finish known acceptance
				</button>
			{/if}
		</div>

	{#if currentRecovery?.canRecordAcceptance}
		<form
			class="acceptance-form"
			onsubmit={(event) => {
				event.preventDefault();
				if (providerMessageIdValid) resolveAccepted(providerMessageId);
			}}
		>
			<label for={`provider-message-${attemptId}`}>provider acceptance ID</label>
			<div class="inline-form">
				<input
					id={`provider-message-${attemptId}`}
					type="text"
					maxlength="512"
					autocomplete="off"
					spellcheck="false"
					bind:value={providerMessageId}
					aria-invalid={providerMessageIdTooLong}
					aria-describedby={providerMessageIdTooLong
						? `provider-message-error-${attemptId}`
						: `provider-message-help-${attemptId}`}
					placeholder="for example, a Resend email ID"
				/>
				<button type="submit" disabled={busy || !providerMessageIdValid}>
					record acceptance
				</button>
			</div>
			<p id={`provider-message-help-${attemptId}`}>Use this only after locating the accepted message in the provider dashboard.</p>
			{#if providerMessageIdTooLong}
				<p id={`provider-message-error-${attemptId}`} class="field-error" role="alert">The provider ID must be 512 UTF-8 bytes or fewer.</p>
			{/if}
		</form>
	{/if}

	{#if currentRecovery?.canResolveNotAccepted}
		<details class="release">
			<summary>provider confirms no email was accepted</summary>
			<div class="release-body">
				<p>
					This releases the document for a future, separate send. It does not send
					anything now and cannot be used while provider acceptance is still possible.
				</p>
				<label class="check-row">
					<input type="checkbox" bind:checked={absenceChecked} />
					<span>I checked the provider dashboard and found no accepted email for this attempt.</span>
				</label>
				<label for={`absence-confirmation-${attemptId}`}>
					type <strong>NOT ACCEPTED</strong> to confirm
				</label>
				<input
					id={`absence-confirmation-${attemptId}`}
					type="text"
					autocomplete="off"
					spellcheck="false"
					bind:value={absenceConfirmation}
					aria-invalid={absenceConfirmationInvalid}
					aria-describedby={absenceConfirmationInvalid
						? `absence-confirmation-error-${attemptId}`
						: undefined}
				/>
				{#if absenceConfirmationInvalid}
					<p id={`absence-confirmation-error-${attemptId}`} class="field-error" role="alert">Type NOT ACCEPTED exactly.</p>
				{/if}
				<label for={`absence-note-${attemptId}`}>reconciliation note</label>
				<textarea
					id={`absence-note-${attemptId}`}
					rows="3"
					maxlength="2048"
					bind:value={absenceNote}
					aria-invalid={absenceNoteTooLong}
					aria-describedby={absenceNoteTooLong
						? `absence-note-error-${attemptId}`
						: undefined}
					placeholder="Where you checked and what you found"
				></textarea>
				{#if absenceNoteTooLong}
					<p id={`absence-note-error-${attemptId}`} class="field-error" role="alert">The note must be 2,048 UTF-8 bytes or fewer.</p>
				{/if}
				<button class="release-action" type="button" onclick={resolveNotAccepted} disabled={busy || !canSubmitNotAccepted}>
					record not accepted and release
				</button>
			</div>
		</details>
	{:else if currentRecovery && currentRecovery.status === "uncertain"}
		<p class="locked-note">
			“not accepted” remains locked until
			{utcTime(currentRecovery.resolveNotAcceptedAt)} unless provider acceptance is recorded first.
		</p>
	{/if}
	{/if}
</section>

<style>
	.recovery {
		width: 100%;
		padding: 18px 0 4px 18px;
		border-left: 2px solid var(--admin-warning, #b88945);
		font-family: "Synonym", system-ui, sans-serif;
		text-align: left;
	}

	.recovery:focus {
		outline: 2px solid var(--admin-accent);
		outline-offset: 4px;
	}

	.recovery-heading,
	.inline-form,
	.primary-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.terminal-result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 16px;
		padding: 10px 12px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 4px;
		color: var(--admin-heading);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.terminal-result.terminal-error {
		border-color: var(--admin-error, #c56f64);
		color: var(--admin-error, #c56f64);
	}

	.recovery-heading {
		justify-content: space-between;
		align-items: flex-start;
	}

	.eyebrow,
	h3,
	.summary,
	.provider-note,
	.warning,
	.action-error,
	.locked-note,
	.acceptance-form p,
	.release p {
		margin: 0;
	}

	.eyebrow,
	dt,
	.provider-note span {
		color: var(--admin-text-subtle);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h3 {
		margin-top: 3px;
		color: var(--admin-heading);
		font-family: "Chillax", sans-serif;
		font-size: 1rem;
		font-weight: 500;
	}

	.summary {
		max-width: 66ch;
		margin-top: 12px;
		color: var(--admin-text-muted);
		font-size: 0.78rem;
		line-height: 1.55;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 22px;
		margin: 16px 0;
	}

	.facts div:last-child {
		grid-column: 1 / -1;
	}

	dt {
		margin-bottom: 3px;
	}

	dd {
		margin: 0;
		color: var(--admin-text);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}

	code {
		color: var(--admin-text-muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
	}

	.provider-note,
	.warning,
	.action-error,
	.field-error,
	.locked-note {
		margin-top: 10px;
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.provider-note {
		color: var(--admin-text-muted);
	}

	.provider-note span {
		display: block;
		margin-bottom: 3px;
	}

	.warning,
	.action-error,
	.field-error {
		color: var(--admin-error, #c56f64);
	}

	.primary-actions {
		flex-wrap: wrap;
		margin-top: 16px;
	}

	button,
	input,
	textarea {
		font: inherit;
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.primary-action,
	.inline-form button,
	.release-action,
	.quiet-action {
		border-radius: 4px;
		font-size: 0.73rem;
	}

	.primary-action,
	.inline-form button {
		padding: 8px 11px;
		border: 1px solid var(--admin-border-strong);
		background: transparent;
		color: var(--admin-heading);
	}

	.quiet-action {
		padding: 4px 0;
		border: 0;
		background: transparent;
		color: var(--admin-text-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.acceptance-form,
	.release {
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid var(--admin-border);
	}

	.acceptance-form label,
	.release label {
		display: block;
		margin-bottom: 6px;
		color: var(--admin-text-muted);
		font-size: 0.72rem;
	}

	.inline-form input {
		flex: 1;
	}

	input[type="text"],
	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1px solid var(--admin-border-strong);
		border-radius: 4px;
		outline: none;
		background: var(--admin-surface, transparent);
		color: var(--admin-text);
		font-size: 0.76rem;
	}

	input:focus,
	textarea:focus,
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--admin-accent);
		outline-offset: 2px;
	}

	.acceptance-form p,
	.locked-note {
		margin-top: 7px;
		color: var(--admin-text-subtle);
		font-size: 0.7rem;
	}

	.release summary {
		color: var(--admin-error, #c56f64);
		font-size: 0.74rem;
		cursor: pointer;
	}

	.release-body {
		display: grid;
		gap: 9px;
		margin-top: 12px;
	}

	.release-body p {
		color: var(--admin-text-muted);
		font-size: 0.73rem;
		line-height: 1.5;
	}

	.check-row {
		display: flex !important;
		align-items: flex-start;
		gap: 8px;
	}

	.check-row input {
		margin-top: 2px;
	}

	.release-action {
		justify-self: start;
		padding: 8px 11px;
		border: 1px solid var(--admin-error, #c56f64);
		background: transparent;
		color: var(--admin-error, #c56f64);
	}

	@media (max-width: 640px) {
		.recovery-heading,
		.inline-form {
			align-items: stretch;
			flex-direction: column;
		}

		.quiet-action {
			align-self: flex-start;
		}

		.facts {
			grid-template-columns: 1fr;
		}

		.facts div:last-child {
			grid-column: auto;
		}
	}
</style>
