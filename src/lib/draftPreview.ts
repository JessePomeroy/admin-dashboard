import { browser } from "$app/environment";

/** Open synchronously from the click so saving the draft does not trigger popup blocking. */
export async function openSavedDraftPreview(endpoint: string, prepare: () => Promise<Record<string, string> | null>, name: string) {
	if (!browser) return;
	if (!endpoint.startsWith("/") || endpoint.startsWith("//")) throw new Error("Invalid preview endpoint.");
	const previewWindow = window.open("about:blank", name);
	if (!previewWindow) throw new Error("Allow pop-ups for this site to open the draft preview.");
	previewWindow.opener = null;
	try {
		const body = await prepare();
		if (!body) { previewWindow.close(); return; }
		const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
		const result: unknown = await response.json();
		if (!response.ok || !result || typeof result !== "object" || !("previewUrl" in result) || typeof result.previewUrl !== "string") throw new Error("Could not preview this draft. Complete its required fields, save, and try again.");
		const url = new URL(result.previewUrl, window.location.origin);
		if (url.origin !== window.location.origin || url.username || url.password) throw new Error("The preview endpoint returned an unsafe URL.");
		previewWindow.location.href = url.href;
	} catch (cause) { previewWindow.close(); throw cause; }
}
