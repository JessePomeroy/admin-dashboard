import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const output = resolve(process.argv[2] ?? "/tmp/inquiry-browser-evidence");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
	for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
		const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("http://127.0.0.1:5213");
		await page.getByRole("status").waitFor();
		await page.evaluate(() => window.inquiryFixture.respond());
		await page.locator("tbody tr").first().waitFor();
		for (let index = 0; index < 8; index++) {
			await page.getByRole("button", { name: "next", exact: true }).click();
			await page.getByRole("status").waitFor();
			await page.evaluate(() => window.inquiryFixture.respond());
			await page.locator("tbody tr").first().waitFor();
		}
		assert.equal(await page.locator("tbody tr").count(), 6);
		assert.equal(await page.getByText("Oldest unanswered", { exact: true }).count(), 1);
		assert.equal(await page.getByRole("button", { name: "next", exact: true }).isDisabled(), true);
		await page.getByLabel("Filter by status").selectOption("new");
		await page.getByRole("status").waitFor();
		assert.equal(await page.evaluate(() => window.inquiryFixture.request.paginationOpts.cursor), null);
		await page.evaluate(() => window.inquiryFixture.respond());
		await page.getByText("Oldest unanswered", { exact: true }).waitFor();
		assert.equal(await page.locator("tbody tr").count(), 1);
		await page.getByRole("button", { name: "view", exact: true }).click();
		await page.getByRole("button", { name: "mark read", exact: true }).click();
		await page.getByRole("button", { name: "mark read", exact: true }).waitFor({ state: "detached" });
		await page.getByRole("button", { name: "Close dialog", exact: true }).click();
		await page.getByRole("dialog").waitFor({ state: "detached" });
		assert.equal(await page.locator("tbody tr").count(), 0);
		await page.getByLabel("Filter by status").selectOption("read");
		await page.getByRole("status").waitFor();
		await page.evaluate(() => window.inquiryFixture.fail());
		await page.getByRole("alert").waitFor();
		await page.getByRole("button", { name: "retry", exact: true }).click();
		await page.getByRole("status").waitFor();
		await page.evaluate(() => window.inquiryFixture.respond());
		await page.getByText("Oldest unanswered", { exact: true }).waitFor();
		await page.screenshot({ path: resolve(output, `inquiries-${viewport.width}.png`), fullPage: true });
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
		assert.deepEqual(errors, []);
		await context.close();
		console.log(`PASS ${viewport.width}px: 206-row traversal, filtering, status change, error/retry, no page errors or document overflow`);
	}
} finally { await browser.close(); }
