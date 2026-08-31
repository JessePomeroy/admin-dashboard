import type { AdminConfig } from "./config";
import type { CatalogProductKind } from "./catalogProductEditor";
import { isRootedQuerylessEndpoint } from "./catalogPrivateEditorUpload";

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

function explicitOwnRef(value: object, key: string) {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && "value" in descriptor && descriptor.value
		? descriptor.value
		: null;
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
		const mediaApi = settings.mediaBaseUrl
			&& config.api.mediaAssets?.listForEditor
			&& config.api.mediaAssets.getManyForEditor
			? config.api.mediaAssets
			: null;
		const configuredPrivateUpload = settings.privateAssetUpload;
		const privateUpload = configuredPrivateUpload
			&& isRootedQuerylessEndpoint(configuredPrivateUpload.prepareEndpoint)
			&& isRootedQuerylessEndpoint(configuredPrivateUpload.completeEndpoint)
			? {
					prepareEndpoint: configuredPrivateUpload.prepareEndpoint,
					completeEndpoint: configuredPrivateUpload.completeEndpoint,
				}
			: null;
		const listCandidates = settings.privateAssetReplacementEnabled === true
			? explicitOwnRef(graphApi, "listDraftPrivateAssetCandidates")
			: null;
		const replacePrivateAsset = settings.privateAssetReplacementEnabled === true
			? explicitOwnRef(graphApi, "replaceDraftPrivateAsset")
			: null;
		const replacement = listCandidates && replacePrivateAsset
			? { listCandidates, replace: replacePrivateAsset }
			: null;
		const privateAssets = privateUpload || replacement
			? { upload: privateUpload, replacement }
			: null;
		const publishDraft = settings.publicationEnabled === true
			? explicitOwnRef(graphApi, "publishDraft")
			: null;
		const unpublish = settings.publicationEnabled === true
			? explicitOwnRef(graphApi, "unpublish")
			: null;
		const publication = publishDraft && unpublish
			? { publishDraft, unpublish }
			: null;
		return {
			api: graphApi,
			enabledKinds,
			graphVersion: 2 as const,
			settings,
			media: mediaApi && settings.mediaBaseUrl
				? { api: mediaApi, mediaBaseUrl: settings.mediaBaseUrl, uploadEndpoint: settings.uploadEndpoint }
				: null,
			privateAssets,
			publication,
			publishesToShop: Boolean(publication && settings.publicShopEnabled === true),
		};
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
	return {
		api,
		enabledKinds: ["print"] as CatalogProductKind[],
		graphVersion: 1 as const,
		settings,
		media: null,
		privateAssets: null,
		publication: null,
		publishesToShop: false,
	};
}
