// Config
export {
	setAdminConfig,
	getAdminConfig,
	type AdminAPI,
	type AdminConfig,
	type AdminEditorConfig,
	type AdminTheme,
	type AdminAuthClient,
	type AdminAuthSession,
	type SessionStoreValue,
	type NanostoreAtom,
	type SiteSettingsDraftPayload,
	type SiteSettingsEditorState,
	type SiteSettingsRevisionState,
	type SiteSettingsSocialLink,
	type HomepageQuoteDraftPayload,
	type HomepageQuoteEditorState,
	type HomepageQuoteRevisionState,
	type ContactPageDraftPayload,
	type ContactPageEditorState,
	type ContactPageRevisionState,
	type AboutPortraitDraft,
	type AboutSectionDraft,
	type AboutHighlightDraft,
	type AboutPageDraftPayload,
	type AboutPageEditorState,
	type AboutPageRevisionState,
	type ModelingImageDraft,
	type ModelingGalleryDraft,
	type ModelingPageDraftPayload,
	type ModelingPageEditorState,
	type ModelingPageRevisionState,
} from "./config.js";

// Convex client (honors AdminConfig.mutationTransport)
export { useAdminClient } from "./adminClient.js";


export { addToast } from "./toast.js";


// Features & types
export * from "./adminSession.js";
export * from "./capabilities.js";
export * from "./features.js";
export * from "./galleryUploadPolicy.js";
export * from "./portfolioEditor.js";
export * from "./cmsMediaUpload.js";
export * from "./siteSettings.js";
export * from "./homepageQuote.js";
export * from "./contactPage.js";
export * from "./aboutPage.js";
export * from "./modelingPage.js";
export * from "./blogEditor.js";
export * from "./catalogProductEditor.js";
export type * from "./types.js";
export * from "./utils.js";
export * from "./documentEmailRecovery.js";

// Theme
export { isDark } from "./theme.js";
