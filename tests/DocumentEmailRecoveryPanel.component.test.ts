import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentEmailRecoveryPanel from "../src/lib/pages/DocumentEmailRecoveryPanel.svelte";
import type { DocumentEmailRecovery } from "../src/lib/documentEmailRecovery";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = { type: "invoice" as const, id: "invoice-1" };
const components: ReturnType<typeof mount>[] = [];

function recovery(
	overrides: Partial<DocumentEmailRecovery> = {},
): DocumentEmailRecovery {
	return {
		protocolVersion: 1,
		attemptId: ATTEMPT_ID,
		document: DOCUMENT,
		status: "uncertain",
		recipient: "client@example.com",
		subject: "Invoice INV-1",
		failure: "delivery response was ambiguous",
		claimCount: 8,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_100,
		retryUntil: 1_700_082_800_000,
		resolveNotAcceptedAt: 1_700_082_800_000,
		portalExpired: false,
		canRetry: false,
		canFinalizeAcceptance: false,
		canRecordAcceptance: true,
		canResolveNotAccepted: true,
		...overrides,
	};
}

function mountPanel(
	overrides: Partial<{
		recovery: DocumentEmailRecovery | null;
		onretry: () => Promise<void>;
		onresolved: ReturnType<typeof vi.fn>;
		onterminal: ReturnType<typeof vi.fn>;
		ondismiss: ReturnType<typeof vi.fn>;
	}> = {},
) {
	const onretry = overrides.onretry ?? vi.fn(async () => {});
	const onresolved = overrides.onresolved ?? vi.fn();
	const onterminal = overrides.onterminal ?? vi.fn();
	const ondismiss = overrides.ondismiss ?? vi.fn();
	components.push(
		mount(DocumentEmailRecoveryPanel, {
			target: document.body,
			props: {
				attemptId: ATTEMPT_ID,
				document: DOCUMENT,
				recovery: overrides.recovery ?? recovery(),
				onretry,
				onresolved,
				onterminal,
				ondismiss,
			},
		}),
	);
	return { onretry, onresolved, onterminal, ondismiss };
}

function button(label: string): HTMLButtonElement {
	const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
		(value) => value.textContent?.trim() === label,
	);
	if (!match) throw new Error(`Missing ${label} button`);
	return match;
}

