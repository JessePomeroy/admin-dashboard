import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpgradeBanner from "../src/lib/components/UpgradeBanner.svelte";

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

describe("UpgradeBanner", () => {
	it("shows operator-contact guidance without starting checkout", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const component = mount(UpgradeBanner, {
			target: document.body,
			props: {
				feature: "crm",
				platformUrl: "https://platform.example",
				siteUrl: "tenant.example",
				clientEmail: "owner@tenant.example",
			},
		});

		expect(document.querySelector(".upgrade-title")?.textContent).toBe("client management access");
		const description = document
			.querySelector(".upgrade-description")
			?.textContent?.replace(/\s+/g, " ")
			.trim();
		expect(description).toContain(
			"contact your platform administrator for details",
		);
		expect(document.querySelector("button")).toBeNull();

		document.querySelector<HTMLElement>(".upgrade-banner")?.click();
		await tick();
		expect(fetchMock).not.toHaveBeenCalled();
		unmount(component);
	});
});
