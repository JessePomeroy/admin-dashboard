const ref = (name: string) => ({ name });
const reflectingPool = new URLSearchParams(location.search).get("host") === "rp";

export const refs = {
	portfolioList: ref("portfolio:listForEditor"),
	portfolioState: ref("portfolio:getEditorState"),
	portfolioSave: ref("portfolio:saveDraft"),
	portfolioReorder: ref("portfolio:reorder"),
	portfolioPublish: ref("portfolio:publish"),
	mediaList: ref("media:listForEditor"),
	mediaMany: ref("media:getManyForEditor"),
	mediaRegister: ref("media:registerReadyWebAsset"),
	catalogList: ref("catalog:listForEditor"),
	catalogState: ref("catalog:getEditorState"),
	catalogCreate: ref("catalog:createDraft"),
	catalogSave: ref("catalog:saveDraft"),
	catalogDiscard: ref("catalog:discardDraft"),
	catalogCandidates: ref("catalog:listDraftPrivateAssetCandidates"),
	catalogReplace: ref("catalog:replaceDraftPrivateAsset"),
	catalogPublish: ref("catalog:publishDraft"),
	catalogUnpublish: ref("catalog:unpublish"),
};

export function getAdminConfig() {
	return {
		siteUrl: reflectingPool ? "zippymiggy.com" : "angelsrest.online",
		siteName: reflectingPool ? "reflecting pool" : "angel's rest",
		fromEmail: "studio@example.com",
		isCreator: true,
		api: {
			portfolioEditor: {
				listForEditor: refs.portfolioList,
				getEditorState: refs.portfolioState,
				saveDraft: refs.portfolioSave,
				reorder: refs.portfolioReorder,
				listMediaAssets: refs.mediaList,
				getPlacedMediaAssets: refs.mediaMany,
				registerReadyWebAsset: refs.mediaRegister,
				...(reflectingPool ? { publish: refs.portfolioPublish } : {}),
			},
			catalogProductGraphs: {
				listForEditor: refs.catalogList,
				getEditorState: refs.catalogState,
				createDraft: refs.catalogCreate,
				saveDraft: refs.catalogSave,
				discardDraft: refs.catalogDiscard,
				...(!reflectingPool ? {
					listDraftPrivateAssetCandidates: refs.catalogCandidates,
					replaceDraftPrivateAsset: refs.catalogReplace,
					publishDraft: refs.catalogPublish,
					unpublish: refs.catalogUnpublish,
				} : {}),
			},
			mediaAssets: {
				listForEditor: refs.mediaList,
				getManyForEditor: refs.mediaMany,
				registerReadyWebAsset: refs.mediaRegister,
			},
		},
		editor: {
			portfolio: {
				mediaBaseUrl: "http://127.0.0.1:4181/media",
				uploadEndpoint: "/api/admin/media",
				...(reflectingPool ? { previewEndpoint: "/api/admin/preview/portfolio" } : {}),
			},
			products: {
				...(!reflectingPool ? {
					publicationEnabled: true,
					privateAssetReplacementEnabled: true,
					privateAssetUpload: { prepareEndpoint: "/prepare", completeEndpoint: "/complete" },
				} : {}),
				enabledKinds: reflectingPool
					? ["print", "print_set", "postcard"]
					: ["print", "print_set", "postcard", "merchandise", "tapestry", "digital_download"],
				mediaBaseUrl: "http://127.0.0.1:4181/media",
				uploadEndpoint: "/api/admin/media",
			},
		},
	};
}
