import { mount } from "svelte";
import "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/theme.css";
import "/home/strayblackdog/Documents/work/admin-dashboard-r8-editor-workspaces-r8-1/src/lib/styles/editor-shell.css";
import "./angels-host.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
