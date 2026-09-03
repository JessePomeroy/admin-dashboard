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
} from "./config";

// Convex client (honors AdminConfig.mutationTransport)
export { useAdminClient } from "./adminClient";

// Layout & Auth
export { default as AdminLayout } from "./components/AdminLayout.svelte";
export { default as AuthGuard } from "./components/AuthGuard.svelte";
export { default as LoginPage } from "./components/LoginPage.svelte";

// Components
export { default as AdminModal } from "./components/AdminModal.svelte";
export { default as NotificationWidget } from "./components/NotificationWidget.svelte";
export { default as EmailPreview } from "./components/EmailPreview.svelte";
export { default as DocumentEmailRecoveryPanel } from "./pages/DocumentEmailRecoveryPanel.svelte";
export { default as FeatureGate } from "./components/FeatureGate.svelte";
export { default as FilterBar } from "./components/FilterBar.svelte";
export { default as LoadingState } from "./components/LoadingState.svelte";
export { default as PageHeader } from "./components/PageHeader.svelte";
export { default as StatusDot } from "./components/StatusDot.svelte";
export { default as UpgradeBanner } from "./components/UpgradeBanner.svelte";
export { addToast } from "./toast";

// Page components
export { default as BoardPage } from "./pages/BoardPage.svelte";
export { default as ContractsPage } from "./pages/ContractsPage.svelte";
export { default as CrmPage } from "./pages/CrmPage.svelte";
export { default as DashboardPage } from "./pages/DashboardPage.svelte";
export { default as EmailsPage } from "./pages/EmailsPage.svelte";
export { default as GalleriesPage } from "./pages/GalleriesPage.svelte";
export { default as ClientGalleriesPage } from "./pages/gallery-delivery/GalleryDeliveryPage.svelte";
export { default as InquiriesPage } from "./pages/InquiriesPage.svelte";
export { default as InvoicingPage } from "./pages/InvoicingPage.svelte";
export { default as MessagesPage } from "./pages/MessagesPage.svelte";
export { default as OrdersPage } from "./pages/OrdersPage.svelte";
export { default as SiteSettingsPage } from "./pages/editor/SiteSettingsPage.svelte";
export { default as EditorPagesPage } from "./pages/editor/EditorPagesPage.svelte";
export { default as HomepageQuotePage } from "./pages/editor/HomepageQuotePage.svelte";
export { default as ContactPage } from "./pages/editor/ContactPage.svelte";
export { default as AboutPage } from "./pages/editor/AboutPage.svelte";
export { default as ModelingPage } from "./pages/editor/ModelingPage.svelte";
export { default as PortfolioGalleriesPage } from "./pages/editor/PortfolioGalleriesPage.svelte";
export { default as PortfolioGalleryPage } from "./pages/editor/PortfolioGalleryPage.svelte";
export { default as BlogPage } from "./pages/editor/BlogPage.svelte";
export { default as BlogPostPage } from "./pages/editor/BlogPostPage.svelte";
export { default as BlogSupportingPage } from "./pages/editor/BlogSupportingPage.svelte";
export { default as ProductsPage } from "./pages/editor/ProductsPage.svelte";
export { default as ProductPage } from "./pages/editor/ProductPage.svelte";
export { default as PlatformPage } from "./pages/PlatformPage.svelte";
export { default as QuotesPage } from "./pages/QuotesPage.svelte";

// Features & types
export * from "./adminSession";
export * from "./capabilities";
export * from "./features";
export * from "./galleryUploadPolicy";
export * from "./portfolioEditor";
export * from "./cmsMediaUpload";
export * from "./siteSettings";
export * from "./homepageQuote";
export * from "./contactPage";
export * from "./aboutPage";
export * from "./modelingPage";
export * from "./blogEditor";
export * from "./catalogProductEditor";
export type * from "./types";
export * from "./utils";
export * from "./documentEmailRecovery";

// Theme
export { isDark } from "./theme";
