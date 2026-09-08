import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	completeCatalogPrivateEditorUpload,
	declareCatalogPrivateEditorUpload,
	newCatalogPrivateEditorUploadHandle,
	prepareCatalogPrivateEditorUpload,
	putCatalogPrivateEditorUpload,
} from "../src/lib/catalogPrivateEditorUpload";
import { uploadCatalogProductArtwork, type CatalogProductArtworkCheckpoint } from "../src/lib/catalogProductArtworkUpload";
import { createCatalogProductUploadSession, type ProductUploadDraft } from "../src/lib/catalogProductUploadSession.svelte";

vi.mock("../src/lib/catalogPrivateEditorUpload", () => ({
	completeCatalogPrivateEditorUpload: vi.fn(), declareCatalogPrivateEditorUpload: vi.fn(),
	newCatalogPrivateEditorUploadHandle: vi.fn(), prepareCatalogPrivateEditorUpload: vi.fn(),
	putCatalogPrivateEditorUpload: vi.fn(),
}));
vi.mock("../src/lib/catalogProductArtworkUpload", () => ({ uploadCatalogProductArtwork: vi.fn() }));

const DRAFT = { productId: "product-a", draftRevisionId: "revision-a", draftJson: "saved-a" };
const RELATION = { kind: "paid_digital_file" as const, relationKey: "download-a" };
const DECLARATION = {
	uploadHandle: "handle-1", productKind: "digital_download" as const,
	originalFilename: "download.zip", contentType: "application/zip" as const,
	sizeBytes: 4, sha256: "a".repeat(64),
};
const PREPARED = { uploadUrl: "https://worker.test/source", uploadToken: "test-token" };
const DOWNLOAD = {
	kind: "paid_digital_file" as const, assetId: "download-asset", status: "verified" as const,
	originalFilename: "download.zip", mimeType: "application/zip" as const,
	sizeBytes: 4, version: "v1", createdAt: 1,
};
const ARTWORK = {
	privateAsset: {
		kind: "print_source" as const, assetId: "print-asset", status: "verified" as const,
		originalFilename: "print.jpg", mimeType: "image/jpeg" as const,
		sizeBytes: 4, widthPixels: 2, heightPixels: 2, createdAt: 1,
	},
	displayAsset: {
		_id: "media-asset", assetId: "display-asset", originalFilename: "display.jpg", status: "ready" as const,
		source: { contentType: "image/jpeg", sizeBytes: 4, width: 2, height: 2 },
		derivatives: { thumb: { key: "thumb", width: 2, height: 2 }, card: { key: "card", width: 2, height: 2 } },
		createdAt: 1,
	},
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

describe("product upload session lifetime", () => {
	let current: ProductUploadDraft | null;
	let session: ReturnType<typeof createCatalogProductUploadSession>;
	let attached: ReturnType<typeof vi.fn>;
	let file: File;
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		current = { ...DRAFT };
		attached = vi.fn();
		file = new File(["zip!"], "download.zip", { type: "application/zip" });
		session = createCatalogProductUploadSession({
			upload: { prepareEndpoint: "/prepare", completeEndpoint: "/complete" },
			currentDraft: () => current,
		});
		let handles = 0;
		vi.mocked(newCatalogPrivateEditorUploadHandle).mockImplementation(() => `handle-${++handles}`);
		vi.mocked(declareCatalogPrivateEditorUpload).mockResolvedValue(DECLARATION);
		vi.mocked(prepareCatalogPrivateEditorUpload).mockResolvedValue(PREPARED);
		vi.mocked(putCatalogPrivateEditorUpload).mockResolvedValue(undefined);
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "verified", asset: DOWNLOAD });
		vi.mocked(uploadCatalogProductArtwork).mockResolvedValue(ARTWORK);
	});
	afterEach(() => { session.dispose(); vi.useRealTimers(); });
	function select() { session.selectDownload(file, RELATION); }
	function start() { return session.startDownload({ ...DRAFT }, attached); }
	function artwork() {
		return session.uploadArtwork(file, {
			draft: { ...DRAFT }, productKind: "print", mediaEndpoint: "/media", onStatus: vi.fn(), onVerified: attached,
		});
	}

	it("delivers only the verified download and original relation, then releases its selection", async () => {
		select();
		session.version = "v1";
		await start();
		expect(attached).toHaveBeenCalledExactlyOnceWith({ relation: RELATION, asset: DOWNLOAD });
		expect(declareCatalogPrivateEditorUpload).toHaveBeenCalledWith(file, "digital_download", "handle-1", "v1", expect.any(AbortSignal));
		expect(putCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(session.downloadBusy).toBe(false);
		expect(session.selectedFile).toBeNull();
		expect(session.hasDownload).toBe(false);
		expect(session.message).toContain("Save the draft to keep it");
	});

	it("reconciles a lost PUT response through bounded automatic and delayed manual checks, never another PUT", async () => {
		vi.mocked(putCatalogPrivateEditorUpload).mockRejectedValue(new TypeError("lost response"));
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "pending", retryAfterMs: 2_000 });
		select();
		await start();
		expect(session.phase).toBe("pending");
		expect(session.selectedFile).toBeNull();
		await start();
		await session.checkDownloadAgain();
		expect(completeCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(65_000 * 3);
		expect(completeCatalogPrivateEditorUpload).toHaveBeenCalledTimes(4);
		expect(session.manualCheckVisible).toBe(true);
		expect(session.manualCheckReady).toBe(false);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(session.manualCheckReady).toBe(true);
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "verified", asset: DOWNLOAD });
		await session.checkDownloadAgain();
		expect(attached).toHaveBeenCalledTimes(1);
		expect(putCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(prepareCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("respects a retry delay beyond the automatic window before enabling manual checks", async () => {
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "pending", retryAfterMs: 400_000 });
		select(); await start();
		await vi.advanceTimersByTimeAsync(399_999);
		expect(session.manualCheckReady).toBe(false);
		expect(completeCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(session.manualCheckReady).toBe(true);
	});

	it.each(["reading", "preparing"] as const)("cancels during %s even if the response arrives after abort", async (stage) => {
		const reading = deferred<typeof DECLARATION>();
		const preparing = deferred<typeof PREPARED>();
		if (stage === "reading") vi.mocked(declareCatalogPrivateEditorUpload).mockReturnValueOnce(reading.promise);
		else vi.mocked(prepareCatalogPrivateEditorUpload).mockReturnValueOnce(preparing.promise);
		select(); const pending = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(session.phase).toBe(stage);
		const signal = vi.mocked(declareCatalogPrivateEditorUpload).mock.calls[0][4]!;
		session.cancelDownload();
		expect(signal.aborted).toBe(true);
		reading.resolve(DECLARATION); preparing.resolve(PREPARED);
		await pending;
		expect(putCatalogPrivateEditorUpload).not.toHaveBeenCalled();
		expect(attached).not.toHaveBeenCalled();
		expect(session.message).toBe("Upload cancelled before transfer.");
	});

	it("does not permit cancel or a second start after PUT begins", async () => {
		const put = deferred<void>();
		vi.mocked(putCatalogPrivateEditorUpload).mockReturnValueOnce(put.promise);
		select(); const pending = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(session.phase).toBe("uploading");
		session.cancelDownload(); await start();
		expect(vi.mocked(putCatalogPrivateEditorUpload).mock.calls[0][3]?.aborted).toBe(false);
		expect(session.downloadBusy).toBe(true);
		put.resolve(); await pending;
		expect(putCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(attached).toHaveBeenCalledTimes(1);
	});

	it.each(["productId", "draftRevisionId", "draftJson", "conflict"])("rejects a verified download after %s changes", async (field) => {
		const completion = deferred<Awaited<ReturnType<typeof completeCatalogPrivateEditorUpload>>>();
		vi.mocked(completeCatalogPrivateEditorUpload).mockReturnValueOnce(completion.promise);
		select(); const pending = start();
		await vi.advanceTimersByTimeAsync(0);
		current = field === "conflict" ? null : { ...DRAFT, [field]: "changed" };
		completion.resolve({ status: "verified", asset: DOWNLOAD }); await pending;
		expect(attached).not.toHaveBeenCalled();
		expect(session.phase).toBe("error");
	});

	it("rejects a valid print asset returned for a paid-file relation", async () => {
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "verified", asset: ARTWORK.privateAsset });
		select(); await start();
		expect(attached).not.toHaveBeenCalled();
		expect(session.phase).toBe("error");
	});

	it("keeps a late response from a prior A visit out of the reopened A upload", async () => {
		const old = deferred<Awaited<ReturnType<typeof completeCatalogPrivateEditorUpload>>>();
		const next = deferred<Awaited<ReturnType<typeof completeCatalogPrivateEditorUpload>>>();
		vi.mocked(completeCatalogPrivateEditorUpload).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
		select(); const oldPending = start(); await vi.advanceTimersByTimeAsync(0);
		const oldSignal = vi.mocked(completeCatalogPrivateEditorUpload).mock.calls[0][2]!;
		current = { ...DRAFT, productId: "b" }; session.reset();
		current = { ...DRAFT }; session.reset(); select();
		const nextPending = start(); await vi.advanceTimersByTimeAsync(0);
		old.resolve({ status: "verified", asset: DOWNLOAD }); await oldPending;
		expect(oldSignal.aborted).toBe(true);
		expect(attached).not.toHaveBeenCalled();
		expect(session.phase).toBe("completing");
		next.resolve({ status: "verified", asset: DOWNLOAD }); await nextPending;
		expect(attached).toHaveBeenCalledTimes(1);
	});

	it.each(["reset", "dispose"] as const)("%s aborts pending verification and clears all scheduled checks", async (action) => {
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "pending", retryAfterMs: 1_000 });
		select(); await start();
		const signal = vi.mocked(completeCatalogPrivateEditorUpload).mock.calls[0][2]!;
		session[action]();
		expect(signal.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(400_000);
		expect(completeCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(session.message).toBe("");
		if (action === "dispose") {
			select(); await start();
			expect(declareCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		}
	});

	it("invalidates and aborts a download when a different server draft loads", async () => {
		vi.mocked(completeCatalogPrivateEditorUpload).mockResolvedValue({ status: "pending", retryAfterMs: 1_000 });
		select(); await start(); session.draftLoaded("revision-b");
		expect(session.phase).toBe("error");
		expect(session.downloadBusy).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("never reuses a previously issued handle, including across resets", async () => {
		vi.mocked(newCatalogPrivateEditorUploadHandle).mockReturnValue("same-handle");
		select(); await start(); session.reset(); select(); await start();
		expect(putCatalogPrivateEditorUpload).toHaveBeenCalledTimes(1);
		expect(session.phase).toBe("error");
	});

	it("retries failed artwork with its checkpoint and clears it only after attachment", async () => {
		const checkpoint: CatalogProductArtworkCheckpoint = {
			declaration: { ...DECLARATION, productKind: "print", contentType: "image/jpeg", widthPixels: 2, heightPixels: 2 },
			displayFile: file, putIssued: true,
		};
		vi.mocked(uploadCatalogProductArtwork).mockImplementationOnce(async (_file, options) => {
			options.onCheckpoint?.(checkpoint);
			throw new Error("still processing");
		});
		await expect(artwork()).rejects.toThrow("still processing");
		expect(session.artworkBusy).toBe(false);
		await artwork();
		expect(vi.mocked(uploadCatalogProductArtwork).mock.calls[1][1].checkpoint).toBe(checkpoint);
		expect(attached).toHaveBeenCalledExactlyOnceWith(ARTWORK);
		await artwork();
		expect(vi.mocked(uploadCatalogProductArtwork).mock.calls[2][1].checkpoint).toBeUndefined();
	});

	it.each(["productId", "draftRevisionId", "draftJson", "conflict"])("does not attach artwork after %s changes", async (field) => {
		const response = deferred<typeof ARTWORK>();
		vi.mocked(uploadCatalogProductArtwork).mockReturnValueOnce(response.promise);
		const pending = artwork();
		current = field === "conflict" ? null : { ...DRAFT, [field]: "changed" };
		response.resolve(ARTWORK);
		await expect(pending).rejects.toThrow("product changed");
		expect(attached).not.toHaveBeenCalled();
		expect(session.artworkBusy).toBe(false);
	});

	it("reset blocks late artwork progress/checkpoints/finally from affecting a new operation", async () => {
		const old = deferred<typeof ARTWORK>();
		const next = deferred<typeof ARTWORK>();
		vi.mocked(uploadCatalogProductArtwork).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
		const oldStatus = vi.fn();
		const oldPending = session.uploadArtwork(file, {
			draft: { ...DRAFT }, productKind: "print", mediaEndpoint: "/media", onStatus: oldStatus, onVerified: attached,
		});
		const oldOptions = vi.mocked(uploadCatalogProductArtwork).mock.calls[0][1];
		session.reset();
		const checkpoint: CatalogProductArtworkCheckpoint = {
			declaration: { ...DECLARATION, productKind: "print", contentType: "image/jpeg", widthPixels: 2, heightPixels: 2 },
			displayFile: file, putIssued: true,
		};
		oldOptions.onCheckpoint?.(checkpoint);
		const nextPending = artwork();
		expect(vi.mocked(uploadCatalogProductArtwork).mock.calls[1][1].checkpoint).toBeUndefined();
		expect(oldOptions.signal?.aborted).toBe(true);
		oldOptions.onStatus?.("ready");
		expect(oldStatus).not.toHaveBeenCalled();
		old.resolve(ARTWORK);
		await expect(oldPending).rejects.toThrow("product changed");
		expect(session.artworkBusy).toBe(true);
		expect(attached).not.toHaveBeenCalled();
		next.resolve(ARTWORK); await nextPending;
		expect(attached).toHaveBeenCalledTimes(1);
		expect(session.artworkBusy).toBe(false);
	});
});
