import { describe, expect, it } from "vitest";
import { getAdminCapabilities } from "../src/lib/capabilities";

describe("getAdminCapabilities", () => {
	it("keeps creator-only features off full client tenants", () => {
		const capabilities = getAdminCapabilities({
			tier: "full",
			isCreator: false,
			boardProjectTypes: [
				{ label: "photography", values: ["portrait", "commercial"] },
			],
		});

		expect(capabilities.hasFeature("board")).toBe(true);
		expect(capabilities.hasFeature("messages")).toBe(false);
	});

	it("allows creator tenants to use creator-only features", () => {
		const capabilities = getAdminCapabilities({
			tier: "full",
			isCreator: true,
		});

		expect(capabilities.hasFeature("messages")).toBe(true);
	});

	it("uses all default board project types for creator tenants", () => {
		const capabilities = getAdminCapabilities({
			tier: "full",
			isCreator: true,
		});

		expect(capabilities.canInitializeBoardType("website")).toBe(true);
		expect(capabilities.canInitializeBoardType("portrait")).toBe(true);
	});

	it("limits client board initialization to configured project types", () => {
		const capabilities = getAdminCapabilities({
			tier: "full",
			isCreator: false,
			boardProjectTypes: [
				{ label: "photography", values: ["portrait", "commercial"] },
			],
		});

		expect(capabilities.canInitializeBoardType("portrait")).toBe(true);
		expect(capabilities.canInitializeBoardType("website")).toBe(false);
	});

	it("does not fall back to creator board presets for clients", () => {
		const capabilities = getAdminCapabilities({
			tier: "full",
			isCreator: false,
		});

		expect(capabilities.boardProjectTypeGroups).toEqual([]);
		expect(capabilities.canInitializeBoardType("website")).toBe(false);
	});
});
