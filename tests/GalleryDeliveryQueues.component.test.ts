// @vitest-environment jsdom
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GalleryDeliveryPage from "../src/lib/pages/gallery-delivery/GalleryDeliveryPage.svelte";

const mocks = vi.hoisted(() => ({
	mutation: vi.fn(async (_reference: unknown, _args: unknown) => "image-1"),
	beforeNavigate: vi.fn<(handler: (navigation: { willUnload: boolean; cancel: () => void }) => void) => void>(),
	gallery: { _id: "gallery-1", _creationTime: 1, siteUrl: "site.example", clientId: "client-1", clientName: "Fictional client",
		name: "Fictional delivery", slug: "fictional", status: "draft", imageCount: 0, totalSizeBytes: 0, downloadEnabled: true, favoritesEnabled: false },
}));
vi.mock("$app/navigation", () => ({ beforeNavigate: mocks.beforeNavigate }));
vi.mock("../src/lib/adminClient", () => ({ useAdminClient: () => ({ mutation: mocks.mutation }) }));
vi.mock("../src/lib/config", () => ({ getAdminConfig: () => ({
	siteUrl: "site.example", siteName: "Fictional studio", fromEmail: "owner@example.invalid", isCreator: true, galleryWorkerUrl: "https://worker.example",
	api: { galleryDelivery: {
		listBySite: { name: "list" }, getUploadPolicy: { name: "policy" }, get: { name: "get" }, getImages: { name: "images" },
		addImage: { name: "add" }, removeImage: { name: "remove-image" }, update: { name: "update" }, remove: { name: "remove" },
	} },
}) }));
vi.mock("convex-svelte", () => ({ useQuery: (reference: { name: string }) => ({
	data: reference.name === "list" ? [mocks.gallery] : reference.name === "get" ? mocks.gallery : reference.name === "policy" ? "media" : [], isLoading: false,
}) }));

let releaseUpload: () => void;
let uploadSignal: AbortSignal | null | undefined;
let cleanup: () => Promise<void>;
const requests = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = String(input);
	if (url.endsWith("/upload-session")) return Response.json({ uploadSessionToken: "fictional-session", expiresAt: Date.now() + 600_000 });
	if (url.endsWith("/presign")) {
		const body = JSON.parse(String(init?.body));
		return Response.json({ r2Key: `site.example/${body.galleryId}/original/${body.filename}`, uploadUrl: "https://worker.example/upload/put", uploadToken: "fictional-upload" });
	}
	if (url === "https://worker.example/upload/put") {
		uploadSignal = init?.signal;
		return await new Promise<Response>((resolve, reject) => {
			releaseUpload = () => resolve(new Response("{}"));
			uploadSignal?.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
		});
	}
	if (url.endsWith("/process") || url.endsWith("/delete")) return new Response("{}");
	throw new Error(`Unexpected fixture request: ${url}`);
});

function button(text: string) {
	const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === text);
	if (!found) throw new Error(`Button not found: ${text}`);
	return found;
}

async function startUpload() {
	const component = mount(GalleryDeliveryPage, { target: document.body, props: { adminSession: {
		status: "authorized", email: "owner@example.invalid", tier: "full", isCreator: true,
	} } });
	cleanup = () => unmount(component);
	document.querySelector<HTMLButtonElement>(".row-main")!.click();
	await tick();
	const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
	Object.defineProperty(input, "files", { configurable: true, value: [new File(["fictional"], "photo.jpg", { type: "image/jpeg" })] });
	input.dispatchEvent(new Event("change", { bubbles: true }));
	await vi.waitFor(() => expect(uploadSignal).toBeDefined());
}

beforeEach(() => {
	requests.mockClear(); mocks.mutation.mockClear(); mocks.beforeNavigate.mockClear();
	uploadSignal = undefined; cleanup = async () => {};
	vi.stubGlobal("fetch", requests);
	vi.stubGlobal("confirm", vi.fn(() => false));
	Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:fictional" });
	Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
	vi.stubGlobal("Image", class {
		naturalWidth = 120; naturalHeight = 80; onload: (() => void) | null = null;
		set src(_value: string) { queueMicrotask(() => this.onload?.()); }
	});
});
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it("retains one upload across settings, modal closure and reopening", async () => {
	await startUpload();
	button("settings").click(); await tick();
	expect(document.querySelector('input[type="file"]')).toBeNull();
	button("files").click(); await tick();
	expect(document.body.textContent).toContain("0/1 uploaded");
	document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click(); await tick();
	expect(document.querySelector(".modal-overlay")).toBeNull();
	expect(document.querySelector(".upload-queues")?.textContent).toContain("0/1 uploaded");
	expect(uploadSignal?.aborted).toBe(false);
	button("view uploads").click(); await tick();
	expect(document.body.textContent).toContain("0/1 uploaded");
	releaseUpload();
	await vi.waitFor(() => expect(document.body.textContent).toContain("1/1 uploaded"));
	expect(requests.mock.calls.filter(([input]) => String(input).endsWith("/presign"))).toHaveLength(1);
	expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({ name: "add" }, expect.objectContaining({ galleryId: "gallery-1", filename: "photo.jpg" }));
});

it("guards leaving unfinished work and cancels it on page teardown", async () => {
	await startUpload();
	const cancel = vi.fn();
	mocks.beforeNavigate.mock.calls[0][0]({ willUnload: false, cancel });
	expect(cancel).toHaveBeenCalledTimes(1);
	const unload = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(unload);
	expect(unload.defaultPrevented).toBe(true);
	await cleanup(); cleanup = async () => {};
	await vi.waitFor(() => expect(requests.mock.calls.some(([input]) => String(input).endsWith("/delete"))).toBe(true));
	expect(uploadSignal?.aborted).toBe(true);
	expect(mocks.mutation).not.toHaveBeenCalled();
});
