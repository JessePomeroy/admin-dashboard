<script lang="ts">
import { useQuery, useConvexClient } from "@mmailaender/convex-svelte";
import { getAdminConfig } from "../config";
import FeatureGate from "../components/FeatureGate.svelte";
import LoadingState from "../components/LoadingState.svelte";
import ConversationView from "./messages/ConversationView.svelte";
import ThreadList from "./messages/ThreadList.svelte";

interface Thread {
	client: {
		_id: string;
		name: string;
		siteUrl: string;
	};
	unreadCount: number;
	latestMessage: {
		_id: string;
		siteUrl: string;
		sender: "client" | "creator";
		content: string;
		read: boolean;
		_creationTime: number;
	} | null;
}

const config = getAdminConfig();
const { api } = config;

let { data } = $props();

const client = useConvexClient();
const threadsQuery = useQuery(api.messages.allThreads, {});
const platformClientsQuery = useQuery(api.platform.listAll, {});

let threads = $derived(threadsQuery.data ?? []);
let platformClients = $derived(platformClientsQuery.data ?? []);
let clientsWithoutThreads = $derived(
	platformClients.filter((pc: any) => !threads.some((t: Thread) => t.client.siteUrl === pc.siteUrl))
);

let selectedThread = $state<Thread | null>(null);
let selectedSiteUrl = $state<string | null>(null);
const messagesQuery = useQuery(api.messages.list, () => selectedSiteUrl ? { siteUrl: selectedSiteUrl } : "skip");
let messages = $derived(messagesQuery.data ?? []);
let messageInput = $state("");
let sending = $state(false);
let mobileShowConversation = $state(false);
let showNewMessage = $state(false);

async function selectThread(thread: Thread) {
	selectedThread = thread;
	selectedSiteUrl = thread.client.siteUrl;
	mobileShowConversation = true;

	try {
		if (thread.unreadCount > 0) {
			await client.mutation(api.messages.markRead, { siteUrl: thread.client.siteUrl });
		}
	} catch (err) {
		console.error("Failed to mark messages read:", err);
	}
}

async function sendMessage() {
	if (!messageInput.trim() || !selectedThread || sending) return;
	sending = true;
	const content = messageInput.trim();
	messageInput = "";

	try {
		await client.mutation(api.messages.send, {
			siteUrl: selectedThread.client.siteUrl,
			sender: "creator",
			content,
		});
	} catch (err) {
		console.error("Failed to send message:", err);
	} finally {
		sending = false;
	}
}

function startNewConversation(platformClient: any) {
	selectedThread = {
		client: {
			_id: platformClient._id,
			name: platformClient.name,
			siteUrl: platformClient.siteUrl,
		},
		unreadCount: 0,
		latestMessage: null,
	};
	selectedSiteUrl = platformClient.siteUrl;
	mobileShowConversation = true;
	showNewMessage = false;
}

function goBackToThreads() {
	mobileShowConversation = false;
	selectedThread = null;
}

function handleMessageInput(value: string) {
	messageInput = value;
}

function handleNewMessageKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") showNewMessage = false;
}
</script>

<FeatureGate feature="messages" tier={data.tier}>
{#if threadsQuery.isLoading}
	<LoadingState />
{:else}
<div class="messages-page">
	<header class="page-header">
		<h1>messages</h1>
		{#if clientsWithoutThreads.length > 0}
			<div class="new-message-wrapper">
				<button class="btn-new" aria-expanded={showNewMessage} onclick={() => { showNewMessage = !showNewMessage; }} onkeydown={handleNewMessageKeydown}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
					new message
				</button>
				{#if showNewMessage}
					<div class="new-message-dropdown">
						{#each clientsWithoutThreads as pc (pc._id)}
							<button class="dropdown-item" onclick={() => startNewConversation(pc)}>
								<span class="dropdown-name">{pc.name}</span>
								<span class="dropdown-url">{pc.siteUrl}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</header>

	{#if threads.length === 0 && !selectedThread}
		<div class="empty-state">
			<p class="empty-text">no conversations yet — start one with the "new message" button</p>
		</div>
	{:else}
		<div class="messages-layout">
			<ThreadList
				{threads}
				selectedClientId={selectedThread?.client._id ?? null}
				mobileHidden={mobileShowConversation}
				onselect={selectThread}
			/>

			<ConversationView
				thread={selectedThread}
				{messages}
				loading={messagesQuery.isLoading}
				{sending}
				mobileHidden={!mobileShowConversation}
				oninput={handleMessageInput}
				onsend={sendMessage}
				onback={goBackToThreads}
				inputValue={messageInput}
			/>
		</div>
	{/if}
</div>
{/if}
</FeatureGate>

<style>
	.messages-page {
		padding: 36px 40px;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		flex-shrink: 0;
	}

	.page-header h1 {
		font-family: "Chillax", sans-serif;
		font-size: 1.35rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.new-message-wrapper {
		position: relative;
	}

	.btn-new {
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

	.btn-new:hover {
		color: var(--admin-heading);
		border-color: var(--admin-text-muted);
	}

	.new-message-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--admin-bg);
		border: 1px solid var(--admin-border-strong);
		border-radius: 8px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		min-width: 240px;
		max-height: 300px;
		overflow-y: auto;
		z-index: 20;
	}

	.dropdown-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 10px 14px;
		background: none;
		border: none;
		border-bottom: 1px solid var(--admin-border);
		cursor: pointer;
		text-align: left;
		font-family: "Synonym", system-ui, sans-serif;
		transition: background 0.12s;
	}

	.dropdown-item:last-child {
		border-bottom: none;
	}

	.dropdown-item:hover {
		background: var(--admin-active);
	}

	.dropdown-name {
		font-size: 0.85rem;
		color: var(--admin-heading);
		font-weight: 500;
	}

	.dropdown-url {
		font-size: 0.73rem;
		color: var(--admin-text-muted);
	}

	/* Empty state */
	.empty-state {
		padding: 48px 0;
	}

	.empty-text {
		color: var(--admin-text-subtle);
		font-size: 0.88rem;
		margin: 0;
	}

	/* Two-panel layout */
	.messages-layout {
		display: flex;
		flex: 1;
		min-height: 0;
		gap: 0;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.messages-page {
			padding: 16px 12px;
		}

		.page-header {
			margin-bottom: 16px;
		}

		.messages-layout {
			position: relative;
		}
	}
</style>
