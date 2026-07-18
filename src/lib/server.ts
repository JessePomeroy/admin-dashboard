export {
	setServerConfig,
	getServerConfig,
	type AdminAPI,
	type AdminServerConfig,
} from "./config.js";
export { sendEmail, getResend, replaceTemplateVariables } from "./server/email.js";
export { getConvex, getAuthenticatedConvex } from "./server/convexClient.js";
export { trimString, validateFilename } from "./server/validation.js";
export { createInvoiceSendHandler } from "./server/handlers/sendInvoice.js";
export type { EmailSendConfig } from "./server/handlers/createEmailSendHandler.js";
export { createContractSendHandler } from "./server/handlers/sendContract.js";
export { createQuoteSendHandler } from "./server/handlers/sendQuote.js";
export { createPortalTokenHandler } from "./server/handlers/createPortalToken.js";
export {
	createAdminMutationHandler,
	resolveConvexFunction,
	type AdminMutationProxyOptions,
} from "./server/adminMutationProxy.js";
export {
	createAdminAuthValidator,
	createAdminTokenHandler,
	type AdminAuthConvexClient,
	type AdminAuthIdentity,
	type AdminAuthTokenReader,
	type AdminAuthValidator,
	type AdminAuthValidatorOptions,
	type AdminTokenHandlerOptions,
} from "./server/adminAuth.js";
export {
	cookiesFromRequest,
	parseRequestCookieHeader,
	type RequestCookieEntry,
} from "./server/adminHost.js";
export {
	createGalleryUploadSessionHandler,
	createGalleryPresignHandler,
	createGalleryUploadHandler,
	createGalleryProcessHandler,
	createGalleryDeleteHandler,
	createGalleryBulkDeleteHandler,
	createGalleryImageHandler,
} from "./server/handlers/galleryPresign.js";
export {
	createCmsMediaCapabilityHandler,
	createCmsMediaProcessHandler,
} from "./server/handlers/cmsMedia.js";
export { createCmsMediaDeleteHandler } from "./server/handlers/cmsMediaDeletion.js";
