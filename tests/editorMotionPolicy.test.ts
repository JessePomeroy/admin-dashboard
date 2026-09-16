import { readFileSync } from "node:fs";
import { type Browser, chromium } from "playwright";
import { compile } from "svelte/compiler";
import { afterAll, beforeAll, expect, it } from "vitest";

let browser: Browser;

beforeAll(async () => {
	browser = await chromium.launch();
});

afterAll(async () => {
	await browser?.close();
});

it("gates desktop and mobile rail motion on the reduced-motion preference", async () => {
	const shell = readFileSync("src/lib/styles/editor-shell.css", "utf8");
	const layout = readFileSync("src/lib/components/AdminLayout.svelte", "utf8");
	const { css } = compile(layout, {
		filename: "src/lib/components/AdminLayout.svelte",
		generate: "client",
		cssHash: () => "svelte-motion-fixture",
	});
	if (!css) throw new Error("Admin layout stylesheet was not compiled");
	const page = await browser.newPage();
	try {
		await page.route("**/*", (route) => route.abort());
		// Apply both production stylesheets, including Svelte's scoped selector,
		// so a later unguarded transition cannot hide behind a media-query string.
		await page.setContent(`
			<style>${css.code}\n${shell}</style>
			<div data-admin><aside class="sidebar svelte-motion-fixture">navigation</aside></div>
		`);
		for (const [width, property, duration] of [
			[1280, "width", "0.3s"],
			[390, "transform", "0.25s"],
		] as const) {
			await page.setViewportSize({ width, height: 800 });
			await page.emulateMedia({ reducedMotion: "no-preference" });
			const sidebar = page.locator(".sidebar");
			expect(await sidebar.evaluate((element) => ({
				property: getComputedStyle(element).transitionProperty,
				duration: getComputedStyle(element).transitionDuration,
			}))).toEqual({ property, duration });
			await page.emulateMedia({ reducedMotion: "reduce" });
			expect(await sidebar.evaluate((element) => getComputedStyle(element).transitionDuration))
				.toBe("0s");
		}
	} finally {
		await page.close();
	}
});
