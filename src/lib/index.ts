// Config
export {
	setAdminConfig,
	getAdminConfig,
	setServerConfig,
	getServerConfig,
	type AdminAPI,
	type AdminConfig,
	type AdminServerConfig,
	type AdminTheme,
	type AdminAuthClient,
	type AdminAuthSession,
	type SessionStoreValue,
	type NanostoreAtom,
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
export { default as InquiriesPage } from "./pages/InquiriesPage.svelte";
export { default as InvoicingPage } from "./pages/InvoicingPage.svelte";
export { default as MessagesPage } from "./pages/MessagesPage.svelte";
export { default as OrdersPage } from "./pages/OrdersPage.svelte";
export { default as PlatformPage } from "./pages/PlatformPage.svelte";
export { default as QuotesPage } from "./pages/QuotesPage.svelte";

// Features & types
export * from "./adminSession";
export * from "./capabilities";
export * from "./features";
export * from "./galleryUploadPolicy";
export type * from "./types";
export * from "./utils";

// Theme
export { isDark } from "./theme";

// Server utilities
export { sendEmail, getResend, replaceTemplateVariables } from "./server/email";
export { getConvex, getAuthenticatedConvex } from "./server/convexClient";
export { trimString, validateFilename } from "./server/validation";
export { createInvoiceSendHandler } from "./server/handlers/sendInvoice";
export type { EmailSendConfig } from "./server/handlers/createEmailSendHandler";
export { createContractSendHandler } from "./server/handlers/sendContract";
export { createQuoteSendHandler } from "./server/handlers/sendQuote";
export { createPortalTokenHandler } from "./server/handlers/createPortalToken";
export {
	createAdminMutationHandler,
	resolveConvexFunction,
	type AdminMutationProxyOptions,
} from "./server/adminMutationProxy";
export {
	cookiesFromRequest,
	parseRequestCookieHeader,
	type RequestCookieEntry,
} from "./server/adminHost";
export {
	createGalleryUploadSessionHandler,
	createGalleryPresignHandler,
	createGalleryUploadHandler,
	createGalleryProcessHandler,
	createGalleryDeleteHandler,
	createGalleryBulkDeleteHandler,
} from "./server/handlers/galleryPresign";
