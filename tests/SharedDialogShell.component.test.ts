import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import CreateTemplateModal from "../src/lib/pages/emails/CreateTemplateModal.svelte";
import TemplateDetailModal from "../src/lib/pages/emails/TemplateDetailModal.svelte";
import ClientDetailModal from "../src/lib/pages/platform/ClientDetailModal.svelte";

const template = {
	_id: "template-1",
	name: "Welcome",
	category: "inquiry-reply",
	subject: "Hello",
	body: "Hi {{clientName}}",
	variables: ["clientName"],
};
const client = {
	name: "Photographer",
	email: "artist@example.test",
	siteUrl: "example.test",
	tier: "basic",
	subscriptionStatus: "none",
	_creationTime: 1,
};
const categories = ["inquiry-reply", "custom"];
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.innerHTML = "";
});
const dialogs = [
	{
		name: "Create email template",
		render: (onclose: () => void) =>
			mount(CreateTemplateModal, {
				target: document.body,
				props: {
					isOpen: true,
					saving: false,
					categories,
					onclose,
					onsave: vi.fn(),
				},
			}),
	},
	{
		name: "Email template details",
		render: (onclose: () => void) =>
			mount(TemplateDetailModal, {
				target: document.body,
				props: {
					template,
					saving: false,
					categories,
					onclose,
					onsave: vi.fn(),
					ondelete: vi.fn(),
				},
			}),
	},
	{
		name: "Platform client details",
		render: (onclose: () => void) =>
			mount(ClientDetailModal, {
				target: document.body,
				props: {
					client,
					saving: false,
					onclose,
					onsave: vi.fn(),
					ontiertoggle: vi.fn(),
					onstatusupdate: vi.fn(),
				},
			}),
	},
];
it.each(dialogs)("contains focus and routes dismissal for $name", async ({
	name,
	render,
}) => {
	const trigger = document.createElement("button");
	document.body.append(trigger);
	trigger.focus();
	const onclose = vi.fn();
	component = render(onclose);
	await tick();
	const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
	expect(dialog.getAttribute("aria-label")).toBe(name);
	const close = dialog.querySelector<HTMLButtonElement>(".modal-close")!;
	expect(document.activeElement).toBe(close);
	close.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		}),
	);
	const last = document.activeElement!;
	expect(last).not.toBe(close);
	expect(dialog.contains(last)).toBe(true);
	last.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		}),
	);
	expect(document.activeElement).toBe(close);
	dialog.querySelector<HTMLElement>(".modal-content")!.click();
	expect(onclose).not.toHaveBeenCalled();
	close.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
	expect(onclose).toHaveBeenCalledTimes(1);
	dialog.click();
	expect(onclose).toHaveBeenCalledTimes(2);
	await unmount(component);
	component = undefined;
	expect(document.activeElement).toBe(trigger);
});

async function input(id: string, value: string) {
	const field = document.getElementById(id) as HTMLInputElement;
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
}
async function submit() {
	document
		.querySelector("form")!
		.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	await tick();
}
async function click(text: string) {
	[...document.querySelectorAll("button")]
		.find((button) => button.textContent?.trim() === text)!
		.click();
	await tick();
}
it("keeps template creation payloads and native validation in the shared shell", async () => {
	const onsave = vi.fn();
	component = mount(CreateTemplateModal, {
		target: document.body,
		props: {
			isOpen: true,
			saving: false,
			categories,
			onclose: vi.fn(),
			onsave,
		},
	});
	await tick();
	expect(document.querySelector<HTMLFormElement>("form")!.checkValidity()).toBe(
		false,
	);
	expect(
		document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled,
	).toBe(true);
	await input("create-name", "Welcome");
	await input("create-subject", "Hello");
	await input("create-body", "Hi {{clientName}}");
	await input("create-variables", " clientName, , clientEmail ");
	expect(document.querySelector<HTMLFormElement>("form")!.checkValidity()).toBe(
		true,
	);
	await submit();
	expect(onsave).toHaveBeenCalledExactlyOnceWith({
		name: "Welcome",
		category: "inquiry-reply",
		subject: "Hello",
		body: "Hi {{clientName}}",
		variables: ["clientName", "clientEmail"],
	});
});
it("keeps template edit and confirmed delete actions distinct from shell dismissal", async () => {
	const onsave = vi.fn();
	const ondelete = vi.fn();
	const onclose = vi.fn();
	component = mount(TemplateDetailModal, {
		target: document.body,
		props: { template, saving: false, categories, onclose, onsave, ondelete },
	});
	await tick();
	await click("edit");
	await input("edit-subject", "Updated");
	await submit();
	expect(onsave).toHaveBeenCalledExactlyOnceWith({
		name: "Welcome",
		category: "inquiry-reply",
		subject: "Updated",
		body: "Hi {{clientName}}",
		variables: ["clientName"],
	});
	await click("delete");
	expect(ondelete).not.toHaveBeenCalled();
	await click("no");
	expect(ondelete).not.toHaveBeenCalled();
	await click("delete");
	await click("yes, delete");
	expect(ondelete).toHaveBeenCalledTimes(1);
	expect(onclose).not.toHaveBeenCalled();
});

it("keeps admin emails read-only while supported client fields save", async () => {
	const onsave = vi.fn();
	component = mount(ClientDetailModal, {
		target: document.body,
		props: {
			client: { ...client, adminEmails: ["admin@example.test"] },
			saving: false,
			onclose: vi.fn(), onsave,
			ontiertoggle: vi.fn(), onstatusupdate: vi.fn(),
		},
	});
	await tick();
	expect(document.querySelector(".detail-fields")!.textContent).toContain("admin@example.test");
	await click("edit");
	expect(document.querySelector("form")!.textContent).not.toContain("admin emails");
	await input("edit-name", "Updated photographer");
	await input("edit-notes", "Call next week");
	await submit();
	expect(onsave).toHaveBeenCalledExactlyOnceWith({
		name: "Updated photographer", email: client.email, siteUrl: client.siteUrl,
		tier: "basic", subscriptionStatus: "none", notes: "Call next week",
	});
	expect(document.querySelector(".detail-fields")!.textContent).toContain("admin@example.test");
});
