import type { AdminAPI } from "./config";

/** New standard APIs must be adopted here; omission cannot silently opt a host out. */
type StandardClientAPI = {
 [Key in Exclude<keyof AdminAPI, "documentEmailAttempts" | "blogContent" | "postContent" | "catalogProducts" | "platformOffboarding" | "contentCleanup">]-?: Required<NonNullable<AdminAPI[Key]>>;
};

// Generated API references are opaque at this package boundary.
type AdminFunction = NonNullable<AdminAPI["adminAuth"]>["checkAdminAccess"];

export interface StandardAdminApiSource {
	activityLog: Record<"getClientActivity", AdminFunction>;
	adminAuth: Record<"checkAdminAccess", AdminFunction>;
	catalogPrivateAssets: Record<"listExpiredUploadsForCleanup" | "listForCleanup" | "requestDeletion", AdminFunction>;
	catalogProductGraphs: Record<"createDraft" | "discardDraft" | "getEditorState" | "listDraftPrivateAssetCandidates" | "listForEditor" | "publishDraft" | "remove" | "replaceDraftPrivateAsset" | "saveDraft" | "unpublish", AdminFunction>;
	content: Record<"getModelingPageEditorState" | "saveModelingPageDraft" | "publishModelingPage" | "discardModelingPageDraft" | "discardAboutPageDraft" | "discardContactPageDraft" | "discardHomepageQuoteDraft" | "discardSiteSettingsDraft" | "getAboutPageEditorState" | "getContactPageEditorState" | "getHomepageQuoteEditorState" | "getSiteSettingsEditorState" | "publishAboutPage" | "publishContactPage" | "publishHomepageQuote" | "publishSiteSettings" | "saveAboutPageDraft" | "saveContactPageDraft" | "saveHomepageQuoteDraft" | "saveSiteSettingsDraft", AdminFunction>;
	contentExport: Record<"page", AdminFunction>;
	contracts: Record<"create" | "createTemplate" | "get" | "list" | "listTemplates" | "markSent" | "markSigned" | "remove" | "removeTemplate" | "update" | "updateTemplate", AdminFunction>;
	crm: Record<"createClient" | "deleteClient" | "getClient" | "getStats" | "listClients" | "listClientsWithTags" | "updateClient", AdminFunction>;
	emailLog: Record<"create", AdminFunction>;
	emailTemplates: Record<"create" | "get" | "getByCategory" | "list" | "remove" | "update", AdminFunction>;
	galleries: Record<"addImage" | "create" | "get" | "getImages" | "getProofImages" | "getUploadPolicy" | "listBySite" | "listBySitePaginated" | "listImageStorageKeys" | "listProofs" | "listSubmittedProofs" | "remove" | "removeImage" | "reopenProof" | "reorderImages" | "update", AdminFunction>;
	galleryPassword: Record<"setPassword", AdminFunction>;
	inquiries: Record<"clientOptions" | "getWorkflow" | "linkClient" | "listForClient" | "listPaginated" | "remove" | "unlinkClient" | "updateFollowUp" | "updateStatus", AdminFunction>;
	invoices: Record<"create" | "get" | "getDashboardSummary" | "getNextNumber" | "list" | "markPaid" | "markSent" | "remove" | "update", AdminFunction>;
	kanban: Record<"addColumn" | "deleteColumn" | "initializeBoard" | "listBoardConfigs" | "moveCard" | "renameColumn" | "reorderCards", AdminFunction>;
	mediaAssets: Record<"getManyForEditor" | "listForEditor" | "registerReadyWebAsset" | "requestDeletion", AdminFunction>;
	messages: Record<"allThreads" | "allThreadsPaginated" | "list" | "listPaginated" | "markRead" | "send", AdminFunction>;
	notifications: Record<"getUnreadFlags" | "markSeen", AdminFunction>;
	orders: Record<"getStats" | "getStatsForDay" | "list" | "updateStatus", AdminFunction>;
	platform: Record<"createClient" | "getFeatureAccess" | "listAll" | "updateClient" | "updateSubscription", AdminFunction>;
	portal: Record<"createToken", AdminFunction>;
	portfolioGalleries: Record<"getEditorState" | "listForEditor" | "publish" | "remove" | "reorder" | "saveDraft" | "setVisibility", AdminFunction>;
	quotes: Record<"convertToInvoice" | "create" | "createPreset" | "get" | "getDashboardSummary" | "getNextNumber" | "list" | "listPresets" | "markAccepted" | "markDeclined" | "markSent" | "remove" | "removePreset" | "update" | "updatePreset", AdminFunction>;
	tags: Record<"assignTag" | "createTag" | "deleteTag" | "getClientTags" | "listTags" | "removeTag", AdminFunction>;
}

