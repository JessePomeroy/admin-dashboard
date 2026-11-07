import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import GmailConversations from "../src/lib/pages/gmail/GmailConversations.svelte";
import type { GmailDetail } from "../src/lib/pages/gmail/types";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), dirty: vi.fn() }));
const details = new Map<string, GmailDetail>();
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => mocks }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	siteUrl: "example.test", gmail: { endpoint: "/api/admin/gmail" },
	api: { gmailConversations: { connection: "connection", list: "list", detail: "detail", messages: "messages", saveDraft: "saveDraft" } },
}) }));
vi.mock("convex-svelte", () => ({
	useQuery: (ref: string, args: () => { conversationId?: string }) => ({
		get data() { return ref === "connection" ? { mailbox: details.get("thread1")?.mailbox } : details.get(args().conversationId ?? ""); },
		isLoading: false,
	}),
	usePaginatedQuery: (ref: string) => ({
		get results() { return ref === "list" ? [...details.values()].map(detail => detail.conversation) : []; },
		status: "Exhausted", loadMore() {},
	}),
}));

let component: ReturnType<typeof mount> | undefined;
function detail(id: string, recipient: string): GmailDetail {
	return {
		conversation: { _id: id, recipient, subject: `Subject ${id}`, revision: 1 },
		mailbox: { address: "owner@example.test", status: "connected", lastSyncAt: Date.now(), watchExpiresAt: Date.now() + 86_400_000, problem: null, recovering: false },
		recipientChanged: false,
		policy: { fileBytes: 3_145_728, messageFileBytes: 6_291_456, files: 5, bodyCharacters: 32_000, staleAfterMs: 120_000 },
		draft: { text: `Saved draft ${id}`, revision: 1, attachments: [] }, attempt: null,
	};
}
function select() {
	const control = document.querySelector<HTMLSelectElement>(".gmail-conversations > select");
	if (!control) throw new Error("Missing conversation selector");
	return control;
}
function reply() {
	const control = document.querySelector<HTMLTextAreaElement>("textarea");
	if (!control) throw new Error("Missing reply composer");
	return control;
}
function button(label: string) {
	const control = [...document.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent?.trim() === label);
	if (!control) throw new Error(`Missing button: ${label}`);
	return control;
}
async function choose(id: string) {
	select().value = id;
	select().dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
}
async function render() {
	component = mount(GmailConversations, { target: document.body, props: { inquiryId: "inquiry1", ondirty: mocks.dirty } });
	await tick();
	await choose("thread1");
	expect(reply().value).toBe("Saved draft thread1");
}
async function failDraftSave() {
	reply().value = "Unsaved Alex reply — Keep This Capitalization.";
	reply().dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	button("save draft").click();
	await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save this draft"));
	expect(mocks.mutation).toHaveBeenCalledWith("saveDraft", {
		conversationId: "thread1", text: "Unsaved Alex reply — Keep This Capitalization.", attachmentIds: [], expectedRevision: 1,
	});
}

beforeEach(() => {
	vi.resetAllMocks();
	details.clear();
	details.set("thread1", detail("thread1", "alex@example.test"));
	details.set("thread2", detail("thread2", "morgan@example.test"));
	mocks.mutation.mockRejectedValue(new Error("Fictional save rejection"));
	vi.stubGlobal("confirm", vi.fn(() => false));
});
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe("Gmail conversation selection", () => {
	it.each(["thread2", ""])("retains the selector, recipient and unsaved reply when a switch to %j is declined", async target => {
		await render();
		await failDraftSave();
		await choose(target);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(select().value).toBe("thread1");
		expect(reply().id).toBe("gmail-reply-thread1");
		expect(reply().value).toBe("Unsaved Alex reply — Keep This Capitalization.");
		expect(document.querySelector(".thread-meta strong")?.textContent).toBe("alex@example.test");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save this draft");
		expect(button("send reply").disabled).toBe(true);
		expect(mocks.dirty).toHaveBeenLastCalledWith(true);
	});

	it("aligns the selector and recipient with the accepted conversation's saved draft", async () => {
		await render();
		await failDraftSave();
		vi.mocked(confirm).mockReturnValue(true);
		await choose("thread2");
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(select().value).toBe("thread2");
		expect(reply().id).toBe("gmail-reply-thread2");
		expect(reply().value).toBe("Saved draft thread2");
		expect(document.querySelector(".thread-meta strong")?.textContent).toBe("morgan@example.test");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(mocks.dirty).toHaveBeenLastCalledWith(false);
	});

	it("closes the thread when returning to the placeholder is explicitly accepted", async () => {
		await render();
		await failDraftSave();
		vi.mocked(confirm).mockReturnValue(true);
		await choose("");
		expect(select().value).toBe("");
		expect(document.querySelector("textarea")).toBeNull();
		expect(button("open conversation for this record").disabled).toBe(false);
		expect(mocks.dirty).toHaveBeenLastCalledWith(false);
	});

	it("switches a clean draft without prompting or saving it again", async () => {
		await render();
		await choose("thread2");
		expect(confirm).not.toHaveBeenCalled();
		expect(mocks.mutation).not.toHaveBeenCalled();
		expect(select().value).toBe("thread2");
		expect(reply().id).toBe("gmail-reply-thread2");
		expect(reply().value).toBe("Saved draft thread2");
	});
});
