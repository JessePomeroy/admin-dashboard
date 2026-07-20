import type { AdminConfig } from "./config";
import type { CatalogProductKind } from "./catalogProductEditor";

export const CATALOG_PRODUCT_KINDS = [
	"print",
	"print_set",
	"postcard",
	"merchandise",
	"tapestry",
	"digital_download",
] as const satisfies readonly CatalogProductKind[];

function normalizeEnabledKinds(
	kinds: readonly CatalogProductKind[] | undefined,
) {
	return kinds === undefined ? ["print"] : [...kinds];
}

export function getCatalogProductEditorCapability(config: AdminConfig) {
	const settings = config.editor?.products;
	const enabledKinds = normalizeEnabledKinds(settings?.enabledKinds);
	const graphApi = config.api.catalogProductGraphs;
	if (
		settings &&
		graphApi?.listForEditor &&
		graphApi.getEditorState &&
		graphApi.createDraft &&
		graphApi.saveDraft &&
		graphApi.discardDraft
	) {
		return { api: graphApi, enabledKinds, graphVersion: 2 as const, settings };
	}
	const api = config.api.catalogProducts;
	if (
		!settings ||
		!enabledKinds.includes("print") ||
		!api?.listForEditor ||
		!api.getEditorState ||
		!api.createDraft ||
		!api.saveDraft ||
		!api.discardDraft
	) {
		return null;
	}
	return { api, enabledKinds: ["print"] as CatalogProductKind[], graphVersion: 1 as const, settings };
}
