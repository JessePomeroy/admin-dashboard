import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	publicDir: process.env.ADMIN_PREVIEW_PUBLIC_DIR || false,
	plugins: [svelte({ configFile: false, preprocess: vitePreprocess(), compilerOptions: { css: "injected" } })],
	resolve: { alias: [
		{ find: /^(?:\.\.\/|\.\/)config$/, replacement: fileURLToPath(new URL("./config.ts", import.meta.url)) },
		{ find: /^(?:\.\.\/|\.\/)adminClient$/, replacement: fileURLToPath(new URL("./adminClient.ts", import.meta.url)) },
		{ find: "$app/environment", replacement: fileURLToPath(new URL("../../stubs/svelteKitEnvironment.ts", import.meta.url)) },
		{ find: "$app/stores", replacement: fileURLToPath(new URL("./stores.ts", import.meta.url)) },
		{ find: "$app/navigation", replacement: fileURLToPath(new URL("../../stubs/svelteKitNavigation.ts", import.meta.url)) },
	] },
	server: { host: "127.0.0.1", port: 5217, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
});
