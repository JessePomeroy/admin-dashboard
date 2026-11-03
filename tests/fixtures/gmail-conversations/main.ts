import {mount} from "svelte";
import App from "./App.svelte";
import {fixture,pushNative} from "./state.svelte";
import {requests} from "./config";
const stored=sessionStorage.getItem("fixture-draft");if(stored)fixture.detail.draft=JSON.parse(stored);
Object.assign(window,{gmailFixture:{fixture,pushNative,requests}});
mount(App,{target:document.getElementById("app")!});
