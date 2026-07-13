import { error } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import { setServerConfig, type AdminServerConfig } from "../src/lib/config";
import { requireAdmin } from "../src/lib/server/requireAdmin";

const request = new Request("https://tenant.example/api/admin/action", {
	method: "POST",
});

function configure(verifyAdmin: AdminServerConfig["verifyAdmin"] | undefined): void {
	setServerConfig({
		siteUrl: "tenant.example",
		siteName: "tenant",
		fromEmail: "admin@example.com",
		isCreator: false,
		// biome-ignore lint/suspicious/noExplicitAny: authorization tests do not use Convex references.
		api: {} as any,
		convexUrl: "https://convex.example",
		resendApiKey: "resend-key",
		verifyAdmin,
	} as AdminServerConfig);
}

describe("requireAdmin", () => {
	it("fails closed when runtime configuration omits the verifier", async () => {
		configure(undefined);

		await expect(requireAdmin(request)).rejects.toMatchObject({
			status: 500,
			body: { message: "Admin authorization verifier not configured" },
		});
	});

	it("rejects a false verifier result", async () => {
		const verifyAdmin = vi.fn(async () => false);
		configure(verifyAdmin);

		await expect(requireAdmin(request)).rejects.toMatchObject({ status: 401 });
		expect(verifyAdmin).toHaveBeenCalledWith(request);
	});

	it("converts an unexpected verifier failure to unauthorized", async () => {
		configure(
			vi.fn(async () => {
				throw new Error("backend unavailable");
			}),
		);

		await expect(requireAdmin(request)).rejects.toMatchObject({ status: 401 });
	});

	it("preserves an intentional host authorization status", async () => {
		configure(
			vi.fn(async () => {
				throw error(403, "Forbidden");
			}),
		);

		await expect(requireAdmin(request)).rejects.toMatchObject({ status: 403 });
	});

	it("allows the handler to continue only after an affirmative result", async () => {
		const verifyAdmin = vi.fn(async () => true);
		configure(verifyAdmin);

		await expect(requireAdmin(request)).resolves.toBeUndefined();
		expect(verifyAdmin).toHaveBeenCalledWith(request);
	});

	it("preserves the config receiver for a method-style verifier", async () => {
		const verifyAdmin = vi.fn(async function (this: AdminServerConfig) {
			return this.siteName === "tenant";
		});
		configure(verifyAdmin);

		await expect(requireAdmin(request)).resolves.toBeUndefined();
		expect(verifyAdmin).toHaveBeenCalledWith(request);
	});
});
