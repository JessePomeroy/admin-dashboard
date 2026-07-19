import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

const svelteKitEnvironment = fileURLToPath(new URL(
	"./tests/stubs/svelteKitEnvironment.ts",
	import.meta.url,
));

export default defineConfig({
	test: {
		globals: true,
		projects: [
			{
				test: {
					name: "node",
					include: ["tests/**/*.test.ts"],
					exclude: [
						"tests/Gallery*.test.ts",
						"tests/Messages*.test.ts",
						"tests/**/*.component.test.ts",
					],
					environment: "node",
				},
			},
			{
				plugins: [svelte()],
				resolve: {
					alias: { "$app/environment": svelteKitEnvironment },
					conditions: ["browser"],
				},
				test: {
					name: "components",
					include: [
						"tests/Gallery*.test.ts",
						"tests/Messages*.test.ts",
						"tests/**/*.component.test.ts",
					],
					environment: "jsdom",
				},
			},
		],
	},
});
