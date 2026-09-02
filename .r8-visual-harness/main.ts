import { mount } from "svelte";
import "../src/lib/theme.css";
import "../src/lib/styles/editorial-page.css";
import App from "./App.svelte";

const state = new URLSearchParams(location.search);
document.documentElement.classList.toggle("dark", state.get("theme") !== "light");

mount(App, {
	target: document.querySelector("#app")!,
});
