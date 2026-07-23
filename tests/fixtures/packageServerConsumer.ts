import {
	createCatalogPrivateEditorUploadCompleteHandler,
	createCatalogPrivateEditorUploadPrepareHandler,
	setServerConfig,
	type AdminServerConfig,
	type CatalogPrivateEditorUploadAsset,
	type CatalogPrivateEditorUploadCompleteRequest,
	type CatalogPrivateEditorUploadCompleteResponse,
	type CatalogPrivateEditorUploadConfig,
	type CatalogPrivateEditorUploadDigitalAsset,
	type CatalogPrivateEditorUploadDigitalPrepareRequest,
	type CatalogPrivateEditorUploadPendingResponse,
	type CatalogPrivateEditorUploadPrepareRequest,
	type CatalogPrivateEditorUploadPrepareResponse,
	type CatalogPrivateEditorUploadPrintAsset,
	type CatalogPrivateEditorUploadPrintPrepareRequest,
	type CatalogPrivateEditorUploadVerifiedResponse,
} from "@jessepomeroy/admin/server";

const uploadConfig: CatalogPrivateEditorUploadConfig = {
	convexJournalOrigin: "https://example.convex.site",
	hostJournalSecret: "host-journal-secret-0123456789abcdef",
	workerOrigin: "https://cms-media-worker.thinkingofview.workers.dev",
	storageCallerSecret: "storage-caller-secret-0123456789abcdef",
	browserOrigin: "https://www.angelsrest.online",
};

const serverConfig: AdminServerConfig = {
	siteUrl: "angelsrest.online",
	siteName: "angel's rest",
	fromEmail: "admin@angelsrest.online",
	isCreator: true,
	api: {} as AdminServerConfig["api"],
	convexUrl: "https://example.convex.cloud",
	resendApiKey: "",
	catalogPrivateEditorUpload: uploadConfig,
	verifyAdmin: async () => true,
};
setServerConfig(serverConfig);

const printRequest: CatalogPrivateEditorUploadPrintPrepareRequest = {
	uploadHandle: "123e4567-e89b-42d3-a456-426614174000",
	productKind: "print",
	originalFilename: "source.jpg",
	contentType: "image/jpeg",
	sizeBytes: 4,
	sha256: "a".repeat(64),
	widthPixels: 1,
	heightPixels: 1,
};
const digitalRequest: CatalogPrivateEditorUploadDigitalPrepareRequest = {
	uploadHandle: "123e4567-e89b-42d3-a456-426614174001",
	productKind: "digital_download",
	originalFilename: "source.zip",
	contentType: "application/zip",
	sizeBytes: 4,
	sha256: "b".repeat(64),
};
const prepareRequests: CatalogPrivateEditorUploadPrepareRequest[] = [printRequest, digitalRequest];
const prepareResponse: CatalogPrivateEditorUploadPrepareResponse = {
	status: "upload_required",
	uploadHandle: printRequest.uploadHandle,
	uploadUrl: "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source",
	uploadToken: "opaque",
	uploadExpiresAt: "2026-01-01T00:00:00.000Z",
};
const completeRequest: CatalogPrivateEditorUploadCompleteRequest = {
	uploadHandle: printRequest.uploadHandle,
};
const printAsset: CatalogPrivateEditorUploadPrintAsset = {
	kind: "print_source",
	assetId: "print-asset",
	status: "verified",
	originalFilename: "source.jpg",
	mimeType: "image/jpeg",
	sizeBytes: 4,
	widthPixels: 1,
	heightPixels: 1,
	createdAt: 1,
};
const digitalAsset: CatalogPrivateEditorUploadDigitalAsset = {
	kind: "paid_digital_file",
	assetId: "digital-asset",
	status: "verified",
	originalFilename: "source.zip",
	mimeType: "application/zip",
	sizeBytes: 4,
	createdAt: 1,
};
const assets: CatalogPrivateEditorUploadAsset[] = [printAsset, digitalAsset];
const verified: CatalogPrivateEditorUploadVerifiedResponse = {
	status: "verified",
	asset: printAsset,
};
const pending: CatalogPrivateEditorUploadPendingResponse = { status: "storage_pending" };
const completeResponses: CatalogPrivateEditorUploadCompleteResponse[] = [verified, pending];
const prepareHandler = createCatalogPrivateEditorUploadPrepareHandler();
const completeHandler = createCatalogPrivateEditorUploadCompleteHandler();

void [
	prepareRequests,
	prepareResponse,
	completeRequest,
	assets,
	completeResponses,
	prepareHandler,
	completeHandler,
];