/** Complete standard bindings; tenant tiers control access separately. */
export function createStandardAdminAPI(api: StandardAdminApiSource) {
	const bindings = {
	contentExport: { page: api.contentExport.page },
	activityLog: { getClientActivity: api.activityLog.getClientActivity },
	adminAuth: { checkAdminAccess: api.adminAuth.checkAdminAccess },
	contracts: {
		create: api.contracts.create,
		update: api.contracts.update,
		remove: api.contracts.remove,
		get: api.contracts.get,
		list: api.contracts.list,
		markSent: api.contracts.markSent,
		markSigned: api.contracts.markSigned,
		listTemplates: api.contracts.listTemplates,
		createTemplate: api.contracts.createTemplate,
		updateTemplate: api.contracts.updateTemplate,
		removeTemplate: api.contracts.removeTemplate,
	},
	crm: {
		getClient: api.crm.getClient,
		createClient: api.crm.createClient,
		updateClient: api.crm.updateClient,
		deleteClient: api.crm.deleteClient,
		listClients: api.crm.listClients,
		listClientsWithTags: api.crm.listClientsWithTags,
		getStats: api.crm.getStats,
	},
	emailLog: { create: api.emailLog.create },
	emailTemplates: {
		create: api.emailTemplates.create,
		update: api.emailTemplates.update,
		remove: api.emailTemplates.remove,
		get: api.emailTemplates.get,
		getByCategory: api.emailTemplates.getByCategory,
		list: api.emailTemplates.list,
	},
	inquiries: {
		listPaginated: api.inquiries.listPaginated,
		getWorkflow: api.inquiries.getWorkflow,
		clientOptions: api.inquiries.clientOptions,
		linkClient: api.inquiries.linkClient,
		unlinkClient: api.inquiries.unlinkClient,
		updateFollowUp: api.inquiries.updateFollowUp,
		listForClient: api.inquiries.listForClient,
		updateStatus: api.inquiries.updateStatus,
		remove: api.inquiries.remove,
	},
	invoices: {
		getDashboardSummary: api.invoices.getDashboardSummary,
		create: api.invoices.create,
		update: api.invoices.update,
		remove: api.invoices.remove,
		get: api.invoices.get,
		list: api.invoices.list,
		markSent: api.invoices.markSent,
		markPaid: api.invoices.markPaid,
		getNextNumber: api.invoices.getNextNumber,
	},
	kanban: {
		reorderCards: api.kanban.reorderCards,
		initializeBoard: api.kanban.initializeBoard,
		moveCard: api.kanban.moveCard,
		addColumn: api.kanban.addColumn,
		renameColumn: api.kanban.renameColumn,
		deleteColumn: api.kanban.deleteColumn,
		listBoardConfigs: api.kanban.listBoardConfigs,
	},
	messages: {
		send: api.messages.send,
		markRead: api.messages.markRead,
		list: api.messages.list,
		listPaginated: api.messages.listPaginated,
		allThreads: api.messages.allThreads,
		allThreadsPaginated: api.messages.allThreadsPaginated,
	},
	orders: {
		getStatsForDay: api.orders.getStatsForDay,
		list: api.orders.list,
		updateStatus: api.orders.updateStatus,
		getStats: api.orders.getStats,
	},
	notifications: { getUnreadFlags: api.notifications.getUnreadFlags, markSeen: api.notifications.markSeen },
	platform: {
		getFeatureAccess: api.platform.getFeatureAccess,
		createClient: api.platform.createClient,
		updateClient: api.platform.updateClient,
		updateSubscription: api.platform.updateSubscription,
		listAll: api.platform.listAll,
	},
	portal: { createToken: api.portal.createToken },
	quotes: {
		getDashboardSummary: api.quotes.getDashboardSummary,
		create: api.quotes.create,
		update: api.quotes.update,
		remove: api.quotes.remove,
		get: api.quotes.get,
		list: api.quotes.list,
		markSent: api.quotes.markSent,
		markAccepted: api.quotes.markAccepted,
		markDeclined: api.quotes.markDeclined,
		convertToInvoice: api.quotes.convertToInvoice,
		getNextNumber: api.quotes.getNextNumber,
		listPresets: api.quotes.listPresets,
		createPreset: api.quotes.createPreset,
		updatePreset: api.quotes.updatePreset,
		removePreset: api.quotes.removePreset,
	},
	tags: {
		createTag: api.tags.createTag,
		deleteTag: api.tags.deleteTag,
		assignTag: api.tags.assignTag,
		removeTag: api.tags.removeTag,
		listTags: api.tags.listTags,
		getClientTags: api.tags.getClientTags,
	},
	galleryDelivery: {
		listBySitePaginated: api.galleries.listBySitePaginated,
		listSubmittedProofs: api.galleries.listSubmittedProofs,
		listProofs: api.galleries.listProofs,
		getProofImages: api.galleries.getProofImages,
		reopenProof: api.galleries.reopenProof,
		getUploadPolicy: api.galleries.getUploadPolicy,
		create: api.galleries.create,
		setPassword: api.galleryPassword.setPassword,
		update: api.galleries.update,
		remove: api.galleries.remove,
		get: api.galleries.get,
		addImage: api.galleries.addImage,
		removeImage: api.galleries.removeImage,
		reorderImages: api.galleries.reorderImages,
		getImages: api.galleries.getImages,
		listImageStorageKeys: api.galleries.listImageStorageKeys,
		listBySite: api.galleries.listBySite,
	},
	catalogPrivateAssets: {
		listForCleanup: api.catalogPrivateAssets.listForCleanup,
		listExpiredUploadsForCleanup: api.catalogPrivateAssets.listExpiredUploadsForCleanup,
		requestDeletion: api.catalogPrivateAssets.requestDeletion,
	},
	mediaAssets: {
		listForEditor: api.mediaAssets.listForEditor,
		getManyForEditor: api.mediaAssets.getManyForEditor,
		registerReadyWebAsset: api.mediaAssets.registerReadyWebAsset,
	},
	portfolioEditor: {
		listForEditor: api.portfolioGalleries.listForEditor,
		getEditorState: api.portfolioGalleries.getEditorState,
		saveDraft: api.portfolioGalleries.saveDraft,
		reorder: api.portfolioGalleries.reorder,
		publish: api.portfolioGalleries.publish,
		setVisibility: api.portfolioGalleries.setVisibility,
		remove: api.portfolioGalleries.remove,
		listMediaAssets: api.mediaAssets.listForEditor,
		getPlacedMediaAssets: api.mediaAssets.getManyForEditor,
		registerReadyWebAsset: api.mediaAssets.registerReadyWebAsset,
		requestDeletion: api.mediaAssets.requestDeletion,
	},
	siteEditor: {
   getModelingPageEditorState: api.content.getModelingPageEditorState,
   saveModelingPageDraft: api.content.saveModelingPageDraft,
   publishModelingPage: api.content.publishModelingPage,
   discardModelingPageDraft: api.content.discardModelingPageDraft,
		getSiteSettingsEditorState: api.content.getSiteSettingsEditorState,
		saveSiteSettingsDraft: api.content.saveSiteSettingsDraft,
		publishSiteSettings: api.content.publishSiteSettings,
		discardSiteSettingsDraft: api.content.discardSiteSettingsDraft,
		getHomepageQuoteEditorState: api.content.getHomepageQuoteEditorState,
		saveHomepageQuoteDraft: api.content.saveHomepageQuoteDraft,
		publishHomepageQuote: api.content.publishHomepageQuote,
		discardHomepageQuoteDraft: api.content.discardHomepageQuoteDraft,
		getContactPageEditorState: api.content.getContactPageEditorState,
		saveContactPageDraft: api.content.saveContactPageDraft,
		publishContactPage: api.content.publishContactPage,
		discardContactPageDraft: api.content.discardContactPageDraft,
		getAboutPageEditorState: api.content.getAboutPageEditorState,
		saveAboutPageDraft: api.content.saveAboutPageDraft,
		publishAboutPage: api.content.publishAboutPage,
		discardAboutPageDraft: api.content.discardAboutPageDraft,
		listMediaAssets: api.mediaAssets.listForEditor,
		getPlacedMediaAssets: api.mediaAssets.getManyForEditor,
	},
	catalogProductGraphs: {
		listForEditor: api.catalogProductGraphs.listForEditor,
		getEditorState: api.catalogProductGraphs.getEditorState,
		createDraft: api.catalogProductGraphs.createDraft,
		saveDraft: api.catalogProductGraphs.saveDraft,
		discardDraft: api.catalogProductGraphs.discardDraft,
		remove: api.catalogProductGraphs.remove,
		publishDraft: api.catalogProductGraphs.publishDraft,
		unpublish: api.catalogProductGraphs.unpublish,
		listDraftPrivateAssetCandidates: api.catalogProductGraphs.listDraftPrivateAssetCandidates,
		replaceDraftPrivateAsset: api.catalogProductGraphs.replaceDraftPrivateAsset,
	},
} satisfies StandardClientAPI;
	for (const [namespace, functions] of Object.entries(bindings)) {
		for (const [name, reference] of Object.entries(functions)) {
			if (!reference) throw new Error(`Missing standard admin capability: ${namespace}.${name}`);
		}
	}
	return bindings;
}

/** Feature owner for mounted admin pages and side-effect adapters. */
export function adminFeatureForPath(pathname: string): import("./features").Feature | null {
 const path = pathname.replace(/^\/api/, "");
 if (path.startsWith("/admin/editor/portfolio")) return "galleries";
 const section = path.split("/")[2];
 const features: Record<string, import("./features").Feature> = {
  editor: "editor", media: "editor", "draft-preview": "editor", "catalog-private-assets": "editor",
  galleries: "galleryDelivery", crm: "crm", board: "board", invoicing: "invoicing", invoices: "invoicing",
  quotes: "quotes", contracts: "contracts", emails: "emails", messages: "messages", orders: "orders", inquiries: "inquiries",
 };
 return features[section] ?? null;
}
