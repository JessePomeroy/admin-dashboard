import { describe, expect, it } from "vitest";
import {
	copySiteSettingsDraft,
	emptySiteSettingsDraft,
	hasSiteSettingsErrors,
	serializeSiteSettingsDraft,
	validateSiteSettingsForPublish,
} from "../src/lib/siteSettings";

describe("Site settings editor contract", () => {
	it("creates independent bounded draft copies", () => {
		const source = {
			artistName: "Maggie",
			socialLinks: [{ platform: "Instagram", url: "https://example.com" }],
		};
		const copy = copySiteSettingsDraft(source);
		copy.socialLinks?.push({ platform: "Website", url: "https://site.example" });

		expect(source.socialLinks).toHaveLength(1);
		expect(copy).toMatchObject({
			artistName: "Maggie",
			siteTitle: "",
			tagline: "",
			seoDescription: "",
		});
		expect(emptySiteSettingsDraft().socialLinks).toEqual([]);
	});

	it("requires publish fields and complete public social URLs", () => {
		const errors = validateSiteSettingsForPublish({
			artistName: "Maggie",
			siteTitle: "Reflecting Pool",
			tagline: "Photography in motion",
			seoDescription: "",
			socialLinks: [
				{ platform: "", url: "instagram.com/example" },
				{ platform: "Website", url: "javascript:alert(1)" },
			],
		});

		expect(errors.seoDescription).toMatch(/required/);
		expect(errors["socialLinks.0.platform"]).toMatch(/required/);
		expect(errors["socialLinks.0.url"]).toMatch(/http or https/);
		expect(errors["socialLinks.1.url"]).toMatch(/http or https/);
		expect(hasSiteSettingsErrors(errors)).toBe(true);
	});

	it("accepts a complete publishable payload and serializes order deterministically", () => {
		const payload = {
			artistName: "Maggie",
			siteTitle: "Reflecting Pool",
			tagline: "Photography in motion",
			seoDescription: "Photography by Maggie.",
			socialLinks: [
				{ platform: "Instagram", url: "https://instagram.com/example" },
				{ platform: "Website", url: "https://example.com" },
			],
		};

		expect(validateSiteSettingsForPublish(payload)).toEqual({});
		expect(serializeSiteSettingsDraft(payload)).toContain("Instagram");
		expect(serializeSiteSettingsDraft(payload).indexOf("Instagram")).toBeLessThan(
			serializeSiteSettingsDraft(payload).indexOf("Website"),
		);
	});
});