function inputValue(selector: string, value: string) {
	const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
	if (!input) throw new Error(`Missing ${selector}`);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("DocumentEmailRecoveryPanel", () => {
	it("shows explicit same-attempt recovery without starting any action on mount", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { onretry, onresolved } = mountPanel({
			recovery: recovery({ canRetry: true }),
		});
		await tick();

		expect(document.body.textContent).toContain("email delivery needs review");
		expect(document.activeElement?.classList.contains("recovery")).toBe(true);
		expect(document.body.textContent).toContain(ATTEMPT_ID);
		expect(document.body.textContent).toContain("no replacement send starts automatically");
		expect(button("retry same delivery")).toBeTruthy();
		expect(button("record acceptance").disabled).toBe(true);
		expect(button("record not accepted and release").disabled).toBe(true);
		inputValue(`#provider-message-${ATTEMPT_ID}`, "界".repeat(171));
		await tick();
		expect(button("record acceptance").disabled).toBe(true);
		expect(document.body.textContent).toContain("512 UTF-8 bytes or fewer");
		const providerInput = document.querySelector(
			`#provider-message-${ATTEMPT_ID}`,
		);
		expect(providerInput?.getAttribute("aria-invalid")).toBe("true");
		expect(providerInput?.getAttribute("aria-describedby")).toBe(
			`provider-message-error-${ATTEMPT_ID}`,
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(onretry).not.toHaveBeenCalled();
		expect(onresolved).not.toHaveBeenCalled();
	});

	it.each([
		["sent", "email delivery confirmed", "complete"],
		["resolved_not_sent", "email recorded as not accepted", "closed without send"],
		["failed", "email delivery rejected", "rejected"],
	] as const)(
		"renders terminal %s truthfully and hands cleanup the exact attempt",
		async (status, heading, label) => {
			const terminal = recovery({
				status,
				canRetry: false,
				canFinalizeAcceptance: false,
				canRecordAcceptance: false,
				canResolveNotAccepted: false,
			});
			const onterminal = vi.fn();
			const ondismiss = vi.fn();
			mountPanel({ recovery: terminal, onterminal, ondismiss });
			await tick();

			await vi.waitFor(() => expect(onterminal).toHaveBeenCalledTimes(1));
			expect(document.body.textContent).toContain(heading);
			expect(document.body.textContent).toContain(label);
			expect(document.body.textContent).not.toContain("retry same delivery");
			expect(onterminal).toHaveBeenCalledWith({
				attemptId: ATTEMPT_ID,
				recovery: terminal,
			});

			button("dismiss status").click();
			await vi.waitFor(() => expect(ondismiss).toHaveBeenCalledWith({
				attemptId: ATTEMPT_ID,
				recovery: terminal,
			}));
		},
	);

	it("reconciles a lost successful response when refresh finds sent", async () => {
		const sent = recovery({
			status: "sent",
			providerMessageId: "email_accepted",
			canRetry: false,
			canFinalizeAcceptance: false,
			canRecordAcceptance: false,
			canResolveNotAccepted: false,
		});
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ recovery: sent }), {
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onterminal = vi.fn();
		mountPanel({ recovery: recovery(), onterminal });
		await tick();

		button("refresh status").click();
		await vi.waitFor(() => expect(onterminal).toHaveBeenCalledWith({
			attemptId: ATTEMPT_ID,
			recovery: sent,
		}));
		expect(document.body.textContent).toContain("email delivery confirmed");
		expect(document.body.textContent).not.toContain("email delivery needs review");
	});

	it("records a provider acceptance ID through the fixed resolve route", async () => {
		const sent = recovery({
			status: "sent",
			providerMessageId: "email_accepted",
			canRecordAcceptance: false,
			canResolveNotAccepted: false,
		});
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ outcome: "sent", recovery: sent }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { onresolved } = mountPanel();
		await tick();

		inputValue(`#provider-message-${ATTEMPT_ID}`, "email_accepted");
		await tick();
		button("record acceptance").click();

		await vi.waitFor(() => expect(onresolved).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/admin/document-email-attempts/${ATTEMPT_ID}/resolve`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					expectedDocument: DOCUMENT,
					resolution: {
						kind: "accepted",
						providerMessageId: "email_accepted",
					},
				}),
			}),
		);
		expect(onresolved).toHaveBeenCalledWith({
			attemptId: ATTEMPT_ID,
			outcome: "sent",
			recovery: sent,
		});
	});

	it("requires checkbox, exact phrase, and a byte-bounded note before release", async () => {
		const released = recovery({
			status: "resolved_not_sent",
			canRecordAcceptance: false,
			canResolveNotAccepted: false,
		});
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ outcome: "released", recovery: released }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { onresolved } = mountPanel();
		await tick();
		const release = button("record not accepted and release");

		inputValue(`#absence-confirmation-${ATTEMPT_ID}`, "NOT ACCEPTED");
		inputValue(`#absence-note-${ATTEMPT_ID}`, "界".repeat(683));
		const checkbox = document.querySelector<HTMLInputElement>(
			'.check-row input[type="checkbox"]',
		)!;
		checkbox.click();
		await tick();
		expect(release.disabled).toBe(true);
		expect(document.body.textContent).toContain("2,048 UTF-8 bytes or fewer");

		inputValue(`#absence-note-${ATTEMPT_ID}`, "Checked Resend logs and found no message.");
		await tick();
		expect(release.disabled).toBe(false);
		release.click();

		await vi.waitFor(() => expect(onresolved).toHaveBeenCalledTimes(1));
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			expectedDocument: DOCUMENT,
			resolution: {
				kind: "not_accepted",
				confirmation: "NOT ACCEPTED",
				note: "Checked Resend logs and found no message.",
			},
		});
	});
});
