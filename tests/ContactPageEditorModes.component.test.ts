import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAPI } from "../src/lib/config";
import ContactPage from "../src/lib/pages/editor/ContactPage.svelte";

type ContactPublishIsOptional = {} extends Pick<
	NonNullable<AdminAPI["siteEditor"]>,
	"publishContactPage"
> ? true : false;
const contactPublishIsOptional: ContactPublishIsOptional = true;

const mocks = vi.hoisted(() => {
	const refs = {
		getContactPageEditorState: { name: "siteEditor:getContactPageEditorState" },
		saveContactPageDraft: { name: "siteEditor:saveContactPageDraft" },
		publishContactPage: { name: "siteEditor:publishContactPage" },
		discardContactPageDraft: { name: "siteEditor:discardContactPageDraft" },
	};
	return {
		mutation: vi.fn(async (ref: unknown) =>
			ref === refs.saveContactPageDraft ? { revisionId: "saved-revision" } : null,
		),
		publishingEnabled: true,
		editorState: "draft" as "draft" | "missing",
		refs,
	};
});

vi.mock("convex-svelte", () => ({
	useQuery: () => ({
		data: mocks.editorState === "missing"
			? null
			: {
				documentId: "contact-page",
				draft: {
					revisionId: "draft-revision",
					schemaVersion: 1,
					payload: {
						heading: "Get in touch",
						intro: "Tell me about your project.",
						email: "hello@example.com",
						confirmationMessage: "Message received.",
						bookingEnabled: false,
						bookingLabel: "Book a session",
						bookingIntro: "Choose a time or send an inquiry.",
						inquiryChoices: [],
					},
					source: "admin",
					createdAt: 1,
				},
				published: null,
				updatedAt: 1,
				publishedAt: null,
			},
	}),
}));

vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));

vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "https://site.example",
		siteName: "test site",
		api: {
			siteEditor: {
				getContactPageEditorState: mocks.refs.getContactPageEditorState,
				saveContactPageDraft: mocks.refs.saveContactPageDraft,
				...(mocks.publishingEnabled
					? { publishContactPage: mocks.refs.publishContactPage }
					: {}),
				discardContactPageDraft: mocks.refs.discardContactPageDraft,
			},
		},
		editor: {
			contactPage: {
				initialPayload: {
					heading: "Prepared contact copy",
					intro: "Prepared introduction.",
					email: "prepared@example.com",
					confirmationMessage: "Message received.",
					bookingEnabled: false,
					bookingLabel: "Book a session",
					bookingIntro: "Choose a time or send an inquiry.",
					inquiryChoices: [],
				},
				previewEndpoint: "/api/admin/contact/preview",
			},
		},
	}),
}));

let component: ReturnType<typeof mount> | undefined;

async function renderPage() {
	component = mount(ContactPage, { target: document.body });
	await tick();
	await tick();
}

function buttonLabels() {
	return Array.from(document.querySelectorAll("button"), (button) =>
		button.textContent?.trim(),
	);
}

function buttonWithLabel(label: string) {
	return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
		.find((button) => button.textContent?.trim() === label);
}

async function changeHeadingAndSubmit(value: string) {
	const heading = document.querySelector<HTMLInputElement>(
		'label.wide > input[maxlength="120"]',
	);
	if (!heading) throw new Error("Contact heading input did not render");
	heading.value = value;
	heading.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	document.querySelector<HTMLFormElement>("form")?.requestSubmit();
}

describe("Contact page editor capability modes", () => {
	beforeEach(() => {
		mocks.mutation.mockClear();
		mocks.publishingEnabled = true;
		mocks.editorState = "draft";
		localStorage.clear();
	});

	afterEach(() => {
		if (component) unmount(component);
		component = undefined;
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("allows hosts to omit the Contact publication capability", () => {
		expect(contactPublishIsOptional).toBe(true);
	});

	it("retains preview, validation, save, and publish behavior for publish-capable hosts", async () => {
		await renderPage();
		const confirmDiscard = vi.spyOn(window, "confirm").mockReturnValue(false);

		expect(document.body.textContent).toContain(
			"Edit the words and public destinations visitors see.",
		);
		expect(buttonLabels()).toContain("preview");
		expect(buttonLabels()).toContain("publish");
		buttonWithLabel("discard draft")?.click();
		expect(confirmDiscard).toHaveBeenCalledWith(
			"Discard this draft and return to the published Contact content?",
		);

		await changeHeadingAndSubmit("Get in touch today");
		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledWith(
				mocks.refs.publishContactPage,
				expect.objectContaining({
					siteUrl: "https://site.example",
					draftRevisionId: "saved-revision",
				}),
			);
		});
		expect(mocks.mutation.mock.calls[0]?.[0]).toBe(
			mocks.refs.saveContactPageDraft,
		);
	});

	it("retains publish validation for publish-capable hosts", async () => {
		await renderPage();

		await changeHeadingAndSubmit("");
		await tick();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Complete the highlighted fields before publishing.",
		);
		expect(mocks.mutation).not.toHaveBeenCalled();
	});

	it("saves incomplete private drafts without preview, publication, or publish validation", async () => {
		mocks.publishingEnabled = false;
		await renderPage();
		const confirmDiscard = vi.spyOn(window, "confirm").mockReturnValue(false);

		expect(document.body.textContent).toContain(
			"Private Contact & Booking drafts for a future public rollout. Changes remain in this editor until publishing is connected. Form fields, required validation, abuse protection, recipients, and delivery integrations remain platform-managed.",
		);
		expect(buttonLabels()).not.toContain("preview");
		expect(buttonLabels()).not.toContain("publish");
		buttonWithLabel("discard draft")?.click();
		expect(confirmDiscard).toHaveBeenCalledWith(
			"Discard this private draft and reset the form?",
		);

		await changeHeadingAndSubmit("");
		await vi.waitFor(() => {
			expect(mocks.mutation).toHaveBeenCalledTimes(1);
		});
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.saveContactPageDraft,
			expect.objectContaining({
				siteUrl: "https://site.example",
				payload: expect.objectContaining({ heading: "" }),
			}),
		);
		expect(mocks.mutation).not.toHaveBeenCalledWith(
			mocks.refs.publishContactPage,
			expect.anything(),
		);
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it("uses private-draft setup language without changing the initial payload contract", async () => {
		mocks.publishingEnabled = false;
		mocks.editorState = "missing";
		await renderPage();

		expect(document.body.textContent).toContain(
			"Copy the content currently used by the public site or begin with empty fields. This creates a private draft in this editor.",
		);
		expect(document.body.textContent).toContain("Prepared contact copy");
		expect(document.body.textContent).not.toContain(
			"This creates an unpublished draft only.",
		);
	});

	it("uses neutral conflict guidance when a private local draft is restored", async () => {
		mocks.publishingEnabled = false;
		localStorage.setItem(
			"admin:site-editor:contact-page:https://site.example",
			JSON.stringify({
				schemaVersion: 1,
				baseRevisionId: "older-revision",
				payload: {
					heading: "Offline edit",
					intro: "Unsynchronized contact copy.",
				},
			}),
		);

		await renderPage();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Review or reload before continuing.",
		);
		expect(document.body.textContent).not.toContain(
			"Review or reload before publishing.",
		);
	});
});
