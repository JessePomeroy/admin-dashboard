import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuoteCreateModal from "../src/lib/pages/quotes/QuoteCreateModal.svelte";
import ContractCreateModal from "../src/lib/pages/contracts/ContractCreateModal.svelte";
import type { Client } from "../src/lib/types";
import { toId } from "../src/lib/utils";

const components: ReturnType<typeof mount>[] = [];
const clients: Client[] = [{
	_id: toId<"photographyClients">("client-1"), _creationTime: 1, siteUrl: "example.test",
	name: "Avery", email: "avery@example.test", category: "photography", status: "lead",
}];
const emailTemplates = [{
	_id: "template-1", name: "client note", category: "custom",
	subject: "hello {{clientName}}", body: "review {{portalUrl}}",
}];

async function value(selector: string, text: string) {
	const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
	if (!field) throw new Error(`Missing field: ${selector}`);
	field.value = text;
	field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
	await tick();
}

async function click(label: string) {
	const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
		.find((entry) => entry.textContent?.trim() === label);
	if (!button) throw new Error(`Missing button: ${label}`);
	expect(button.disabled).toBe(false);
	button.click();
	await tick();
}

afterEach(async () => {
	for (const component of components.splice(0)) await unmount(component);
	document.body.replaceChildren();
});

describe("quote and contract create email authority", () => {
	it.each(["quote", "contract"] as const)("sends paired raw %s email sources after editing", async (kind) => {
		const send = vi.fn<(payload: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined);
		if (kind === "quote") {
			components.push(mount(QuoteCreateModal, {
				target: document.body,
				props: {
					clients, presets: [], numberPreview: "QT-PREVIEW", emailTemplates, saving: false,
					onsave: vi.fn(async () => {}), onsaveandsend: send,
					onsaveaspreset: vi.fn(async () => {}), onclose: vi.fn(),
				},
			}));
		} else {
			components.push(mount(ContractCreateModal, {
				target: document.body,
				props: {
					clients, templates: [], emailTemplates, onsave: vi.fn(async () => {}),
					onsaveandsend: send, onclose: vi.fn(),
				},
			}));
		}
		await tick();
		await value("#create-client", "client-1");
		if (kind === "contract") {
			await value("#create-title", "Session agreement");
			await value("#create-body", "Contract terms");
		}
		await value("#tpl-select", "template-1");
		await click("edit source");
		await value("#tpl-subject", "updated {{clientName}}");
		await value("#tpl-body", "your document: {{portalUrl}}");
		await click("save & send");
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][0]).toMatchObject({
			clientId: "client-1",
			[kind === "contract" ? "emailTemplateId" : "templateId"]: "template-1",
			emailSubject: "updated {{clientName}}",
			emailBody: "your document: {{portalUrl}}",
		});
		expect(JSON.stringify(send.mock.calls[0][0])).not.toContain("Avery");
	});
});
