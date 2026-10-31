<script lang="ts">
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";

let { id }: { id: string } = $props();
const api = getAdminConfig().api.inquiryNotifications!;
const client = useAdminClient();
const query = useQuery(api.status, () => ({ inquiryId: id }));
type Status = {
	state: "pending" | "sending" | "accepted" | "failed" | "uncertain";
	attempts: number;
	nextAt: number;
	errorCode: string | null;
	canRetry: boolean;
};
const notice = $derived(query.data as Status | null | undefined);
let busy = $state(false);
let error = $state("");
const labels = {
	pending: "queued for delivery",
	sending: "delivery in progress",
	accepted: "accepted by email provider",
	failed: "delivery failed",
	uncertain: "delivery could not be confirmed",
};
async function retry() {
	if (busy || !notice?.canRetry) return;
	busy = true;
	error = "";
	try {
		await client.mutation(api.retry, { inquiryId: id });
	} catch {
		error = "Could not queue the notification. Reload its status before trying again.";
	} finally {
		busy = false;
	}
}
</script>
<section aria-label="Owner email notification" class="notification">
 <h3>owner notification</h3>
 {#if query.error}<p role="alert">Notification status is unavailable. Reopen this inquiry to try again.</p>
 {:else if query.isLoading}<p role="status">loading notification status…</p>
 {:else if notice}
  <p role="status">{labels[notice.state]} · {notice.attempts} {notice.attempts === 1 ? "attempt" : "attempts"}</p>
  {#if notice.state === "accepted"}<p class="hint">Provider acceptance does not confirm inbox delivery.</p>{/if}
  {#if notice.state === "uncertain"}<p class="hint">The inquiry is saved. A safe retry uses the same provider send key.</p>{/if}
  {#if notice.canRetry}<button disabled={busy} onclick={retry}>{busy ? "queueing…" : "retry owner notification"}</button>
  {:else if notice.state === "failed" || notice.state === "uncertain"}<p class="hint">Automatic retries have stopped. Review the provider log before sending a separate message.</p>{/if}
 {:else}<p class="hint">No tracked notification for this inquiry.</p>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
	.notification {
		margin-bottom: 24px;
		padding-block: 16px;
		border-block: 1px solid var(--admin-border);
	}
	h3 {
		margin: 0 0 8px;
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--admin-text-muted);
	}
	p {
		margin: 6px 0;
		font-size: 0.85rem;
		color: var(--admin-text);
	}
	.hint {
		font-size: 0.78rem;
		color: var(--admin-text-muted);
		line-height: 1.5;
	}
	button {
		margin-top: 8px;
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--admin-border-strong);
		background: transparent;
		color: var(--admin-text);
		cursor: pointer;
		font: inherit;
	}
	button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
</style>
