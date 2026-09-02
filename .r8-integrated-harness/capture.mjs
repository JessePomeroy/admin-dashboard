import playwright from "/home/strayblackdog/Documents/work/angelsrest/node_modules/.pnpm/@playwright+test@1.59.1/node_modules/@playwright/test/index.js";

const { chromium } = playwright;

const baseUrl = "http://127.0.0.1:4180";
const outputDirectory = "/home/strayblackdog/Documents/Obsidian/quilt/08_assets/attachments/photographer-crm/r8-blog-workbench-acceptance";

const captures = [
	["desktop-1440-dark-selected.png", 1440, 900, "selected", "dark"],
	["desktop-1440-light-selected.png", 1440, 900, "selected", "light"],
	["desktop-1440-dark-collection.png", 1440, 900, "collection", "dark"],
	["desktop-1440-dark-published.png", 1440, 900, "published", "dark"],
	["medium-1024-dark-collection.png", 1024, 768, "collection", "dark"],
	["medium-1024-dark-selected.png", 1024, 768, "selected", "dark"],
	["phone-390-dark-collection.png", 390, 844, "collection", "dark"],
	["phone-390-light-selected.png", 390, 844, "selected", "light"],
	["desktop-1440-dark-loading.png", 1440, 900, "loading", "dark"],
	["desktop-1440-dark-query-error.png", 1440, 900, "error", "dark"],
	["desktop-1440-dark-dirty.png", 1440, 900, "dirty", "dark"],
	["desktop-1440-dark-saving.png", 1440, 900, "saving", "dark"],
	["desktop-1440-light-validation.png", 1440, 900, "validation", "light"],
	["desktop-1440-dark-mutation-error.png", 1440, 900, "mutation-error", "dark"],
];

const browser = await chromium.launch({ headless: true });
try {
	for (const [filename, width, height, state, theme] of captures) {
		const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
		await page.goto(`${baseUrl}/?state=${state}&theme=${theme}`, { waitUntil: "networkidle" });
		await page.evaluate(async () => {
			await document.fonts.ready;
			if (!document.fonts.check('16px "Synonym"') || !document.fonts.check('16px "Chillax"')) {
				throw new Error("Angels Rest Fontshare fonts did not load");
			}
			const shell = document.querySelector("[data-admin]");
			const heading = document.querySelector("h1");
			if (!shell || !heading) throw new Error("Exact Admin shell did not render");
			const shellStyle = getComputedStyle(shell);
			if (shellStyle.getPropertyValue("--admin-dark-rgb").trim() !== "30, 41, 59") throw new Error("Wrong Angels dark palette");
			if (shellStyle.getPropertyValue("--admin-light-rgb").trim() !== "241, 245, 249") throw new Error("Wrong Angels light palette");
			if (shellStyle.getPropertyValue("--admin-accent-color").trim() !== "#818cf8") throw new Error("Wrong Angels accent");
			if (!shellStyle.fontFamily.includes("Synonym")) throw new Error("Wrong Angels body font");
			if (!getComputedStyle(heading).fontFamily.includes("Chillax")) throw new Error("Wrong Angels display font");
			if (shellStyle.textTransform !== "lowercase") throw new Error("Wrong Angels text transform");
		});

		if (["dirty", "saving", "mutation-error"].includes(state)) {
			const title = page.getByLabel("post title", { exact: true });
			await title.fill("Field Notes from the North Shore — revised");
			await page.getByText("dirty", { exact: true }).waitFor();
		}
		if (state === "saving") {
			await page.getByRole("button", { name: "save draft" }).click();
			await page.getByText("saving", { exact: true }).waitFor();
		}
		if (state === "mutation-error") {
			await page.getByRole("button", { name: "save draft" }).click();
			await page.getByRole("alert").filter({ hasText: "Could not save this draft" }).waitFor();
		}
		if (state === "validation") {
			await page.getByLabel("post title", { exact: true }).fill("");
			await page.getByRole("button", { name: "publish", exact: true }).click();
			await page.getByText("Post title is required.", { exact: true }).waitFor();
		}

		await page.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		});
		await page.waitForTimeout(700);
		await page.screenshot({
			path: `${outputDirectory}/${filename}`,
			animations: "disabled",
			caret: "hide",
		});
		await page.close();
	}
} finally {
	await browser.close();
}
