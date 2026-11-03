import { readable } from "svelte/store";
const url = new URL(window.location.href); url.pathname = url.searchParams.get("view") === "queue" ? "/admin/correspondence" : "/admin/inquiries";
export const page = readable({url});
