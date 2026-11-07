import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const output = resolve(process.argv[2] ?? "/tmp/inquiry-browser-evidence");
const origin = process.env.INQUIRY_FIXTURE_URL ?? "http://127.0.0.1:5213";
const engines = process.env.BROWSER === "chromium" ? { chromium } : process.env.BROWSER === "webkit" ? { webkit } : { chromium, webkit };
const results = [];
await mkdir(output, { recursive: true });

async function measureTable(page) {
	return page.evaluate(() => {
		const wrap = document.querySelector(".table-wrap");
		const bounds = wrap.getBoundingClientRect();
		return {
			clientWidth: wrap.clientWidth, scrollWidth: wrap.scrollWidth, scrollLeft: wrap.scrollLeft,
			left: bounds.left, right: bounds.right,
			cells: [...document.querySelectorAll("tbody tr:first-child td")].map((cell) => {
				const rect = cell.getBoundingClientRect();
				return { text: cell.textContent.trim(), left: rect.left, right: rect.right, clientWidth: cell.clientWidth, scrollWidth: cell.scrollWidth };
			}),
		};
	});
}

async function assertTriageFits(page) {
	const table = page.getByRole("table");
	assert.equal(await table.count(), 1);
	assert.equal(await table.getByRole("columnheader").count(), 7);
	assert.equal(await page.locator("tbody tr").first().getByRole("cell").count(), 7);
	assert.equal(await table.getByRole("row").count(), (await page.locator("tbody tr").count()) + 1);
	const geometry = await measureTable(page);
	assert.equal(geometry.scrollLeft, 0, "initial triage requires no horizontal panning");
	assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, "table fits its scroller");
	for (const cell of geometry.cells) {
		assert.ok(cell.left >= geometry.left - 1 && cell.right <= geometry.right + 1, `cell fits: ${cell.text}`);
		if (page.viewportSize().width <= 768) assert.ok(cell.scrollWidth <= cell.clientWidth + 1, `cell content fits: ${cell.text}`);
	}
	return geometry;
}

