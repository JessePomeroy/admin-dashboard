import { mkdir } from "node:fs/promises";
import playwright from "/home/strayblackdog/Documents/work/angelsrest-r8-editor-workspaces-preview/node_modules/.pnpm/@playwright+test@1.59.1/node_modules/@playwright/test/index.js";

const { chromium } = playwright;
const baseUrl = "http://127.0.0.1:4181";
const outputDirectory = "/home/strayblackdog/Documents/Obsidian/quilt/08_assets/attachments/photographer-crm/r8-editor-workspaces-acceptance";

const captures = [
	["portfolio-desktop-dark-selected.png", 1440, 900, "portfolio", "dark", "selected"],
	["portfolio-desktop-light-selected.png", 1440, 900, "portfolio", "light", "selected"],
	["portfolio-desktop-dark-collection.png", 1440, 900, "portfolio", "dark", "collection"],
	["portfolio-medium-dark-selected.png", 1024, 768, "portfolio", "dark", "selected"],
	["portfolio-medium-dark-collection.png", 1024, 768, "portfolio", "dark", "collection"],
	["portfolio-phone-light-selected.png", 390, 844, "portfolio", "light", "selected"],
	["portfolio-phone-dark-collection.png", 390, 844, "portfolio", "dark", "collection"],
	["portfolio-desktop-dark-loading.png", 1440, 900, "portfolio", "dark", "loading"],
	["portfolio-desktop-dark-error.png", 1440, 900, "portfolio", "dark", "error"],
	["products-desktop-dark-selected.png", 1440, 900, "products", "dark", "selected"],
	["products-desktop-light-selected.png", 1440, 900, "products", "light", "selected"],
	["products-desktop-dark-collection.png", 1440, 900, "products", "dark", "collection"],
	["products-medium-dark-selected.png", 1024, 768, "products", "dark", "selected"],
	["products-medium-dark-collection.png", 1024, 768, "products", "dark", "collection"],
	["products-phone-light-selected.png", 390, 844, "products", "light", "selected"],
	["products-phone-dark-collection.png", 390, 844, "products", "dark", "collection"],
	["products-desktop-dark-loading.png", 1440, 900, "products", "dark", "loading"],
	["products-desktop-dark-error.png", 1440, 900, "products", "dark", "error"],
	["rp-portfolio-desktop-dark-selected.png", 1440, 900, "portfolio", "dark", "selected", "rp"],
	["rp-portfolio-phone-light-selected.png", 390, 844, "portfolio", "light", "selected", "rp"],
	["rp-products-desktop-dark-selected.png", 1440, 900, "products", "dark", "selected", "rp"],
	["rp-products-phone-light-selected.png", 390, 844, "products", "light", "selected", "rp"],
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
	for (const [filename, width, height, pageName, theme, state, host = "angels"] of captures) {
		console.log(`capturing ${filename}`);
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			await page.setViewportSize({ width, height });
			await page.emulateMedia({ colorScheme: theme });
			const selected = state === "selected";
			const query = new URLSearchParams({ page: pageName, theme, state, selected: String(selected), host });
			try {
				await page.goto(`${baseUrl}/?${query}`, { waitUntil: "networkidle" });
				await page.evaluate(async ({ expectedHeadingFont, expectedHost, expectedTheme }) => {
					await document.fonts.ready;
					if (expectedHost === "angels" && (!document.fonts.check('16px "Synonym"') || !document.fonts.check(`16px "${expectedHeadingFont}"`))) throw new Error("Angels Rest fonts did not load");
					const shell = document.querySelector("[data-admin]");
					const heading = document.querySelector("h1");
					if (!shell || !heading) throw new Error("Exact Editor shell did not render");
					const style = getComputedStyle(shell);
					const expectedDark = expectedHost === "rp" ? "26, 31, 46" : "30, 41, 59";
					const expectedLight = expectedHost === "rp" ? "240, 244, 248" : "241, 245, 249";
					if (style.getPropertyValue("--admin-dark-rgb").trim() !== expectedDark) throw new Error("Wrong host dark palette");
					if (style.getPropertyValue("--admin-light-rgb").trim() !== expectedLight) throw new Error("Wrong host light palette");
					if (expectedHost === "angels" && style.getPropertyValue("--admin-accent-color").trim() !== "#818cf8") throw new Error("Wrong Angels accent");
					if (expectedHost === "angels" && (!style.fontFamily.includes("Synonym") || !getComputedStyle(heading).fontFamily.includes(expectedHeadingFont))) throw new Error("Wrong Angels fonts");
					if (expectedHost === "angels" && style.textTransform !== "lowercase") throw new Error("Wrong Angels text transform");
					if (expectedHost === "rp") {
						if (style.getPropertyValue("--admin-accent-color").trim() !== "") throw new Error("Reflecting Pool must use the theme-derived accent");
						if (!style.fontFamily.includes("system-ui") || !getComputedStyle(heading).fontFamily.includes("system-ui")) throw new Error("Wrong Reflecting Pool system fonts");
						if (style.textTransform !== "none") throw new Error("Wrong Reflecting Pool text transform");
						const probe = document.createElement("span");
						probe.style.color = "var(--admin-accent)";
						shell.append(probe);
						const accent = getComputedStyle(probe).color;
						probe.remove();
						const expectedAccent = expectedTheme === "dark" ? "rgba(240, 244, 248, 0.85)" : "rgba(26, 31, 46, 0.75)";
						if (accent !== expectedAccent) throw new Error(`Wrong Reflecting Pool ${expectedTheme} accent: ${accent}`);
					}
					if (document.documentElement.scrollWidth > document.documentElement.clientWidth) throw new Error("Horizontal overflow");
				}, { expectedHeadingFont: pageName === "products" ? "Synonym" : "Chillax", expectedHost: host, expectedTheme: theme });
				break;
			} catch (error) {
				if (attempt === 3) throw error;
			}
		}
		await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
		await page.waitForTimeout(700);
		await page.screenshot({ path: `${outputDirectory}/${filename}`, animations: "disabled", caret: "hide" });
	}
} finally {
	await page.close();
	await context.close();
	await browser.close();
}
