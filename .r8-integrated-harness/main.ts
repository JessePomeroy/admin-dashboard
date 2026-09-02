import { mount } from "svelte";
import "../src/lib/theme.css";
import "../src/lib/styles/editor-shell.css";
import "./angels-host.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
