import { createRequire } from "node:module";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Pass the package.json path of a host with @playwright/test installed.");
const require = createRequire(resolve(process.argv[2]));
const { chromium, devices, expect } = require("@playwright/test");
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
	for (const mode of ["Desktop Chrome", "Pixel 7"]) {
		const context = await browser.newContext({ ...devices[mode] });
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:5199" ? route.continue() : route.abort());
		async function reset() {
			await page.goto("http://127.0.0.1:5199/");
			await page.getByRole("button", { name: "open admin", exact: true }).waitFor();
			await page.evaluate(() => { document.body.style.overflow = "clip"; });
		}
		const admin = page.getByRole("dialog", { name: "fixture admin", exact: true });
		const picker = page.getByRole("dialog", { name: "choose from media", exact: true });
		const opener = page.getByRole("button", { name: "open admin", exact: true });
		await reset();
		await opener.click();
		await expect(admin.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
		await page.evaluate(() => window.modalFixture.replaceCloseCallback());
		await page.keyboard.press("Escape");
		await expect(admin).toHaveCount(0);
		await expect(opener).toBeFocused();
		await expect(page.locator("output")).toHaveText("updated");
		expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
		checks++;

		await opener.click();
		await admin.getByRole("button", { name: "open nested picker", exact: true }).click();
		await expect(picker.getByRole("button", { name: "Close media picker" })).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		await expect(picker.getByRole("button", { name: "next", exact: true })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(picker.getByRole("button", { name: "Close media picker" })).toBeFocused();
		await picker.getByRole("button", { name: "next", exact: true }).click();
		await page.keyboard.press("Tab");
		await expect(picker.getByRole("button", { name: "Close media picker" })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(picker).toHaveCount(0);
		await expect(admin).toBeVisible();
		await expect(admin.getByRole("button", { name: "open nested picker", exact: true })).toBeFocused();
		expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
		checks++;

		await admin.getByRole("button", { name: "show save error" }).click();
		const toast = page.getByRole("status").filter({ hasText: "The save needs attention." });
		await expect(toast).toBeVisible();
		const dismiss = toast.getByRole("button", { name: "Dismiss", exact: true });
		expect(await dismiss.evaluate(element => {
			const rect = element.getBoundingClientRect();
			return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
		})).toBe(true);
		await dismiss.focus();
		await expect(dismiss).toBeFocused();
		await dismiss.click();
		await expect(toast).toHaveCount(0);
		await expect(admin).toBeVisible();
		checks++;

		await admin.getByRole("textbox", { name: "Consumes Escape" }).focus();
		await page.keyboard.press("Escape");
		await expect(admin).toBeVisible();
		await admin.getByRole("button", { name: "Close dialog", exact: true }).click();
		await expect(admin).toHaveCount(0);
		checks++;

		await reset();
		await opener.click();
		const nestedOpener = admin.getByRole("button", { name: "open second admin" });
		await nestedOpener.click();
		const second = page.getByRole("dialog", { name: "second admin", exact: true });
		await nestedOpener.evaluate(element => { element.disabled = true; });
		await page.keyboard.press("Escape");
		await expect(second).toHaveCount(0);
		await expect(admin.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
		await nestedOpener.evaluate(element => { element.disabled = false; });
		checks++;

		await nestedOpener.click();
		await page.evaluate(() => window.modalFixture.removeAdmin());
		await expect(admin).toHaveCount(0);
		await expect(second.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(second).toHaveCount(0);
		await expect(opener).toBeFocused();
		expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
		checks++;

		await opener.click();
		await page.mouse.click(5, 5);
		await expect(admin).toHaveCount(0);
		await page.getByRole("button", { name: "open picker", exact: true }).click();
		await page.mouse.click(5, 5);
		await expect(picker).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(picker).toHaveCount(0);
		checks++;

		await opener.click();
		await page.evaluate(() => window.unmountModalFixture());
		await expect(admin).toHaveCount(0);
		expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
		expect(errors).toEqual([]);
		checks++;
		await context.close();
	}
	console.log(`${checks} desktop/mobile real-browser lifecycle checks passed`);
} finally {
	await browser.close();
}
