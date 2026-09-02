import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const root = import.meta.dirname;

export default defineConfig({
	root,
	plugins: [svelte()],
	resolve: {
		alias: [
			{ find: "$app/navigation", replacement: resolve(root, "mocks/navigation.ts") },
			{ find: "$app/environment", replacement: resolve(root, "mocks/environment.ts") },
			{ find: "convex-svelte", replacement: resolve(root, "mocks/convex-svelte.ts") },
			{ find: "../../adminClient", replacement: resolve(root, "mocks/adminClient.ts") },
			{ find: "../../config", replacement: resolve(root, "mocks/config.ts") },
		],
	},
	server: { host: "127.0.0.1", port: 4181, strictPort: true },
});
