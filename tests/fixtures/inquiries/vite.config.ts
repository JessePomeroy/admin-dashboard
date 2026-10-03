import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [svelte({ configFile: false, preprocess: vitePreprocess(), compilerOptions: { css: "injected" } })],
	resolve: { alias: [
		{ find: /^(?:\.\.\/|\.\/)config$/, replacement: fileURLToPath(new URL("./config.ts", import.meta.url)) },
		{ find: "$app/environment", replacement: fileURLToPath(new URL("../../stubs/svelteKitEnvironment.ts", import.meta.url)) },
	] },
	server: { host: "127.0.0.1", port: 5213, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
});
