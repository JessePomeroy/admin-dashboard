import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorShellSource = readFileSync("src/lib/styles/editor-shell.css", "utf8");
const editorNavigationSource = readFileSync(
	"src/lib/components/EditorNavigation.svelte",
	"utf8",
);
const adminLayoutSource = readFileSync(
	"src/lib/components/AdminLayout.svelte",
	"utf8",
);
const workbenchSources = [
	"src/lib/pages/editor/BlogWorkbench.svelte",
	"src/lib/pages/editor/PortfolioWorkbench.svelte",
	"src/lib/pages/editor/ProductWorkbench.svelte",
].map((path) => readFileSync(path, "utf8"));
const productOverviewSource = readFileSync(
	"src/lib/pages/editor/ProductsPage.svelte",
	"utf8",
);

describe("Editor desktop header alignment", () => {
	it("anchors the compact brand and Editor heading to one shared row", () => {
		expect(editorShellSource).toContain("--editor-header-height: 64px");
		expect(editorShellSource).toContain("--editor-header-baseline-inset: 12px");
		expect(editorShellSource).toContain("height: var(--editor-header-height)");
		expect(editorNavigationSource).toContain(".editor-navigation:not(.mobile)");
		expect(editorNavigationSource).toContain(
			"height: var(--editor-header-height, 64px)",
		);
		expect(editorNavigationSource).toContain(
			"padding: 0 8px var(--editor-header-baseline-inset, 12px)",
		);
	});

	it("animates only the desktop rail while keeping its contents from reflowing", () => {
		expect(adminLayoutSource).toContain(
			"flex: 0 0 var(--editor-header-height, 64px)",
		);
		expect(adminLayoutSource).toContain(
			"height: var(--editor-header-height, 64px)",
		);
		expect(adminLayoutSource).toContain("white-space: nowrap");
		expect(adminLayoutSource).toContain("text-overflow: ellipsis");
		expect(editorShellSource).toContain("--editor-rail-motion-duration: 300ms");
		expect(editorShellSource).toContain(
			"--editor-rail-motion-easing: cubic-bezier(0.33, 1, 0.68, 1)",
		);
		expect(editorShellSource).toContain(
			"@media (min-width: 769px) and (prefers-reduced-motion: no-preference)",
		);
		expect(editorShellSource).toContain(
			"transition: width var(--editor-rail-motion-duration) var(--editor-rail-motion-easing)",
		);
		expect(editorShellSource).not.toMatch(/transition:[^;]*margin-left/);
		expect(editorShellSource).not.toMatch(
			/\.admin-main\s*\{[^}]*transition:/s,
		);
		expect(editorShellSource).toContain("height: 37px");
		expect(editorShellSource).toContain("padding: 2px 7px");
		expect(editorShellSource).toContain("margin: 3px 6px");
		expect(editorShellSource).toContain("max-width: 0");
		expect(editorShellSource).toContain("opacity: 0");
		expect(adminLayoutSource).toContain(
			"@media (max-width: 768px) and (prefers-reduced-motion: no-preference)",
		);
		expect(adminLayoutSource).toContain("transition: transform 0.25s ease");
		expect(adminLayoutSource).toContain('class="brand-mark" aria-hidden="true"');
		expect(editorShellSource).toContain(
			"[data-admin] .sidebar.editor-compact .brand-mark",
		);
		expect(editorShellSource).not.toContain(".brand-text::first-letter");
	});

	it("gives every workbench the same desktop baseline without changing phone stacking", () => {
		expect(editorShellSource).toContain("@media (min-width: 641px)");
		expect(editorShellSource).toContain(
			"[data-admin] .workbench-heading.editor-workbench-header",
		);
		expect(editorShellSource).toContain(
			"padding-bottom: var(--editor-workbench-baseline-inset)",
		);
		for (const source of workbenchSources) {
			expect(source).toContain('class="workbench-heading editor-workbench-header"');
			expect(source).toContain(
				"min-height: calc(100vh - var(--editor-header-height, 64px))",
			);
			expect(source).toContain("@media (max-width: 640px)");
		}
	});

	it("draws one quiet desktop divider without changing header geometry", () => {
		expect(editorShellSource).toContain("--editor-header-divider: color-mix");
		expect(editorShellSource).toContain(
			":is(.sidebar.editor-compact, .editor-navigation:not(.mobile))::after",
		);
		expect(editorShellSource).toContain(
			"top: calc(var(--editor-header-height) - 1px)",
		);
		expect(editorShellSource).toContain(
			"border-bottom-color: var(--editor-header-divider)",
		);
	});

	it("uses the defined display type token for Product headings", () => {
		expect(workbenchSources[2]).toContain("font-family: var(--admin-font-display)");
		expect(workbenchSources[2]).not.toContain("--admin-font-heading");
		expect(productOverviewSource).toContain("font-family: var(--admin-font-display)");
		expect(productOverviewSource).not.toContain("--admin-font-heading");
	});
});
