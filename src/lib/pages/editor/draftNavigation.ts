import { onMount } from "svelte";
import { beforeNavigate } from "$app/navigation";

export function protectDraftNavigation(pending: () => boolean) {
	beforeNavigate((navigation) => {
		if (!pending() || navigation.willUnload) return;
		if (!globalThis.confirm("You have unsaved work. Leave this editor?")) navigation.cancel();
	});
	onMount(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (!pending()) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	});
}
