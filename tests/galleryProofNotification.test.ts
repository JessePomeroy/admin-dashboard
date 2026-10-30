import { describe, expect, it, vi } from "vitest";
import { sendGalleryProofNotification } from "../src/lib/server/galleryProofNotification.js";

const now = Date.parse("2026-10-30T16:00:00Z");
const proof = { id: "proof-one", siteUrl: "fixture.example", selectedCount: 2, notes: "<script>private notes</script>\nKeep the grain.", submittedAt: now - 1_000 };
const options = { proof, siteUrl: "fixture.example", from: "Fixture <photos@example.com>", to: "owner@example.com", adminOrigin: "https://fixture.example", apiKey: "synthetic-key", now };

describe("persisted gallery proof notifications", () => {
	it("sends escaped HTML and text to the configured owner without recipient capabilities", async () => {
		const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "provider-message" }));
		expect(await sendGalleryProofNotification({ ...options, fetch: request })).toBe("accepted");
		const [url, init] = request.mock.calls[0];
		expect(url).toBe("https://api.resend.com/emails");
		expect(init?.redirect).toBe("error");
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(new Headers(init?.headers).get("idempotency-key")).toBe("gallery-proof-proof-one");
		const payload = JSON.parse(String(init?.body));
		expect(payload).toMatchObject({ from: options.from, to: [options.to] });
		expect(payload.text).toContain(proof.notes);
		expect(payload.html).toContain("&lt;script&gt;private notes&lt;/script&gt;");
		expect(payload.html).not.toContain("<script>");
		expect(payload.html).toContain('href="https://fixture.example/admin/galleries"');
		expect(payload.html).toContain('<html lang="en">');
	});

	it("replays the same immutable envelope and key after an ambiguous provider response", async () => {
		const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("Lost response")).mockResolvedValueOnce(Response.json({ id: "original-message" }));
		expect(await sendGalleryProofNotification({ ...options, fetch: request })).toBe("unconfirmed");
		expect(await sendGalleryProofNotification({ ...options, now: now + 60_000, fetch: request })).toBe("accepted");
		expect(request.mock.calls[1][1]?.body).toBe(request.mock.calls[0][1]?.body);
		expect(new Headers(request.mock.calls[1][1]?.headers).get("idempotency-key")).toBe(new Headers(request.mock.calls[0][1]?.headers).get("idempotency-key"));
	});

	it("does not send foreign proofs, invalid identities or an unsafe owner URL", async () => {
		const request = vi.fn<typeof fetch>();
		await expect(sendGalleryProofNotification({ ...options, proof: { ...proof, siteUrl: "other.example" }, fetch: request })).rejects.toThrow("Invalid gallery proof");
		await expect(sendGalleryProofNotification({ ...options, proof: { ...proof, id: "proof\nheader" }, fetch: request })).rejects.toThrow("Invalid gallery proof");
		await expect(sendGalleryProofNotification({ ...options, adminOrigin: "https://fixture.example/foreign", fetch: request })).rejects.toThrow("Invalid gallery proof admin origin");
		expect(request).not.toHaveBeenCalled();
	});

	it("never sends after the bounded replay window or with missing configuration", async () => {
		const request = vi.fn<typeof fetch>();
		expect(await sendGalleryProofNotification({ ...options, now: proof.submittedAt + 23 * 60 * 60_000, fetch: request })).toBe("expired");
		expect(await sendGalleryProofNotification({ ...options, proof: { ...proof, submittedAt: now + 6 * 60_000 }, fetch: request })).toBe("unconfirmed");
		expect(await sendGalleryProofNotification({ ...options, apiKey: "", fetch: request })).toBe("unconfirmed");
		expect(request).not.toHaveBeenCalled();
	});

	it.each([
		new Response("Rejected", { status: 429 }),
		Response.json({ error: "Rejected" }, { status: 200 }),
		Response.json({ id: "request-id", error: "Rejected" }, { status: 200 }),
		Response.json({ id: "" }),
		new Response("Invalid JSON", { status: 200 }),
	])("does not mistake a provider error or missing message identity for acceptance", async (response) => {
		const request = vi.fn<typeof fetch>().mockResolvedValue(response);
		expect(await sendGalleryProofNotification({ ...options, fetch: request })).toBe("unconfirmed");
	});
});
