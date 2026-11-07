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
import { getAdminConfig, type AdminAPI, type AdminConfig, type CatalogProductEditorRevision } from "@jessepomeroy/admin";
import ClientDetailModal from "@jessepomeroy/admin/pages/crm/ClientDetailModal";
import InvoiceDetailModal from "@jessepomeroy/admin/pages/invoicing/InvoiceDetailModal";
import ContractDetailModal from "@jessepomeroy/admin/pages/contracts/ContractDetailModal";
import DocumentSendReceipts from "@jessepomeroy/admin/pages/DocumentSendReceipts";
import RecordPagination from "@jessepomeroy/admin/pages/RecordPagination";
import QuoteDetailModal from "@jessepomeroy/admin/pages/quotes/QuoteDetailModal";
import DocumentEmailRecoveryPanel from "@jessepomeroy/admin/pages/DocumentEmailRecoveryPanel";
import type { ComponentProps } from "svelte";
// @ts-expect-error Server configuration is available only from @jessepomeroy/admin/server.
import { getServerConfig as invalidRootServerImport } from "@jessepomeroy/admin";

const browserConfig: AdminConfig = getAdminConfig();
// These compatibility contracts must compile against the built public declarations.
const contactWithoutPublish: Pick<NonNullable<AdminAPI["siteEditor"]>, "publishContactPage"> = {};
const legacyPrintProjection: CatalogProductEditorRevision = {
	revisionId: "legacy-revision", schemaVersion: 2, productKind: "print", createdAt: 1,
	printSourceAssets: [{ relationKey: "source", asset: { assetId: "legacy-asset" } }],
};
void [browserConfig, invalidRootServerImport, contactWithoutPublish, legacyPrintProjection];

type ClientSave = ComponentProps<typeof ClientDetailModal>["onsave"];
const originalClientSave: (data: Parameters<ClientSave>[0]) => void = async () => {};
const legacyAsyncVoidSave = async () => {};
const legacyValueSave = () => "legacy-result";
const legacyAsyncValueSave = async () => "legacy-result";
const booleanSave = () => true;
const asyncBooleanSave = async () => false;
const compatibleOriginal: ClientSave = originalClientSave;
const compatibleAsyncVoid: ClientSave = legacyAsyncVoidSave;
const compatibleValue: ClientSave = legacyValueSave;
const compatibleAsyncValue: ClientSave = legacyAsyncValueSave;
const compatibleBoolean: ClientSave = booleanSave;
const compatibleAsyncBoolean: ClientSave = asyncBooleanSave;
void [compatibleOriginal, compatibleAsyncVoid, compatibleValue, compatibleAsyncValue, compatibleBoolean, compatibleAsyncBoolean];
const explicitClientClear: Parameters<ClientSave>[0] = {
	name: "Synthetic client", category: "web", status: "lead",
	clearFields: ["email", "phone", "type", "source", "notes", "siteUrl_client"],
};
void explicitClientClear;

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
	editor: {
		products: {
			privateAssetReplacementEnabled: true,
			privateAssetUpload: {
				prepareEndpoint: "/api/admin/catalog/private-upload/prepare",
				completeEndpoint: "/api/admin/catalog/private-upload/complete",
			},
		},
	},
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

// The emitted receipt component and rune helper must resolve together without casing conflicts.
type SendReceipt = NonNullable<ComponentProps<typeof InvoiceDetailModal>["externalEmailAction"]>;
const receipt: SendReceipt = { id: "synthetic-document", generation: 1, stage: "pending", message: "email request in progress.", opening: false, openError: "" };
const contractEmailAction: ComponentProps<typeof ContractDetailModal>["externalEmailAction"] = receipt;
const documentReceipts: ComponentProps<typeof DocumentSendReceipts>["items"] = [receipt];
const requestRecordPage: ComponentProps<typeof RecordPagination>["onrequest"] = () => {};
void [contractEmailAction, documentReceipts, requestRecordPage];

const optionalQuoteRecoveryChange: ComponentProps<typeof QuoteDetailModal>["onemailrecoverychange"] = undefined;
const optionalPanelRecoveryChange: ComponentProps<typeof DocumentEmailRecoveryPanel>["onrecoverychange"] = undefined;
void [optionalQuoteRecoveryChange, optionalPanelRecoveryChange];
