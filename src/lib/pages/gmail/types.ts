export interface GmailFile {
	_id: string; name: string; type: string; size: number; sha256?: string;
	status: "pending" | "ready" | "blocked"; problem?: string;
}
export interface GmailMailbox {
	address: string; status: "connected" | "reconnect" | "disconnected";
	lastSyncAt: number | null; watchExpiresAt: number; problem: string | null; recovering: boolean;
	lastNoticeAt?: number | null; leaseExpiresAt?: number | null; progress?: { completed: number; total: number } | null; dataDeletionRequested?: boolean;
}
export type GmailWorkflow = "review" | "needs_reply" | "waiting" | "done";
export interface GmailConversation {
	_id: string; recipient: string; subject: string; threadId?: string; revision: number; problem?: string; lastRfcId?: string;
	workflowState?: GmailWorkflow; followUpAt?: number; importPending?: boolean; retentionHoldAt?: number; deletingAt?: number;
}
export interface GmailDetail {
	conversation: GmailConversation; mailbox: GmailMailbox | null; recipientChanged: boolean;
	expiresAt?: number;
	policy: { fileBytes: number; messageFileBytes: number; files: number; bodyCharacters: number; staleAfterMs: number };
	draft: { text: string; revision: number; attachments: GmailFile[] };
	attempt: { _id: string; status: "queued" | "submitting" | "accepted" | "failed" | "uncertain"; problem: string | null; rfcId?: string; startedAt?: number | null; checkedAt?: number | null; checkOutcome?: "accepted" | "not_found" | "ambiguous" | "mismatch" | "unavailable" | null } | null;
}
export interface GmailMessage {
	_id: string; providerId: string; rfcId?: string; from: string; text: string; sent: boolean; date: number; origin: "admin" | "gmail"; blocked?: string; attachments: GmailFile[];
}
