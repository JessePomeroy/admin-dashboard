import { readable } from "svelte/store";

const url = new URL(window.location.href);
url.pathname = url.searchParams.has("editor") ? "/admin/editor" : "/admin";
export const page = readable({ url });
