import { afterEach, describe, expect, it, vi } from "vitest";
import { openEditorDraftPreview } from "../src/lib/editorPreview";

function setup() {
	const popup = { opener: {}, location: { href: "about:blank" }, close: vi.fn() };
	const open = vi.fn(() => popup);
	const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ previewUrl: "/preview/saved" }));
	vi.stubGlobal("window", { open, location: { origin: "https://tenant.example" } });
	vi.stubGlobal("fetch", fetcher);
	const draft = { error: "Previous error", revisionId: "saved", saveNow: vi.fn(async () => true) };
	const busy = vi.fn();
	const preview = () => openEditorDraftPreview("/preview", "about-page-preview", draft, busy);
	return { popup, open, fetcher, draft, busy, preview };
}

afterEach(() => vi.unstubAllGlobals());

describe("editor draft preview", () => {
	it("opens during the click and requests the revision acknowledged by autosave", async () => {
		const { popup, open, draft, busy, preview, fetcher } = setup();
		let finishSave!: (value: boolean) => void;
		draft.saveNow.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
		const pending = preview();
		expect(open).toHaveBeenCalledWith("about:blank", "about-page-preview");
		expect(popup.opener).toBeNull();
		expect(busy.mock.calls).toEqual([[true]]);
		expect(fetcher).not.toHaveBeenCalled();
		draft.revisionId = "newly-saved";
		finishSave(true);
		await pending;
		expect(fetcher).toHaveBeenCalledWith("/preview", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ draftRevisionId: "newly-saved" }),
		});
		expect(popup.location.href).toBe("https://tenant.example/preview/saved");
		expect(popup.close).not.toHaveBeenCalled();
		expect(draft.error).toBe("");
		expect(busy.mock.calls).toEqual([[true], [false]]);
	});

	it("reports a blocked popup before saving or changing busy state", async () => {
		const { draft, busy, fetcher } = setup();
		vi.stubGlobal("window", { open: () => null });
		await openEditorDraftPreview("/preview", "preview", draft, busy);
		expect(draft.error).toMatch(/Allow pop-ups/);
		expect(draft.saveNow).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
		expect(busy).not.toHaveBeenCalled();
	});

	it("closes the empty window and preserves an autosave conflict", async () => {
		const { draft, popup, busy, fetcher, preview } = setup();
		draft.saveNow.mockImplementation(async () => { draft.error = "Draft conflict"; return false; });
		await preview();
		expect(popup.close).toHaveBeenCalledOnce();
		expect(fetcher).not.toHaveBeenCalled();
		expect(draft.error).toBe("Draft conflict");
		expect(busy).toHaveBeenLastCalledWith(false);
	});

	it.each([
		[() => Response.json({ error: "Preview unavailable" }, { status: 503 }), "Preview unavailable"],
		[() => new Response("not JSON", { status: 503 }), "Could not create the draft preview."],
		[() => Response.json({ previewUrl: "https://other.example/preview" }), "unsafe URL"],
		[() => Response.json({ previewUrl: null }), "invalid URL"],
	])("closes and releases busy state after a failed or unsafe response", async (response, message) => {
		const { fetcher, popup, draft, busy, preview } = setup();
		fetcher.mockResolvedValue(response());
		await preview();
		expect(popup.close).toHaveBeenCalledOnce();
		expect(popup.location.href).toBe("about:blank");
		expect(draft.error).toContain(message);
		expect(busy).toHaveBeenLastCalledWith(false);
	});

	it("cleans up a failed network request", async () => {
		const { fetcher, popup, draft, busy, preview } = setup();
		fetcher.mockRejectedValue(new Error("Network unavailable"));
		await preview();
		expect(popup.close).toHaveBeenCalledOnce();
		expect(draft.error).toBe("Network unavailable");
		expect(busy).toHaveBeenLastCalledWith(false);
	});
});
