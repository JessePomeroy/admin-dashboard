import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import InvoiceCreateModal from "../src/lib/pages/invoicing/InvoiceCreateModal.svelte";

const components: ReturnType<typeof mount>[] = [];

const emailTemplates = [
	{
		_id: "template-1",
		name: "invoice note",
		category: "custom",
		subject: "invoice {{invoiceNumber}}",
		body: "hi {{clientName}}, review {{portalUrl}}",
	},
];

function mountModal(templates = emailTemplates) {
	const onSaveAndSend = vi.fn(async () => {});
	components.push(
		mount(InvoiceCreateModal, {
			target: document.body,
			props: {
				clients: [
					{
						_id: "client-1" as never,
						_creationTime: 1,
						siteUrl: "example.test",
						name: "Avery",
						email: "avery@example.com",
						category: "photography",
						status: "lead",
					},
				],
				invoices: [],
				numberPreview: "INV-PREVIEW",
				emailTemplates: templates,
				oncreate: vi.fn(async () => {}),
				onsaveandsend: onSaveAndSend,
				onclose: vi.fn(),
			},
		}),
	);
	return onSaveAndSend;
}

async function chooseClient() {
	const select = document.querySelector<HTMLSelectElement>("#create-client")!;
	select.value = "client-1";
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
}

async function saveAndSend() {
	const action = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
		({ textContent }) => textContent?.trim() === "save & send",
	);
	if (!action) throw new Error("Missing save & send button");
	action.click();
	await tick();
	await Promise.resolve();
}

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
});

describe("InvoiceCreateModal email authority", () => {
	it("shows the generated default email even when the site has no saved templates", async () => {
		mountModal([]);
		await tick();

		expect(document.querySelector("#tpl-select")).toBeTruthy();
		expect(document.body.textContent).toContain("generated email outline");
		expect(document.body.textContent).toContain("write custom email");
	});

	it("sends no email override fields when the default preview is untouched", async () => {
		const onSaveAndSend = mountModal();
		await chooseClient();
		await saveAndSend();

		expect(onSaveAndSend).toHaveBeenCalledOnce();
		const payload = onSaveAndSend.mock.calls[0]?.[0];
		expect(payload).not.toHaveProperty("templateId");
		expect(payload).not.toHaveProperty("emailSubject");
		expect(payload).not.toHaveProperty("emailBody");
	});

	it("sends only templateId when a selected template is untouched", async () => {
		const onSaveAndSend = mountModal();
		await chooseClient();
		const select = document.querySelector<HTMLSelectElement>("#tpl-select")!;
		select.value = "template-1";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		await saveAndSend();

		const payload = onSaveAndSend.mock.calls[0]?.[0];
		expect(payload.templateId).toBe("template-1");
		expect(payload).not.toHaveProperty("emailSubject");
		expect(payload).not.toHaveProperty("emailBody");
	});

	it("sends paired raw sources after a genuine edit", async () => {
		const onSaveAndSend = mountModal();
		await chooseClient();
		const select = document.querySelector<HTMLSelectElement>("#tpl-select")!;
		select.value = "template-1";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		const editButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
			({ textContent }) => textContent?.trim() === "edit source",
		)!;
		editButton.click();
		await tick();
		const subject = document.querySelector<HTMLInputElement>("#tpl-subject")!;
		subject.value = "updated invoice {{invoiceNumber}}";
		subject.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		await saveAndSend();

		expect(onSaveAndSend.mock.calls[0]?.[0]).toMatchObject({
			templateId: "template-1",
			emailSubject: "updated invoice {{invoiceNumber}}",
			emailBody: "hi {{clientName}}, review {{portalUrl}}",
		});
		expect(JSON.stringify(onSaveAndSend.mock.calls[0]?.[0])).not.toContain("INV-PREVIEW");
	});
});
