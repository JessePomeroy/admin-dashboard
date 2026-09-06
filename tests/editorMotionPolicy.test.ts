import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("gates desktop and mobile rail motion on the reduced-motion preference", () => {
	const shell = readFileSync("src/lib/styles/editor-shell.css", "utf8");
	const layout = readFileSync("src/lib/components/AdminLayout.svelte", "utf8");
	expect(shell).toContain("@media (min-width: 769px) and (prefers-reduced-motion: no-preference)");
	expect(layout).toContain("@media (max-width: 768px) and (prefers-reduced-motion: no-preference)");
});
