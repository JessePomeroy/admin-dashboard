import { describe, expect, it } from "vitest";
import { issueDraftPreview, readDraftPreview } from "../src/lib/server/draftPreview";

const target = { kind: "portfolio" as const, path: "/gallery/night-walks", revisionId: "revision-1", resourceId: "gallery-1" };
const origin = "https://tenant.example";
const now = 1_000_000;
const token = "synthetic-authenticated-session";
const url = async () => new URL(await issueDraftPreview(target, "tenant.example", token, now), origin);
describe("private draft preview grants", () => {
	it("binds the exact resource, revision and public path without exposing the session token", async () => {
		const preview = await url();
		expect(await readDraftPreview(preview, "tenant.example", token, now)).toEqual(target);
		expect(preview.href).not.toContain(token);
	});
	it("rejects another session, tenant, route, expiration and a modified payload", async () => {
		const preview = await url();
		await expect(readDraftPreview(preview, "tenant.example", "other-session", now)).rejects.toThrow();
		await expect(readDraftPreview(preview, "foreign.example", token, now)).rejects.toThrow();
		await expect(readDraftPreview(new URL(`/contact${preview.search}`, origin), "tenant.example", token, now)).rejects.toThrow();
		await expect(readDraftPreview(preview, "tenant.example", token, now + 300_000)).rejects.toThrow();
		preview.searchParams.set("draftPreview", `${preview.searchParams.get("draftPreview")}x`);
		await expect(readDraftPreview(preview, "tenant.example", token, now)).rejects.toThrow();
	});
	it("rejects external or executable preview destinations", async () => {
		for (const path of ["//evil.test", "https://evil.test", "/about?next=https://evil.test", "/about#x", "/%2f%2fevil.test"]) {
			await expect(issueDraftPreview({ ...target, path }, "tenant.example", token, now)).rejects.toThrow();
		}
	});
});
