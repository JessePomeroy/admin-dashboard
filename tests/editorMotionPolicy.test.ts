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

it("retains usable destinations and a reachable footer in short mobile sidebars", async () => {
 const layout = readFileSync("src/lib/components/AdminLayout.svelte", "utf8");
 const shell = readFileSync("src/lib/styles/editor-shell.css", "utf8");
 const {css} = compile(layout,{filename:"src/lib/components/AdminLayout.svelte",generate:"client",cssHash:()=>"svelte-sidebar-fixture"});
 if(!css) throw new Error("Admin layout stylesheet was not compiled");
 const page=await browser.newPage({viewport:{width:740,height:360},reducedMotion:"reduce"});
 try{
  await page.route("**/*",route=>route.abort());
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}${css.code}\n${shell}</style>
   <div data-admin><aside class="sidebar sidebar-open">
    <div class="sidebar-brand"><span>Fixture admin</span></div>
    <nav class="sidebar-nav">${Array.from({length:13},(_,index)=>`<a class="nav-item" href="#destination-${index}">Destination ${index}</a>`).join("")}</nav>
    <div class="sidebar-footer"><div class="user-info"><span class="user-email">fixture@example.invalid</span></div>
     ${["change password","connect google","sign out","dark mode"].map(label=>`<button class="theme-toggle">${label}</button>`).join("")}
     <a class="back-link" href="#back">back to site</a>
    </div>
   </aside></div><nav style="position:fixed;bottom:0;width:100%;height:60px;z-index:50">Host navigation</nav>`);
  await page.locator('[data-admin] *').evaluateAll(elements=>elements.forEach(element=>element.classList.add('svelte-sidebar-fixture')));
  const destination=page.locator('.sidebar-nav a').nth(3);
  const bounds=await destination.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(360);
  expect(await destination.evaluate(element=>{const r=element.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===element;})).toBe(true);
  const footer=page.locator('.back-link');
  await footer.scrollIntoViewIfNeeded();
  expect(await footer.evaluate(element=>{const r=element.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===element;})).toBe(true);
 }finally{await page.close();}
});
