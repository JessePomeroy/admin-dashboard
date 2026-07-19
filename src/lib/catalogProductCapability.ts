import type { AdminConfig } from "./config";

export function getCatalogProductEditorCapability(config: AdminConfig) {
	const settings = config.editor?.products;
	const api = config.api.catalogProducts;
	if (
		!settings ||
		!(settings.enabledKinds ?? ["print"]).includes("print") ||
		!api?.listForEditor ||
		!api.getEditorState ||
		!api.createDraft ||
		!api.saveDraft ||
		!api.discardDraft
	) {
		return null;
	}
	return { api, settings };
}
