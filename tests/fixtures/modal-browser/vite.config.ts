import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [svelte({ configFile: false, compilerOptions: { css: "injected" } })],
	server: { host: "127.0.0.1", port: 5199, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
});
