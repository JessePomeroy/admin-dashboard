import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

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
