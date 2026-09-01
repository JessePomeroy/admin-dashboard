import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailPreview from "../src/lib/components/EmailPreview.svelte";

const components: ReturnType<typeof mount>[] = [];

const templates = [
	{
		_id: "template-1",
		name: "invoice note",
		category: "custom",
		subject: "invoice {{invoiceNumber}}",
		body: "hi {{clientName}}, review {{portalUrl}}",
	},
];

function mountPreview(overrides: Record<string, unknown> = {}) {
	const callbacks = {
		onTemplateIdChange: vi.fn(),
		onSubjectChange: vi.fn(),
		onBodyChange: vi.fn(),
		onCustomContentChange: vi.fn(),
	};
	components.push(
		mount(EmailPreview, {
			target: document.body,
			props: {
				templates,
				variables: {
					clientName: "Avery",
					invoiceNumber: "INV-PREVIEW",
					portalUrl: "https://browser-preview.invalid/invoice",
				},
				selectedTemplateId: "",
				defaultSubject: "default {{invoiceNumber}}",
				defaultBody: "default body for {{clientName}}",
				ontemplateidchange: callbacks.onTemplateIdChange,
				onsubjectchange: callbacks.onSubjectChange,
				onbodychange: callbacks.onBodyChange,
				oncustomcontentchange: callbacks.onCustomContentChange,
				editedSubject: "",
				editedBody: "",
				...overrides,
			},
		}),
	);
	return callbacks;
}

function button(label: string) {
	const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
		({ textContent }) => textContent?.trim() === label,
	);
	if (!match) throw new Error(`Missing ${label} button`);
	return match;
}

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
});

describe("EmailPreview", () => {
	it("renders browser substitutions read-only without publishing custom content", async () => {
		const callbacks = mountPreview();
		await tick();

		const subject = document.querySelector<HTMLInputElement>("#tpl-subject")!;
		const body = document.querySelector<HTMLTextAreaElement>("#tpl-body")!;
		expect(subject.value).toBe("default INV-PREVIEW");
		expect(body.value).toBe("default body for Avery");
		expect(subject.readOnly).toBe(true);
		expect(body.readOnly).toBe(true);
		expect(callbacks.onSubjectChange).not.toHaveBeenCalled();
		expect(callbacks.onBodyChange).not.toHaveBeenCalled();
		expect(callbacks.onCustomContentChange).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("generated email outline");
		expect(document.body.textContent).toContain(
			"this outline is not its editable source",
		);
		expect(button("write custom email")).toBeTruthy();
	});

	it("warns before a default outline becomes a custom email", async () => {
		const callbacks = mountPreview();
		button("write custom email").click();
		await tick();

		expect(document.body.textContent).toContain(
			"editing this outline replaces the generated layout",
		);
		const subject = document.querySelector<HTMLInputElement>("#tpl-subject")!;
		subject.value = "custom {{invoiceNumber}}";
		subject.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		expect(callbacks.onCustomContentChange).toHaveBeenLastCalledWith({
			subject: "custom {{invoiceNumber}}",
			body: "default body for {{clientName}}",
		});
	});

	it("publishes only the selected template id when the template is untouched", async () => {
		const callbacks = mountPreview();
		const select = document.querySelector<HTMLSelectElement>("#tpl-select")!;
		select.value = "template-1";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();

		expect(callbacks.onTemplateIdChange).toHaveBeenCalledWith("template-1");
		expect(callbacks.onSubjectChange).toHaveBeenCalledWith("");
		expect(callbacks.onBodyChange).toHaveBeenCalledWith("");
		expect(callbacks.onCustomContentChange).toHaveBeenCalledWith(undefined);
	});

	it("publishes a paired raw source only after a genuine source edit", async () => {
		const callbacks = mountPreview({ selectedTemplateId: "template-1" });
		await tick();
		expect(document.querySelector<HTMLInputElement>("#tpl-subject")?.value).toBe(
			"invoice INV-PREVIEW",
		);
		expect(document.querySelector<HTMLTextAreaElement>("#tpl-body")?.value).toContain(
			"https://browser-preview.invalid/invoice",
		);

		button("edit source").click();
		await tick();
		const subject = document.querySelector<HTMLInputElement>("#tpl-subject")!;
		const body = document.querySelector<HTMLTextAreaElement>("#tpl-body")!;
		expect(subject.value).toBe("invoice {{invoiceNumber}}");
		expect(body.value).toBe("hi {{clientName}}, review {{portalUrl}}");

		subject.value = "updated invoice {{invoiceNumber}}";
		subject.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		expect(callbacks.onCustomContentChange).toHaveBeenLastCalledWith({
			subject: "updated invoice {{invoiceNumber}}",
			body: "hi {{clientName}}, review {{portalUrl}}",
		});
		expect(callbacks.onSubjectChange).toHaveBeenLastCalledWith(
			"updated invoice {{invoiceNumber}}",
		);
		expect(callbacks.onBodyChange).toHaveBeenLastCalledWith(
			"hi {{clientName}}, review {{portalUrl}}",
		);
		expect(JSON.stringify(callbacks.onCustomContentChange.mock.lastCall)).not.toContain(
			"INV-PREVIEW",
		);
		expect(JSON.stringify(callbacks.onCustomContentChange.mock.lastCall)).not.toContain(
			"browser-preview.invalid",
		);

		button("preview").click();
		await tick();
		expect(subject.value).toBe("updated invoice INV-PREVIEW");
		expect(body.value).toContain("https://browser-preview.invalid/invoice");
	});

	it("returns to template authority when edits are reset", async () => {
		const callbacks = mountPreview({ selectedTemplateId: "template-1" });
		button("edit source").click();
		await tick();
		const subject = document.querySelector<HTMLInputElement>("#tpl-subject")!;
		subject.value = "custom subject";
		subject.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		button("reset edits").click();
		await tick();
		expect(callbacks.onCustomContentChange).toHaveBeenLastCalledWith(undefined);
		expect(callbacks.onSubjectChange).toHaveBeenLastCalledWith("");
		expect(callbacks.onBodyChange).toHaveBeenLastCalledWith("");
		expect(subject.value).toBe("invoice INV-PREVIEW");
	});
});