async function keyboardDialog(page, expected) {
	await page.getByLabel("Filter by status").focus();
	await page.keyboard.press("Tab");
	const view = page.getByRole("button", { name: "view", exact: true }).first();
	assert.equal(await view.evaluate((node) => node === document.activeElement), true);
	assert.equal((await measureTable(page)).scrollLeft, 0, "keyboard View does not pan the table");
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog");
	await dialog.waitFor();
	const close = page.getByRole("button", { name: "Close dialog", exact: true });
	assert.equal(await close.evaluate((node) => node === document.activeElement), true);
	await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
	const geometry = await page.evaluate(() => {
		const rect = (node) => { const bounds = node.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }; };
		const content = document.querySelector(".modal-content");
		const scroll = document.querySelector(".modal-scroll-region");
		const close = document.querySelector(".modal-close");
		const closeBounds = close.getBoundingClientRect();
		const hit = document.elementFromPoint((closeBounds.left + closeBounds.right) / 2, (closeBounds.top + closeBounds.bottom) / 2);
		return {
			content: { clientWidth: content.clientWidth, scrollWidth: content.scrollWidth },
			scroll: { clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth },
			close: { ...rect(close), hit: hit === close || close.contains(hit) },
			labels: [...document.querySelectorAll(".modal-details .detail-label")].map((node) => ({ minWidth: getComputedStyle(node).minWidth, width: node.getBoundingClientRect().width })),
			detailValueLefts: [...document.querySelectorAll(".modal-details .detail-row")].map((row) => row.lastElementChild.getBoundingClientRect().left),
			fields: [".modal-title", ".detail-row span:last-child", ".message-body p"].map((selector) => {
				const node = document.querySelector(selector);
				const range = document.createRange(); range.selectNodeContents(node);
				return { selector, text: node.textContent, bounds: rect(node), textBounds: rect(range), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth };
			}),
		};
	});
	assert.ok(geometry.content.scrollWidth <= geometry.content.clientWidth + 1, "modal content fits horizontally");
	assert.ok(geometry.scroll.scrollWidth <= geometry.scroll.clientWidth + 1, "modal inner content fits horizontally");
	assert.ok(geometry.close.left >= 0 && geometry.close.right <= page.viewportSize().width, "Close remains inside viewport");
	assert.equal(geometry.close.hit, true, "Close center remains clickable");
	for (const label of geometry.labels) {
		assert.equal(label.minWidth, "50px", "detail label preserves its minimum width");
		assert.ok(label.width >= 50, "detail label does not shrink");
	}
	assert.ok(geometry.detailValueLefts.every((left) => Math.abs(left - geometry.detailValueLefts[0]) <= 1), "detail values retain one aligned column");
	for (const field of geometry.fields) {
		assert.ok(field.textBounds.left >= field.bounds.left - 1 && field.textBounds.right <= field.bounds.right + 1, `text wraps: ${field.selector}`);
		assert.ok(field.scrollWidth <= field.clientWidth + 1, `field fits: ${field.selector}`);
	}
	if (expected) {
		assert.equal(geometry.fields[0].text, expected.subject, "full subject remains present");
		assert.equal(geometry.fields[1].text, expected.email, "full email remains present");
		assert.equal(geometry.fields[2].text, expected.message, "full message remains present");
	}
	await page.keyboard.press("Shift+Tab");
	assert.equal(await page.getByRole("button", { name: "reply via email", exact: true }).evaluate((node) => node === document.activeElement), true);
	await page.keyboard.press("Tab");
	assert.equal(await close.evaluate((node) => node === document.activeElement), true);
	await page.keyboard.press("Escape");
	await dialog.waitFor({ state: "detached" });
	assert.equal(await view.evaluate((node) => node === document.activeElement), true);
	assert.equal(await page.evaluate(() => document.body.style.overflow), "");
	return geometry;
}

for (const [engine, browserType] of Object.entries(engines)) {
	const browser = await browserType.launch({ headless: true });
	try {
		for (const theme of ["light", "dark"]) {
			for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
				const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: theme });
				const page = await context.newPage();
				const errors = [];
				page.on("pageerror", (error) => errors.push(error.message));
				await page.goto(origin);
				await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
				await page.getByRole("status").waitFor();
				await page.evaluate(() => window.inquiryFixture.respond());
				await page.locator("tbody tr").first().waitFor();
				const initialTable = await assertTriageFits(page);
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
				const keyboard = await keyboardDialog(page);
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
				const prefix = `${engine}-${theme}-${viewport.width}`;
				await page.screenshot({ path: resolve(output, `${prefix}-inquiries.png`), fullPage: true });
				assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
				const record = { engine, theme, viewport, initialTable, keyboard };
				if (viewport.width <= 768) {
					await page.goto(`${origin}/?case=long-tokens`);
					await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
					await page.getByRole("status").waitFor();
					await page.evaluate(() => window.inquiryFixture.respond());
					await page.locator("tbody tr").waitFor();
					record.longTable = await assertTriageFits(page);
					const expected = await page.evaluate(() => window.inquiryFixture.expectedLongInquiry);
					record.longModal = await keyboardDialog(page, expected);
					await page.getByRole("button", { name: "view", exact: true }).click();
					await page.screenshot({ path: resolve(output, `${prefix}-long-modal.png`), fullPage: true });
					await page.getByRole("button", { name: "Close dialog", exact: true }).click();
					await page.getByRole("dialog").waitFor({ state: "detached" });
				}
				assert.deepEqual(errors, []);
				record.errors = errors;
				results.push(record);
				await writeFile(resolve(output, "verification.json"), `${JSON.stringify(results, null, 2)}\n`);
				await context.close();
				console.log(`PASS ${prefix}: pagination, per-cell bounds, table roles, keyboard focus, full long-token detail`);
			}
		}
	} finally { await browser.close(); }
}
