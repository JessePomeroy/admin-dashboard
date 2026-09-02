import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const root = import.meta.dirname;

export default defineConfig({
	root,
	plugins: [svelte()],
	resolve: {
		alias: [
			{ find: "$app/environment", replacement: resolve(root, "mocks/environment.ts") },
			{ find: "$app/navigation", replacement: resolve(root, "mocks/navigation.ts") },
			{ find: "$app/stores", replacement: resolve(root, "mocks/stores.ts") },
			{ find: "convex-svelte", replacement: resolve(root, "mocks/convex-svelte.ts") },
			{ find: "../adminClient", replacement: resolve(root, "mocks/adminClient.ts") },
			{ find: "../config", replacement: resolve(root, "mocks/config.ts") },
		],
	},
	server: { host: "0.0.0.0", port: 4188, strictPort: true },
});
