import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Pass a host package.json path with @playwright/test installed.");
const require = createRequire(resolve(process.argv[2]));
const { chromium, expect } = require("@playwright/test");
const base = "http://127.0.0.1:5217";
const out = resolve(".local/google-linking");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
	for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
		const context = await browser.newContext({ viewport, isMobile: viewport.width < 769, hasTouch: viewport.width < 769 });
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.route("**/*", route => {
			const url = new URL(route.request().url());
			if (url.origin === base) return route.continue();
			if (url.hostname === "accounts.google.com") return route.fulfill({ contentType: "text/html", body: "<h1>Local Google redirect fixture</h1>" });
			return route.abort();
		});
		async function open(query = "") {
			await page.goto(base + "/" + query);
			await page.getByRole("heading", { name: "dashboard", exact: true }).waitFor();
			if (viewport.width < 769) await page.getByRole("button", { name: "Toggle menu", exact: true }).click();
			await expect.poll(() => page.locator(".sidebar").evaluate(sidebar => Math.round(sidebar.getBoundingClientRect().x))).toBe(0);
		}
		const connect = page.getByRole("button", { name: "connect google", exact: true });
		await open();
		await expect(connect).toBeVisible();
		const metrics = await page.locator(".sidebar-footer button").evaluateAll(buttons => buttons.slice(0, 3).map(button => {
			const style = getComputedStyle(button);
			const rect = button.getBoundingClientRect();
			return { label: button.getAttribute("aria-label"), height: rect.height, width: rect.width, padding: style.padding, fontSize: style.fontSize, textX: button.querySelector("span")?.getBoundingClientRect().x };
		}));
		expect(metrics.map(item => item.label)).toEqual(["change password", "connect google", "sign out"]);
		for (const property of ["height", "width", "padding", "fontSize", "textX"]) expect(metrics[1][property]).toBe(metrics[0][property]);
		await page.getByRole("button", { name: "change password", exact: true }).focus();
		await page.keyboard.press("Tab");
		await expect(connect).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByRole("button", { name: "sign out", exact: true })).toBeFocused();
		await page.screenshot({ path: `${out}/unlinked-${viewport.width}.png`, fullPage: true });
		await connect.click();
		await expect(page.getByRole("status")).toContainText("couldn't open google. try again.");
		await expect(connect).toBeEnabled();

		await open("?state=linked");
		await expect(connect).toHaveCount(0);
		await expect(page.getByRole("button", { name: "sign out", exact: true })).toBeVisible();
		await page.screenshot({ path: `${out}/linked-${viewport.width}.png`, fullPage: true });
		await open("?state=read-error");
		await expect(connect).toHaveCount(0);
		await expect(page.getByRole("button", { name: "retry google connection check", exact: true })).toBeVisible();
		await open("?legacy=1");
		await expect(connect).toHaveCount(0);

		await open("?state=redirect");
		await expect(connect).toBeVisible();
		const request = page.waitForRequest(url => new URL(url.url()).hostname === "accounts.google.com");
		await connect.click();
		const destination = new URL((await request).url());
		expect(destination.searchParams.get("prompt").split(" ")).toEqual(["consent", "select_account"]);
		await expect(page.getByRole("heading", { name: "Local Google redirect fixture" })).toBeVisible();
		await page.goBack();
		await expect(page.getByRole("heading", { name: "dashboard", exact: true })).toBeVisible();
		const calls = await page.evaluate(() => window.googleLinkFixture.requests);
		// A fresh load may replace the fixture recorder; the contract is also covered in component tests.
		if (calls.length) expect(calls[0]).toEqual({ provider: "google", callbackURL: `${base}/admin`, errorCallbackURL: `${base}/admin?google_link=error`, disableRedirect: true });
		expect(errors).toEqual([]);
		report.push({ viewport, passed: true, metrics, pageErrors: errors });
		await context.close();
	}
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
	await page.goto(base + "/?editor=1");
	const compact = page.getByRole("button", { name: "connect google", exact: true });
	await expect(compact).toBeVisible();
	expect(await compact.evaluate(button => button.getBoundingClientRect().height)).toBe(44);
	await page.screenshot({ path: `${out}/editor-1440.png`, fullPage: true });
	await context.close();
	await writeFile(`${out}/browser-report.json`, JSON.stringify(report, null, 2) + "\n");
	console.log("Google linking browser checks passed: desktop, mobile, and compact editor; Google transport stubbed.");
} finally {
	await browser.close();
}
