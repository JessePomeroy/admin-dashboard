import { mount, unmount } from "svelte";
import Harness from "../../ModalLifecycleHarness.svelte";
import "../../../src/lib/theme.css";

const target = document.getElementById("app");
if (!target) throw new Error("Missing modal fixture target");
const component = mount(Harness, { target });
Object.assign(window, { modalFixture: component, unmountModalFixture: () => unmount(component) });
