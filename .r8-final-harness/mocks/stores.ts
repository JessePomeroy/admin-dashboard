import { writable } from "svelte/store";

const route = new URLSearchParams(location.search).get("route") === "admin" ? "/admin" : "/admin/editor";
export const page = writable({ url: new URL(route, location.origin) });

Object.assign(window, {
	setR8Route(pathname: string) {
		page.set({ url: new URL(pathname, location.origin) });
	},
});
