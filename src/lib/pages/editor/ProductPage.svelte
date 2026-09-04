<script lang="ts">
import { onDestroy } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import {
	uploadCatalogProductArtwork,
	type CatalogProductArtworkCheckpoint,
	type CatalogProductArtworkStatus,
} from "../../catalogProductArtworkUpload";
import {
	completeCatalogPrivateEditorUpload,
	declareCatalogPrivateEditorUpload,
	newCatalogPrivateEditorUploadHandle,
	prepareCatalogPrivateEditorUpload,
	putCatalogPrivateEditorUpload,
} from "../../catalogPrivateEditorUpload";
import { getCatalogProductEditorCapability } from "../../catalogProductCapability";
import {
	addCatalogProductWebMedia,
	addCatalogProductGalleryMedia,
	alignCatalogProductWebMediaWithSetMembers,
	attachCatalogProductArtwork,
	catalogProductDraftFromRevision,
	catalogProductEditorDescription,
	catalogProductEditorSaleAvailability,
	catalogProductEditorTitle,
	catalogProductEditorVariantCount,
	catalogProductGraphDraftFromForm,
	catalogProductGraphDraftFromRevision,
	catalogProductKindLabel,
	canEditCatalogProductGraphKind,
	copyCatalogProductDraft,
	emptyCatalogProductDraft,
	formatCatalogFrameMultiplier,
	newCatalogPrivateRelationKey,
	newCatalogProductReplacementGraphDraft,
	parseCatalogFrameMultiplier,
	serializeCatalogProductDraft,
	slugifyCatalogProductTitle,
	type CatalogEditorPrivateAsset,
	type CatalogEditorPrivateAssetRelation,
	type CatalogProductDraftForm,
	type CatalogProductEditorState,
	type CatalogProductEditorRevision,
	type CatalogProductGraphV2Draft,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import {
	mergePortfolioMediaAssets,
	type PortfolioMediaAsset,
	type PortfolioMediaPage,
} from "../../portfolioEditor";
import "../../styles/editorial-page.css";
import CatalogProductMedia from "./CatalogProductMedia.svelte";
import CatalogProductSetMembers from "./CatalogProductSetMembers.svelte";
import CatalogProductVariants from "./CatalogProductVariants.svelte";
import EditorSegmentedChoice from "./EditorSegmentedChoice.svelte";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";
import ProductWorkbench from "./ProductWorkbench.svelte";
import { publicationCompletenessMessage } from "./publicationCompleteness";

let { productId }: { productId: string } = $props();
const config = getAdminConfig();
const capability = getCatalogProductEditorCapability(config);
if (!capability) {
	throw new Error("Single-print product editor is not configured for this host");
}
const {
	api: catalogApi,
	settings: productsConfig,
	media: mediaCapability,
	privateAssets: privateAssetCapability,
	publication: publicationCapability,
	publishesToShop,
} = capability;

const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();
const editorQuery = useQuery(catalogApi.getEditorState, () => ({ productId }));
let editorState = $derived(editorQuery.data as CatalogProductEditorState | undefined);
let editorError = $derived(editorQuery.error);
let form = $state<CatalogProductDraftForm>(emptyCatalogProductDraft());
let scopedProductId = $state<string | null>(null);
let initialized = $state(false);
let hasActiveDraft = $state(false);
let loadedServerRevisionId = $state<string | null>(null);
let loadedPublishedRevisionId = $state<string | null>(null);
let loadedUpdatedAt = $state<number | null>(null);
let baseRevisionId = $state<string | undefined>();
let graphSourceRevision = $state<CatalogProductEditorRevision | null>(null);
let locallyCommittedRevisionIds = $state<Array<string | null>>([]);
let savedJson = $state("");
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "discarding" | "error" | "conflict">("loading");
let saveError = $state("");
let multiplierInput = $state("1.00");
let multiplierError = $state("");
let variantsValid = $state(true);
let pickerOpen = $state(false);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let uploadedPrivateAssets = $state<CatalogEditorPrivateAsset[]>([]);
let mediaActionError = $state("");
let artworkUploadBusy = $state(false);
let artworkUploadController: AbortController | null = null;
let artworkUploadCheckpoints = new WeakMap<File, CatalogProductArtworkCheckpoint>();
let activePrivateAssetRelation = $state<CatalogEditorPrivateAssetRelation | null>(null);
type PrivateAssetAttachment = { kind: "paid-download" };
let privateAssetAttachment = $state<PrivateAssetAttachment | null>(null);
type PublicationSnapshot = {
	productId: string;
	draftRevisionId: string | null;
	publishedRevisionId: string | null;
	updatedAt: number;
	publishedAt: number | null;
};
type PublicationOperation = {
	requestId: number;
	action: "publish" | "unpublish";
	before: PublicationSnapshot;
	phase: "requesting" | "awaiting-echo" | "reconciling" | "reload-required";
	result: PublicationSnapshot | null;
};
let publicationOperation = $state<PublicationOperation | null>(null);
let publicationMessage = $state("");
let publicationError = $state("");
let publicationReconciliationTimer: ReturnType<typeof setTimeout> | undefined;
let nextPublicationRequestId = 0;
const PUBLICATION_RECONCILIATION_MS = 8_000;
const privateAssetUpload = privateAssetCapability?.upload ?? null;
type PrivateUploadPhase = "reading" | "preparing" | "uploading" | "completing" | "pending" | "verified";
type PrivateUploadOperation = {
	uploadHandle: string;
	snapshot: { draftRevisionId: string; relation: CatalogEditorPrivateAssetRelation };
	phase: PrivateUploadPhase;
	controller: AbortController | null;
	putIssued: boolean;
	stagedAsset: CatalogEditorPrivateAsset | null;
};
let selectedPrivateFile = $state<File | null>(null);
let privateFileInput = $state<HTMLInputElement | null>(null);
let privateZipVersion = $state("");
let privateUploadOperation = $state<PrivateUploadOperation | null>(null);
let privateUploadFallbackState = $state<"idle" | "error">("idle");
let privateUploadMessage = $state("");
let manualCheckReady = $state(false);
let automaticChecksRemaining = $state(0);
let automaticCheckDeadline = 0;
let completionCheckTimer: ReturnType<typeof setTimeout> | undefined;
const PRIVATE_UPLOAD_AUTO_CHECKS = 3;
const PRIVATE_UPLOAD_AUTO_INTERVAL_MS = 65_000;
const PRIVATE_UPLOAD_AUTO_WINDOW_MS = 305_000;
const usedPrivateUploadHandles = new Set<string>();
const mediaListQuery = mediaCapability
	? useQuery(mediaCapability.api.listForEditor, {
			siteUrl: config.siteUrl,
			paginationOpts: { numItems: 100, cursor: null },
		})
	: null;
let mediaPage = $derived(mediaListQuery?.data as PortfolioMediaPage | undefined);
let placedAssetIds = $derived([
	...new Set((form.webMedia ?? []).map((placement) => placement.assetId)),
]);
const placedMediaQuery = mediaCapability
	? useQuery(mediaCapability.api.getManyForEditor, () => ({
			siteUrl: config.siteUrl,
			ids: placedAssetIds,
		}))
	: null;
let placedAssets = $derived((placedMediaQuery?.data ?? []) as PortfolioMediaAsset[]);
let readyAssets = $derived(
	[...new Map(
		[
			...uploadedAssets,
			...((mediaPage?.page ?? []) as PortfolioMediaAsset[]),
			...placedAssets,
		]
			.map((asset) => [asset._id, asset]),
	).values()].filter((asset) => asset.status === "ready"),
);
let mediaById = $derived(mergePortfolioMediaAssets(
	[...((mediaPage?.page ?? []) as PortfolioMediaAsset[]), ...uploadedAssets],
	placedAssets,
));
let mediaQueryError = $derived(mediaListQuery?.error ?? placedMediaQuery?.error);
let selectedAssetIds = $derived.by(() => {
	const placements = form.webMedia ?? [];
	const canChooseMemberAssetForCover = form.productKind === "print_set"
		&& !placements.some((placement) => placement.role === "cover");
	return new Set(
		placements
			.filter((placement) => placement.role !== "social_share")
			.filter((placement) => !canChooseMemberAssetForCover || placements.some(
				(candidate) => candidate.assetId === placement.assetId
					&& candidate.role !== "set_member"
					&& candidate.role !== "social_share",
			))
			.map((placement) => placement.assetId),
	);
});
let currentJson = $derived(serializeCatalogProductDraft(form));
let isGraphV2 = $derived(editorState?.graphVersion === 2 || editorState?.draft?.schemaVersion === 2 || editorState?.published?.schemaVersion === 2);
let graphProductKindEditable = $derived(
	isGraphV2 && canEditCatalogProductGraphKind(editorState?.productKind),
);
let canEditGraphProduct = $derived(
	graphProductKindEditable && Boolean(editorState?.draft || graphSourceRevision),
);
let readOnlyRevision = $derived(editorState?.draft ?? editorState?.published ?? null);

let privateAssetRows = $derived.by(() => {
	if (form.productKind !== "digital_download" || !form.paidFile) return [];
	const revision = editorState?.draft;
	const privateAssetById = new Map<string, CatalogEditorPrivateAsset>([
		...(revision?.paidFileAsset
			? [[revision.paidFileAsset.asset.assetId, revision.paidFileAsset.asset] as const]
			: []),
		...uploadedPrivateAssets.map((asset) => [asset.assetId, asset] as const),
	]);
	return [{ asset: privateAssetById.get(form.paidFile.assetId) }];
});
let privateUploadState = $derived(privateUploadOperation?.phase ?? privateUploadFallbackState);
let usesSinglePrice = $derived(
	form.productKind === "postcard"
		|| form.productKind === "merchandise"
		|| form.productKind === "tapestry"
		|| form.productKind === "digital_download",
);
let effectiveSaleAvailability = $derived(
	usesSinglePrice
		? form.saleAvailability === "available" && form.variants[0]?.status === "enabled"
			? "available"
			: "unavailable"
		: form.saleAvailability,
);
let dirty = $derived(initialized && hasActiveDraft && currentJson !== savedJson);
let privateUploadBusy = $derived(["reading", "preparing", "uploading", "completing", "pending"].includes(privateUploadState));
let privateUploadBlocked = $derived(privateUploadOperation !== null);
let publicationRequestActive = $derived(publicationOperation !== null);
let editorLocked = $derived(
	privateUploadBusy || artworkUploadBusy || publicationRequestActive
		|| ["saving", "discarding", "conflict"].includes(saveState),
);
let publicationStatus = $derived.by(() => {
	const draftRevisionId = editorState?.draft?.revisionId ?? null;
	const publishedRevisionId = editorState?.published?.revisionId ?? null;
	if (!publishedRevisionId) return "unpublished";
	if (!draftRevisionId) return "published — no active draft";
	return draftRevisionId === publishedRevisionId
		? "published — current draft"
		: "published — newer draft available";
});
let publicationQueryStale = $derived(initialized && Boolean(editorState) && (
	editorState?.productId !== productId
		|| (editorState?.draft?.revisionId ?? null) !== (baseRevisionId ?? null)
		|| locallyCommittedRevisionIds.length > 0
		|| (editorState?.published?.revisionId ?? null) !== loadedPublishedRevisionId
		|| editorState?.updatedAt !== loadedUpdatedAt
));
let publicationActionsLocked = $derived(
	dirty || saveState !== "saved" || privateUploadBlocked || artworkUploadBusy
		|| publicationRequestActive || publicationQueryStale,
);
let draftFormValid = $derived(
	variantsValid && (!form.frameOptionsEnabled || !multiplierError),
);
let canPublish = $derived(Boolean(
	publicationCapability && editorState?.draft && draftFormValid && !publicationActionsLocked
		&& editorState.draft.revisionId !== editorState.published?.revisionId,
));
let canUnpublish = $derived(Boolean(
	publicationCapability && editorState?.published && !publicationActionsLocked,
));
let canSave = $derived(
	hasActiveDraft
		&& draftFormValid
		&& !editorLocked
		&& (dirty || saveState === "error"),
);

function syncLoadedPublication(state: CatalogProductEditorState) {
	loadedServerRevisionId = state.draft?.revisionId ?? null;
	loadedPublishedRevisionId = state.published?.revisionId ?? null;
	loadedUpdatedAt = state.updatedAt;
}

function syncMultiplierFromForm() {
	multiplierInput = formatCatalogFrameMultiplier(form.framePriceMultiplierBasisPoints);
	try {
		parseCatalogFrameMultiplier(multiplierInput);
		multiplierError = "";
	} catch (error) {
		multiplierError = error instanceof Error ? error.message : "Enter a valid multiplier.";
	}
}

function loadServerDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	form = catalogProductDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	syncMultiplierFromForm();
	saveState = "saved";
	saveError = "";
	variantsValid = true;
	initialized = true;
}

function loadServerGraphProductDraft(state: CatalogProductEditorState) {
	if (!state.draft) {
		throw new Error("The catalog graph editor requires an active draft.");
	}
	locallyCommittedRevisionIds = [];
	if (privateUploadOperation && state.draft?.revisionId !== privateUploadOperation.snapshot.draftRevisionId) {
		clearCompletionCheckTimer();
		privateUploadOperation = null;
		privateUploadFallbackState = "error";
		privateUploadMessage = "This product changed while the file was uploading. Reload before trying again.";
	}
	form = catalogProductGraphDraftFromRevision(state.draft);
	graphSourceRevision = state.draft;
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	syncMultiplierFromForm();
	saveState = "saved";
	saveError = "";
	variantsValid = true;
	initialized = true;
}

function loadServerGraphProductWithoutDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	graphSourceRevision = null;
	form = emptyCatalogProductDraft();
	hasActiveDraft = false;
	baseRevisionId = undefined;
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	syncMultiplierFromForm();
	saveState = "saved";
	saveError = "";
	variantsValid = true;
	initialized = true;
}

function graphRevisionFromDraft(
	draft: CatalogProductGraphV2Draft,
	revisionId: string,
	createdAt: number,
): CatalogProductEditorRevision {
	return {
		revisionId,
		schemaVersion: 2,
		productKind: draft.productKind,
		createdAt,
		draft,
	};
}

function publicationSnapshot(state: CatalogProductEditorState): PublicationSnapshot {
	return {
		productId: state.productId,
		draftRevisionId: state.draft?.revisionId ?? null,
		publishedRevisionId: state.published?.revisionId ?? null,
		updatedAt: state.updatedAt,
		publishedAt: state.publishedAt,
	};
}

function samePublicationSnapshot(left: PublicationSnapshot, right: PublicationSnapshot) {
	return left.productId === right.productId
		&& left.draftRevisionId === right.draftRevisionId
		&& left.publishedRevisionId === right.publishedRevisionId
		&& left.updatedAt === right.updatedAt
		&& left.publishedAt === right.publishedAt;
}

function matchesAmbiguousPublication(
	current: PublicationSnapshot,
	operation: PublicationOperation,
) {
	const publishedRevisionId = operation.action === "publish"
		? operation.before.draftRevisionId
		: null;
	return current.productId === operation.before.productId
		&& current.draftRevisionId === operation.before.draftRevisionId
		&& current.publishedRevisionId === publishedRevisionId
		&& current.updatedAt > operation.before.updatedAt
		&& (operation.action === "publish"
			? current.publishedAt === current.updatedAt
			: current.publishedAt === null);
}

function clearPublicationReconciliationTimer() {
	if (publicationReconciliationTimer) clearTimeout(publicationReconciliationTimer);
	publicationReconciliationTimer = undefined;
}

function resetProductScope() {
	artworkUploadController?.abort();
	artworkUploadController = null;
	artworkUploadBusy = false;
	artworkUploadCheckpoints = new WeakMap<File, CatalogProductArtworkCheckpoint>();
	privateUploadOperation?.controller?.abort();
	clearCompletionCheckTimer();
	clearPublicationReconciliationTimer();
	form = emptyCatalogProductDraft();
	initialized = false;
	hasActiveDraft = false;
	loadedServerRevisionId = null;
	loadedPublishedRevisionId = null;
	loadedUpdatedAt = null;
	baseRevisionId = undefined;
	graphSourceRevision = null;
	locallyCommittedRevisionIds = [];
	savedJson = "";
	saveState = "loading";
	saveError = "";
	syncMultiplierFromForm();
	variantsValid = true;
	pickerOpen = false;
	uploadedAssets = [];
	uploadedPrivateAssets = [];
	mediaActionError = "";
	activePrivateAssetRelation = null;
	privateAssetAttachment = null;
	publicationOperation = null;
	publicationMessage = "";
	publicationError = "";
	selectedPrivateFile = null;
	privateFileInput = null;
	privateZipVersion = "";
	privateUploadOperation = null;
	privateUploadFallbackState = "idle";
	privateUploadMessage = "";
	manualCheckReady = false;
	automaticChecksRemaining = 0;
	automaticCheckDeadline = 0;
}

function completePublication(operation: PublicationOperation, state: CatalogProductEditorState) {
	clearPublicationReconciliationTimer();
	syncLoadedPublication(state);
	publicationOperation = null;
	publicationError = "";
	publicationMessage = operation.action === "publish"
		? publishesToShop ? "Published to the Shop." : "Published in Convex CMS."
		: publishesToShop ? "Removed from the Shop." : "Unpublished from Convex CMS.";
}

function publicationConflict() {
	clearPublicationReconciliationTimer();
	publicationOperation = null;
	publicationMessage = "";
	publicationError = "Publication state changed unexpectedly. Reload this product before continuing.";
	saveState = "conflict";
}

function reconcilePublicationState(state: CatalogProductEditorState) {
	const operation = publicationOperation;
	if (!operation || operation.phase === "requesting") return;
	const current = publicationSnapshot(state);
	if (operation.result && samePublicationSnapshot(current, operation.result)) {
		completePublication(operation, state);
		return;
	}
	if (!operation.result && matchesAmbiguousPublication(current, operation)) {
		completePublication(operation, state);
		return;
	}
	if (!samePublicationSnapshot(current, operation.before)) publicationConflict();
}

$effect(() => {
	if (scopedProductId === null) {
		scopedProductId = productId;
		return;
	}
	if (productId === scopedProductId) return;
	scopedProductId = productId;
	resetProductScope();
});

$effect(() => {
	if (!editorState || editorState.productId !== productId) return;
	if (isGraphV2) {
		const serverRevisionId = editorState.draft?.revisionId ?? null;
		const serverPublishedRevisionId = editorState.published?.revisionId ?? null;
		if (!initialized) {
			if (graphProductKindEditable && editorState.draft) {
				return loadServerGraphProductDraft(editorState);
			}
			loadServerGraphProductWithoutDraft(editorState);
			return;
		}
		if (publicationOperation) {
			reconcilePublicationState(editorState);
			return;
		}
		if (!graphProductKindEditable) {
			syncLoadedPublication(editorState);
			if (saveState !== "conflict") saveState = "saved";
			return;
		}
		if (saveState === "conflict") return;
		if (["saving", "discarding"].includes(saveState)) return;
		if (
			serverRevisionId === loadedServerRevisionId
			&& serverPublishedRevisionId === loadedPublishedRevisionId
			&& editorState.updatedAt === loadedUpdatedAt
		) return;
		const localEchoIndex = locallyCommittedRevisionIds.indexOf(serverRevisionId);
		if (
			localEchoIndex >= 0
			&& serverPublishedRevisionId === loadedPublishedRevisionId
		) {
			const remainingCommittedRevisionIds = locallyCommittedRevisionIds.slice(
				localEchoIndex + 1,
			);
			syncLoadedPublication(editorState);
			if (remainingCommittedRevisionIds.length === 0) {
				baseRevisionId = serverRevisionId ?? undefined;
				graphSourceRevision = editorState.draft;
				hasActiveDraft = Boolean(editorState.draft);
			}
			locallyCommittedRevisionIds = remainingCommittedRevisionIds;
			return;
		}
		if (
			serverRevisionId === null
			&& graphSourceRevision
			&& locallyCommittedRevisionIds.includes(graphSourceRevision.revisionId)
		) return;
		if (dirty) {
			saveState = "conflict";
			saveError = "A newer server state arrived while this page had unsaved changes. Reload before continuing.";
			return;
		}
		if (!editorState.draft) {
			loadServerGraphProductWithoutDraft(editorState);
			return;
		}
		loadServerGraphProductDraft(editorState);
		return;
	}
	const serverRevisionId = editorState.draft?.revisionId ?? null;
	if (!initialized) return loadServerDraft(editorState);
	if (["saving", "discarding"].includes(saveState)) return;
	if (serverRevisionId === loadedServerRevisionId) return;
	const localEchoIndex = locallyCommittedRevisionIds.indexOf(serverRevisionId);
	if (localEchoIndex >= 0) {
		const remainingCommittedRevisionIds = locallyCommittedRevisionIds.slice(
			localEchoIndex + 1,
		);
		loadedServerRevisionId = serverRevisionId;
		if (remainingCommittedRevisionIds.length === 0) {
			baseRevisionId = serverRevisionId ?? undefined;
		}
		locallyCommittedRevisionIds = remainingCommittedRevisionIds;
		return;
	}
	if (dirty) {
		saveState = "conflict";
		saveError = "A newer server draft arrived while this page had unsaved changes. Reload before continuing.";
		return;
	}
	loadServerDraft(editorState);
});

$effect(() => {
	if (!initialized || !hasActiveDraft || editorLocked) return;
	saveState = dirty ? "dirty" : "saved";
});

function updateOptionalField(field: "title" | "slug" | "description", value: string) {
	form[field] = field === "slug"
		? slugifyCatalogProductTitle(value) || undefined
		: value || undefined;
}
function fillSlugIfEmpty() {
	if (!form.slug && form.title) form.slug = slugifyCatalogProductTitle(form.title) || undefined;
}
function updateSaleAvailability(value: string) {
	const saleAvailability = value as typeof form.saleAvailability;
	form.saleAvailability = saleAvailability;
	if (!usesSinglePrice) return;
	form.variants = form.variants.map((variant, index) => index === 0
		? { ...variant, status: saleAvailability === "available" ? "enabled" : "disabled" }
		: variant);
}
function updateMultiplier(value: string) {
	multiplierInput = value;
	try {
		form.framePriceMultiplierBasisPoints = parseCatalogFrameMultiplier(value);
		multiplierError = "";
	} catch (error) {
		multiplierError = error instanceof Error ? error.message : "Enter a valid multiplier.";
	}
}
function mutationError(error: unknown, fallback: string) {
	const message = error instanceof Error ? error.message : fallback;
	saveState = message.toLowerCase().includes("conflict") ? "conflict" : "error";
	return saveState === "conflict" ? `${message} Reload this product before continuing.` : message;
}

function rememberCommittedRevision(revisionId: string | null) {
	locallyCommittedRevisionIds = [...locallyCommittedRevisionIds, revisionId];
}

function exactPublicationResult(value: unknown, operation: PublicationOperation) {
	if (!value || typeof value !== "object") return null;
	const result = value as Record<string, unknown>;
	const expectedPublishedRevisionId = operation.action === "publish"
		? operation.before.draftRevisionId
		: null;
	if (
		result.productId !== operation.before.productId
		|| result.draftRevisionId !== operation.before.draftRevisionId
		|| result.publishedRevisionId !== expectedPublishedRevisionId
		|| typeof result.updatedAt !== "number"
		|| !Number.isSafeInteger(result.updatedAt)
		|| result.updatedAt <= operation.before.updatedAt
		|| (operation.action === "publish"
			? result.publishedAt !== result.updatedAt
			: result.publishedAt !== null)
	) return null;
	return result as PublicationSnapshot;
}

function schedulePublicationReconciliation(operation: PublicationOperation) {
	clearPublicationReconciliationTimer();
	publicationReconciliationTimer = setTimeout(() => {
		if (publicationOperation?.requestId !== operation.requestId) return;
		publicationOperation.phase = "reload-required";
		publicationMessage = "";
		publicationError = publishesToShop
			? "We could not confirm whether the Shop finished this action. Reload the product before trying again."
			: "The Convex CMS publication result could not be confirmed. Reload this product; do not submit the action again.";
	}, PUBLICATION_RECONCILIATION_MS);
}

async function runPublication(action: "publish" | "unpublish") {
	if (!publicationCapability || !editorState) return;
	if (action === "publish" ? !canPublish : !canUnpublish) return;
	if (action === "unpublish" && !globalThis.confirm(
		publishesToShop ? "Remove this product from your Shop?" : "Unpublish this product from Convex CMS?",
	)) return;
	const before = publicationSnapshot(editorState);
	const operation: PublicationOperation = {
		requestId: ++nextPublicationRequestId,
		action,
		before,
		phase: "requesting",
		result: null,
	};
	publicationOperation = operation;
	publicationError = "";
	publicationMessage = action === "publish"
		? publishesToShop ? "Publishing once to the Shop…" : "Publishing once to Convex CMS…"
		: publishesToShop ? "Removing once from the Shop…" : "Unpublishing once from Convex CMS…";
	const mutation = action === "publish"
		? publicationCapability.publishDraft
		: publicationCapability.unpublish;
	try {
		const value = await client.mutation(mutation, {
			productId: before.productId,
			expectedDraftRevisionId: before.draftRevisionId,
			expectedPublishedRevisionId: before.publishedRevisionId,
			expectedUpdatedAt: before.updatedAt,
		});
		if (publicationOperation?.requestId !== operation.requestId) return;
		const result = exactPublicationResult(value, operation);
		if (!result) return publicationConflict();
		publicationOperation.result = result;
		publicationOperation.phase = "awaiting-echo";
		publicationMessage = publishesToShop
			? "Confirming the exact Shop publication state…"
			: "Confirming the exact Convex CMS publication state…";
		schedulePublicationReconciliation(publicationOperation);
		reconcilePublicationState(editorState);
	} catch (error) {
		if (publicationOperation?.requestId !== operation.requestId) return;
		const message = error instanceof Error ? error.message : "";
		if (message.toLowerCase().includes("catalog publication conflict")) {
			publicationConflict();
			return;
		}
		const completenessMessage = action === "publish"
			? publicationCompletenessMessage(error, publishesToShop ? "Shop" : "Convex CMS")
			: null;
		if (completenessMessage) {
			clearPublicationReconciliationTimer();
			publicationOperation = null;
			publicationMessage = "";
			publicationError = completenessMessage;
			return;
		}
		publicationOperation.phase = "reconciling";
		publicationMessage = "The response was uncertain. Reconciling from the current Editor query without resubmitting…";
		schedulePublicationReconciliation(publicationOperation);
		reconcilePublicationState(editorState);
	}
}

function choosePrivateFile(file: File | null) {
	selectedPrivateFile = file;
	privateUploadMessage = "";
}

function chooseDigitalDownloadFile(file: File | null) {
	if (!file || form.productKind !== "digital_download") return choosePrivateFile(file);
	if (dirty || editorLocked || !baseRevisionId) {
		privateUploadFallbackState = "error";
		privateUploadMessage = "Save this draft before adding the download file.";
		return;
	}
	if (!privateAssetAttachment) beginSinglePrivateAssetAttachment();
	choosePrivateFile(file);
}

function dropDigitalDownloadFile(event: DragEvent) {
	event.preventDefault();
	if (privateUploadBlocked || dirty || editorLocked) return;
	chooseDigitalDownloadFile(event.dataTransfer?.files?.[0] ?? null);
}

function resetPrivateAssetFlow(message = "") {
	clearCompletionCheckTimer();
	privateUploadOperation?.controller?.abort();
	privateUploadOperation = null;
	privateUploadFallbackState = "idle";
	privateAssetAttachment = null;
	activePrivateAssetRelation = null;
	selectedPrivateFile = null;
	privateZipVersion = "";
	if (privateFileInput) privateFileInput.value = "";
	privateUploadMessage = message;
}

function beginPrivateAssetAttachment(
	attachment: PrivateAssetAttachment,
	relation: CatalogEditorPrivateAssetRelation,
) {
	if (editorLocked || dirty || !baseRevisionId) return;
	resetPrivateAssetFlow();
	privateAssetAttachment = attachment;
	activePrivateAssetRelation = relation;
}

function beginSinglePrivateAssetAttachment() {
	if (form.productKind === "digital_download") {
		beginPrivateAssetAttachment(
			{ kind: "paid-download" },
			{ kind: "paid_digital_file", relationKey: newCatalogPrivateRelationKey("download") },
		);
	}
}

function attachVerifiedPrivateAsset() {
	const operation = privateUploadOperation;
	const attachment = privateAssetAttachment;
	const relation = activePrivateAssetRelation;
	const asset = operation?.stagedAsset;
	if (
		!operation
		|| operation.phase !== "verified"
		|| !attachment
		|| !relation
		|| !asset
		|| attachment.kind !== "paid-download"
		|| relation.kind !== "paid_digital_file"
		|| asset.kind !== "paid_digital_file"
	) return;

	uploadedPrivateAssets = [
		asset,
		...uploadedPrivateAssets.filter((candidate) => candidate.assetId !== asset.assetId),
	];
	form.paidFile = {
		key: relation.relationKey,
		assetId: asset.assetId,
		...(asset.version ? { version: asset.version } : {}),
	};
	resetPrivateAssetFlow(`${asset.originalFilename} is attached to this draft. Save the draft to keep it.`);
}

function clearCompletionCheckTimer() {
	if (completionCheckTimer) clearTimeout(completionCheckTimer);
	completionCheckTimer = undefined;
	manualCheckReady = false;
}

function exposeManualCheck() {
	automaticChecksRemaining = 0;
	manualCheckReady = true;
	completionCheckTimer = undefined;
	privateUploadMessage = "Automatic verification checks are complete. Manual checking is available.";
}

function scheduleCompletionCheck(retryAfterMs: number) {
	clearCompletionCheckTimer();
	if (automaticCheckDeadline === 0) automaticCheckDeadline = Date.now() + PRIVATE_UPLOAD_AUTO_WINDOW_MS;
	const autoDelay = Math.max(retryAfterMs, PRIVATE_UPLOAD_AUTO_INTERVAL_MS);
	if (automaticChecksRemaining > 0 && Date.now() + autoDelay <= automaticCheckDeadline) {
		privateUploadMessage = "Verification is still pending. It will be checked automatically.";
		const automaticCheck = { uploadHandle: privateUploadOperation?.uploadHandle, deadline: automaticCheckDeadline };
		completionCheckTimer = setTimeout(() => {
			completionCheckTimer = undefined;
			if (!automaticCheck.uploadHandle || !operationStillActive(automaticCheck.uploadHandle)) return;
			if (Date.now() >= automaticCheck.deadline) return exposeManualCheck();
			automaticChecksRemaining -= 1;
			void reconcilePrivateUpload();
		}, autoDelay);
		return;
	}
	automaticChecksRemaining = 0;
	privateUploadMessage = "Automatic verification checks are complete. Check again when the action becomes available.";
	completionCheckTimer = setTimeout(exposeManualCheck, retryAfterMs);
}

function operationStillActive(uploadHandle: string) {
	return privateUploadOperation?.uploadHandle === uploadHandle;
}

function uploadSnapshotStillActive(operation: PrivateUploadOperation) {
	return baseRevisionId === operation.snapshot.draftRevisionId
		&& activePrivateAssetRelation?.kind === operation.snapshot.relation.kind
		&& activePrivateAssetRelation.relationKey === operation.snapshot.relation.relationKey
		&& !dirty;
}

async function reconcilePrivateUpload() {
	const operation = privateUploadOperation;
	if (!privateAssetUpload || !operation) return;
	operation.phase = "completing";
	privateUploadMessage = "Checking verified asset status…";
	let result: Awaited<ReturnType<typeof completeCatalogPrivateEditorUpload>>;
	try {
		result = await completeCatalogPrivateEditorUpload(
			privateAssetUpload.completeEndpoint,
			operation.uploadHandle,
			operation.controller?.signal,
		);
	} catch (error) {
		if (!operationStillActive(operation.uploadHandle) && operation.controller?.signal.aborted) return;
		throw error;
	}
	if (!operationStillActive(operation.uploadHandle)) return;
	if (result.status === "verified") {
		clearCompletionCheckTimer();
		if (!uploadSnapshotStillActive(operation) || result.asset.kind !== operation.snapshot.relation.kind) {
			privateUploadOperation = null;
			privateUploadFallbackState = "error";
			privateUploadMessage = "This product changed while the file was uploading. Reload before using it.";
			return;
		}
		operation.stagedAsset = result.asset;
		operation.phase = "verified";
		if (privateAssetAttachment) {
			attachVerifiedPrivateAsset();
			return;
		}
		privateUploadMessage = `${result.asset.originalFilename} is verified and ready to use.`;
		return;
	}
	if (result.status === "pending") {
		operation.phase = "pending";
		scheduleCompletionCheck(result.retryAfterMs);
		return;
	}
	clearCompletionCheckTimer();
	privateUploadOperation = null;
	privateUploadFallbackState = "error";
	privateUploadMessage = "The file could not be verified. Choose it again to retry.";
}

async function startPrivateUpload() {
	if (
		!privateAssetUpload
		|| !selectedPrivateFile
		|| !activePrivateAssetRelation
		|| !baseRevisionId
		|| dirty
		|| editorLocked
		|| privateUploadOperation
	) return;
	let file: File | null = selectedPrivateFile;
	const productKind = form.productKind;
	const uploadHandle = newCatalogPrivateEditorUploadHandle();
	if (usedPrivateUploadHandles.has(uploadHandle)) {
		privateUploadFallbackState = "error";
		privateUploadMessage = "A new upload could not be started. Try again.";
		return;
	}
	usedPrivateUploadHandles.add(uploadHandle);
	clearCompletionCheckTimer();
	const controller = new AbortController();
	const operation: PrivateUploadOperation = {
		uploadHandle,
		snapshot: {
			draftRevisionId: baseRevisionId,
			relation: { ...activePrivateAssetRelation },
		},
		phase: "reading",
		controller,
		putIssued: false,
		stagedAsset: null,
	};
	privateUploadOperation = operation;
	privateUploadFallbackState = "idle";
	privateUploadMessage = "Reading and hashing the selected file…";
	try {
		let declaration: Awaited<ReturnType<typeof declareCatalogPrivateEditorUpload>> | null = await declareCatalogPrivateEditorUpload(
			file,
			productKind,
			uploadHandle,
			privateZipVersion,
			controller.signal,
		);
		if (!operationStillActive(uploadHandle)) return;
		operation.phase = "preparing";
		privateUploadMessage = "Preparing the file…";
		let prepared: Awaited<ReturnType<typeof prepareCatalogPrivateEditorUpload>> | null = await prepareCatalogPrivateEditorUpload(
			privateAssetUpload.prepareEndpoint,
			declaration,
			controller.signal,
		);
		if (!operationStillActive(uploadHandle) || operation.putIssued) return;
		operation.putIssued = true;
		selectedPrivateFile = null;
		if (privateFileInput) privateFileInput.value = "";
		privateZipVersion = "";
		operation.phase = "uploading";
		privateUploadMessage = "Uploading and verifying the file…";
		try {
			await putCatalogPrivateEditorUpload(
				prepared,
				file,
				declaration.contentType,
				controller.signal,
			);
		} catch {
			if (controller.signal.aborted) {
				throw new DOMException("The operation was aborted", "AbortError");
			}
			// A lost or rejected PUT response is reconciled only through completion.
		}
		prepared = null;
		declaration = null;
		file = null;
		automaticChecksRemaining = PRIVATE_UPLOAD_AUTO_CHECKS;
		automaticCheckDeadline = 0;
		await reconcilePrivateUpload();
	} catch {
		if (!operationStillActive(uploadHandle)) return;
		privateUploadOperation = null;
		privateUploadFallbackState = "error";
		privateUploadMessage = "The file could not be prepared safely. Review it and try again.";
	}
}

function cancelPrivateUpload() {
	const operation = privateUploadOperation;
	if (!operation?.controller || !["reading", "preparing"].includes(operation.phase)) return;
	operation.controller.abort();
	privateUploadOperation = null;
	privateUploadFallbackState = "idle";
	selectedPrivateFile = null;
	if (privateFileInput) privateFileInput.value = "";
	privateUploadMessage = "Upload cancelled before transfer.";
}

onDestroy(() => {
	const controller = privateUploadOperation?.controller;
	const artworkController = artworkUploadController;
	clearCompletionCheckTimer();
	clearPublicationReconciliationTimer();
	privateUploadOperation = null;
	publicationOperation = null;
	controller?.abort();
	artworkController?.abort();
});

async function checkPrivateUploadAgain() {
	if (!manualCheckReady || privateUploadState !== "pending") return;
	manualCheckReady = false;
	await reconcilePrivateUpload();
}

async function saveDraft() {
	if (!canSave) return;
	if (!editorState) return;
	if (isGraphV2 && !graphSourceRevision) return;
	if (!isGraphV2 && !editorState.draft) return;
	saveState = "saving";
	saveError = "";
	try {
		const submittedForm = copyCatalogProductDraft(form);
		const submittedJson = serializeCatalogProductDraft(submittedForm);
		const draft = isGraphV2 && graphSourceRevision
			? catalogProductGraphDraftFromForm(graphSourceRevision, submittedForm)
			: submittedForm;
		const result = await client.mutation(catalogApi.saveDraft, {
			productId,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
			draft,
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
		if (isGraphV2 && graphSourceRevision && "schemaVersion" in draft && draft.schemaVersion === 2) {
			graphSourceRevision = graphRevisionFromDraft(
				draft,
				result.revisionId,
				graphSourceRevision.createdAt,
			);
		}
		rememberCommittedRevision(result.revisionId);
		savedJson = submittedJson;
		saveState = serializeCatalogProductDraft(form) === submittedJson ? "saved" : "dirty";
	} catch (error) {
		saveError = mutationError(error, "Could not save this product draft.");
	}
}
async function discardDraft() {
	if (!hasActiveDraft || !baseRevisionId) return;
	if (!globalThis.confirm(
		"Discard this draft? This clears its staged product details and any unsaved changes. The product identity remains, but this editor does not yet provide a restore action.",
	)) return;
	saveState = "discarding";
	saveError = "";
	try {
		await client.mutation(catalogApi.discardDraft, { productId, draftRevisionId: baseRevisionId });
		rememberCommittedRevision(null);
		hasActiveDraft = false;
		baseRevisionId = undefined;
		graphSourceRevision = null;
		form = emptyCatalogProductDraft();
		savedJson = serializeCatalogProductDraft(form);
		syncMultiplierFromForm();
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not discard this product draft.");
	}
}
async function startDraft() {
	if (editorLocked || !editorState) return;
	if (isGraphV2 && !graphProductKindEditable) return;
	let draft: CatalogProductDraftForm | CatalogProductGraphV2Draft;
	let nextForm: CatalogProductDraftForm;
	if (isGraphV2) {
		if (!canEditCatalogProductGraphKind(editorState.productKind)) return;
		const publishedDraft = editorState.published?.draft;
		draft = publishedDraft && publishedDraft.productKind === editorState.productKind
			? publishedDraft
			: newCatalogProductReplacementGraphDraft(editorState.productKind, {
				...(editorState.slug ? { slug: editorState.slug } : {}),
			});
		nextForm = catalogProductGraphDraftFromRevision(
			graphRevisionFromDraft(draft, "pending-replacement", Date.now()),
		);
	} else {
		draft = catalogProductDraftFromRevision(editorState.published);
		nextForm = draft;
	}
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(catalogApi.saveDraft, { productId, draft }) as { revisionId: string };
		form = nextForm;
		hasActiveDraft = true;
		baseRevisionId = result.revisionId;
		if (isGraphV2 && "schemaVersion" in draft && draft.schemaVersion === 2) {
			graphSourceRevision = graphRevisionFromDraft(
				draft,
				result.revisionId,
				Date.now(),
			);
		}
		rememberCommittedRevision(result.revisionId);
		savedJson = serializeCatalogProductDraft(nextForm);
		syncMultiplierFromForm();
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not start a new product draft.");
	}
}

function addMediaAsset(asset: PortfolioMediaAsset) {
	mediaActionError = "";
	try {
		const placements = form.webMedia ?? [];
		const reusesSetMemberAsCover = form.productKind === "print_set"
			&& !placements.some((placement) => placement.role === "cover")
			&& placements.some((placement) =>
				placement.role === "set_member" && placement.assetId === asset._id
			);
		form.webMedia = privateAssetUpload
			&& (form.productKind === "print" || form.productKind === "print_set")
			&& !reusesSetMemberAsCover
			? addCatalogProductGalleryMedia(placements, asset)
			: addCatalogProductWebMedia(placements, asset, form.productKind);
		pickerOpen = false;
		return true;
	} catch (error) {
		mediaActionError = error instanceof Error
			? error.message
			: "This image could not be attached to the product.";
		return false;
	}
}

function addUploadedMediaAsset(asset: PortfolioMediaAsset) {
	uploadedAssets = [asset, ...uploadedAssets.filter((item) => item._id !== asset._id)];
	return addMediaAsset(asset);
}

async function uploadProductArtwork(
	file: File,
	onStatus: (status: CatalogProductArtworkStatus) => void,
) {
	if (
		!privateAssetUpload
		|| !mediaCapability?.uploadEndpoint
		|| (form.productKind !== "print" && form.productKind !== "print_set")
		|| !baseRevisionId
		|| artworkUploadBusy
	) throw new Error("This artwork upload is not available right now.");
	const operationProductId = productId;
	const operationRevisionId = baseRevisionId;
	const operationFormJson = serializeCatalogProductDraft(form);
	const operationKind = form.productKind;
	const controller = new AbortController();
	artworkUploadController = controller;
	artworkUploadBusy = true;
	mediaActionError = "";
	try {
		const result = await uploadCatalogProductArtwork(file, {
			productKind: operationKind,
			privatePrepareEndpoint: privateAssetUpload.prepareEndpoint,
			privateCompleteEndpoint: privateAssetUpload.completeEndpoint,
			mediaEndpoint: mediaCapability.uploadEndpoint,
			signal: controller.signal,
			checkpoint: artworkUploadCheckpoints.get(file),
			onCheckpoint: (checkpoint) => artworkUploadCheckpoints.set(file, checkpoint),
			onCheckpointInvalidated: (checkpoint) => {
				if (artworkUploadCheckpoints.get(file) === checkpoint) {
					artworkUploadCheckpoints.delete(file);
				}
			},
			onStatus,
		});
		if (
			artworkUploadController !== controller
			|| saveState === "conflict"
			|| productId !== operationProductId
			|| baseRevisionId !== operationRevisionId
			|| serializeCatalogProductDraft(form) !== operationFormJson
		) throw new Error("This product changed while the image was uploading. Reload it and try again.");
		form = attachCatalogProductArtwork(form, result.displayAsset, result.privateAsset);
		uploadedAssets = [
			result.displayAsset,
			...uploadedAssets.filter((asset) => asset._id !== result.displayAsset._id),
		];
		uploadedPrivateAssets = [
			result.privateAsset,
			...uploadedPrivateAssets.filter((asset) => asset.assetId !== result.privateAsset.assetId),
		];
		artworkUploadCheckpoints.delete(file);
	} finally {
		if (artworkUploadController === controller) {
			artworkUploadController = null;
			artworkUploadBusy = false;
		}
	}
}

function removeSetMember(member: CatalogProductDraftForm["setMembers"][number]) {
	if (editorLocked) return;
	form.setMembers = form.setMembers.filter((candidate) => candidate.key !== member.key);
	form.printSources = (form.printSources ?? [])
		.filter((source) => source.key !== member.printSourceKey)
		.map((source, order) => ({ ...source, order }));
	form.webMedia = (form.webMedia ?? []).filter(
		(placement) => placement.key !== member.mediaPlacementKey,
	);
	form.webMedia = alignCatalogProductWebMediaWithSetMembers(
		form.webMedia,
		form.setMembers,
	);
}
</script>

<svelte:head><title>Product — {config.siteName}</title></svelte:head>
{#key productId}
<ProductWorkbench selectedProductId={productId}>
{#if editorError}
	<p class="alert page-alert" role="alert">Could not load this product draft. Refresh this page to try again.</p>
{:else if editorState === undefined || editorState.productId !== productId}
	<p class="loading" role="status">Loading product draft…</p>
{:else}
		<div class="settings-page product-page">
		<header class="settings-header">
			<div><a class="back" href={baseHref}>← products</a><h1>{canEditGraphProduct || !isGraphV2 ? form.title?.trim() || editorState.productKey : catalogProductEditorTitle(readOnlyRevision)?.trim() || editorState.productKey}</h1></div>
			{#if hasActiveDraft && (!isGraphV2 || canEditGraphProduct)}<div class="actions"><span class="sr-only save-state" aria-live="polite">{saveState}</span>{#if dirty || saveState === "saving" || saveState === "error"}<button type="button" class="primary" onclick={() => void saveDraft()} disabled={!canSave}>{saveState === "saving" ? "saving…" : saveState === "error" ? "try save again" : "save draft"}</button>{:else if canPublish}<button type="button" class="primary" onclick={() => void runPublication("publish")}>{editorState.published ? "publish changes" : publishesToShop ? "publish to Shop" : "publish to Convex CMS"}</button>{/if}</div>{/if}
		</header>
		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}
		{#if publicationError}<div class="alert publication-alert" role="alert"><span>{publicationError}</span>{#if publicationOperation?.phase === "reload-required"}<button type="button" onclick={() => globalThis.location.reload()}>reload product</button>{/if}</div>{/if}
		{#if mediaActionError}<p class="alert" role="alert">{mediaActionError}</p>{/if}
		{#if mediaQueryError}<p class="alert" role="alert">Could not load product images. Refresh this page to try again.</p>{/if}
		{#if publicationCapability && isGraphV2}<span class="sr-only publication-status" role="status" aria-live="polite">{publicationStatus}</span>{/if}
		{#if publicationMessage}<p class="publication-message" role="status" aria-live="polite">{publicationMessage}</p>{/if}
		{#if isGraphV2 && !graphProductKindEditable}
			<section aria-labelledby="product-readback-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-readback-heading">imported catalog draft</h2><p>{publicationCapability ? "This product is stored in the Convex CMS catalog graph." : "This product is stored in the new graph model as an unpublished draft."}</p></div></div>
				<dl class="readback-grid">
					<div><dt>kind</dt><dd>{catalogProductKindLabel(editorState.productKind)}</dd></div>
					<div><dt>URL name</dt><dd>{editorState.slug ? `/${editorState.slug}` : "not set"}</dd></div>
					<div><dt>availability</dt><dd>{catalogProductEditorSaleAvailability(readOnlyRevision) ?? "not set"}</dd></div>
					<div><dt>variants</dt><dd>{catalogProductEditorVariantCount(readOnlyRevision)}</dd></div>
					<div><dt>web images</dt><dd>{readOnlyRevision?.webMediaAssets?.length ?? 0}</dd></div>
				</dl>
				{#if catalogProductEditorDescription(readOnlyRevision)}
					<p class="readback-description">{catalogProductEditorDescription(readOnlyRevision)}</p>
				{/if}
				{#if canUnpublish}<div class="shop-publication" aria-label={publishesToShop ? "Shop actions" : "Convex CMS actions"}><button type="button" class="danger quiet-action" onclick={() => void runPublication("unpublish")}>{publishesToShop ? "remove from Shop" : "unpublish from Convex CMS"}</button></div>{/if}
			</section>
		{:else if !hasActiveDraft}
			<section aria-labelledby="discarded-product-heading">
				<div class="section-heading"><span>01</span><div><h2 id="discarded-product-heading">no active draft</h2><p>This product identity remains in the catalog, but its editable draft was discarded. No product details are currently staged.</p></div></div>
				<button type="button" onclick={() => void startDraft()} disabled={editorLocked}>{saveState === "saving" ? "starting…" : "start a new draft"}</button>
				{#if canUnpublish}<div class="shop-publication" aria-label={publishesToShop ? "Shop actions" : "Convex CMS actions"}><button type="button" class="danger quiet-action" onclick={() => void runPublication("unpublish")}>{publishesToShop ? "remove from Shop" : "unpublish from Convex CMS"}</button></div>{/if}
			</section>
		{:else}
			{#if isGraphV2 && mediaCapability}
				<CatalogProductMedia
					placements={form.webMedia ?? []}
					productKind={form.productKind}
					members={form.setMembers}
					{mediaById}
					mediaBaseUrl={mediaCapability.mediaBaseUrl}
					uploadEndpoint={mediaCapability.uploadEndpoint}
					disabled={editorLocked}
					onChange={(placements) => { form.webMedia = placements; mediaActionError = ""; }}
					onChooseMedia={() => { pickerOpen = true; mediaActionError = ""; }}
					onUploadReady={addUploadedMediaAsset}
					onUploadArtwork={privateAssetUpload && mediaCapability.uploadEndpoint
						? uploadProductArtwork
						: undefined}
				/>
			{/if}
			<section aria-labelledby="product-identity-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-identity-heading">product details</h2><p>The working name, URL name, and description stored with this draft.</p></div></div>
				<div class="fields two-column">
					<label>product name<input maxlength="160" value={form.title ?? ""} oninput={(event) => updateOptionalField("title", event.currentTarget.value)} onblur={fillSlugIfEmpty} disabled={editorLocked} /></label>
					<label>URL name<input maxlength="96" value={form.slug ?? ""} oninput={(event) => updateOptionalField("slug", event.currentTarget.value)} spellcheck="false" disabled={editorLocked} /><small>Lowercase words separated by hyphens.</small></label>
					<label class="wide">description<textarea rows="5" maxlength="5000" value={form.description ?? ""} oninput={(event) => updateOptionalField("description", event.currentTarget.value)} disabled={editorLocked}></textarea></label>
				</div>
			</section>
			<section aria-labelledby="sale-settings-heading">
				<div class="section-heading"><span>02</span><div><h2 id="sale-settings-heading">{usesSinglePrice ? "price and availability" : "sale settings"}</h2>{#if !usesSinglePrice}<p>Choose how the {catalogProductKindLabel(form.productKind)} is fulfilled and whether customers may currently order it.</p>{/if}</div></div>
				<div class="sale-control-grid">
					{#if form.productKind === "print" || form.productKind === "print_set"}
						<EditorSegmentedChoice id="catalog-fulfillment" label="fulfillment" value={form.fulfillmentMode} options={[{ value: "production_partner", label: "production partner" }, { value: "merchant_fulfilled", label: "handled by studio" }]} disabled={editorLocked} onChange={(value) => form.fulfillmentMode = value as typeof form.fulfillmentMode} />
					{:else}
						<CatalogProductVariants variants={form.variants} productKind={form.productKind} resetScope={`${productId}:${baseRevisionId ?? "no-draft"}`} productLabel={catalogProductKindLabel(form.productKind)} fixedPrice setMemberCount={form.setMembers.length} frameMarkupMultiplier={form.frameOptionsEnabled && !multiplierError ? form.framePriceMultiplierBasisPoints / 10_000 : undefined} marginCalculator={productsConfig.marginCalculator} variantOptionResolver={productsConfig.variantOptionResolver} onChange={(variants) => { form.variants = variants; }} onValidityChange={(valid) => { variantsValid = valid; }} disabled={editorLocked} />
					{/if}
					<EditorSegmentedChoice id="catalog-sale-availability" label="sale availability" value={effectiveSaleAvailability} options={[{ value: "available", label: "available" }, { value: "unavailable", label: "not for sale" }]} disabled={editorLocked} onChange={updateSaleAvailability} />
					{#if form.productKind === "print" || form.productKind === "print_set"}
						<EditorSegmentedChoice id="catalog-border-options" label="border options" value={form.borderOptionsEnabled ? "on" : "off"} options={[{ value: "off", label: "no borders" }, { value: "on", label: "offer borders" }]} disabled={editorLocked} onChange={(value) => form.borderOptionsEnabled = value === "on"} />
						<EditorSegmentedChoice id="catalog-frame-options" label="frame options" value={form.frameOptionsEnabled ? "on" : "off"} options={[{ value: "off", label: "no frames" }, { value: "on", label: "offer frames" }]} disabled={editorLocked} onChange={(value) => form.frameOptionsEnabled = value === "on"} />
					{/if}
				</div>
				{#if form.productKind === "print" || form.productKind === "print_set"}
					{#if form.frameOptionsEnabled}<label class="multiplier">frame price multiplier<span class="multiplier-input"><input id="catalog-frame-price-multiplier" inputmode="decimal" value={multiplierInput} oninput={(event) => updateMultiplier(event.currentTarget.value)} aria-invalid={Boolean(multiplierError)} aria-describedby={`catalog-frame-multiplier-hint${multiplierError ? " catalog-frame-multiplier-error" : ""}`} disabled={editorLocked} /><span aria-hidden="true">×</span></span><small id="catalog-frame-multiplier-hint">Applied to the frame cost in the profit estimate.</small>{#if multiplierError}<small id="catalog-frame-multiplier-error" class="field-error" role="alert">{multiplierError}</small>{/if}</label>{/if}
				{/if}
				{#if publicationCapability && isGraphV2}
					<div class="shop-publication" aria-label={publishesToShop ? "Shop actions" : "Convex CMS actions"}>
						{#if canUnpublish}<button type="button" class="danger quiet-action" onclick={() => void runPublication("unpublish")}>{publishesToShop ? "remove from Shop" : "unpublish from Convex CMS"}</button>{/if}
					</div>
				{/if}
			</section>
			{#if !usesSinglePrice}
				{#key productId}
					<CatalogProductVariants variants={form.variants} productKind={form.productKind} resetScope={`${productId}:${baseRevisionId ?? "no-draft"}`} productLabel={catalogProductKindLabel(form.productKind)} setMemberCount={form.setMembers.length} frameMarkupMultiplier={form.frameOptionsEnabled && !multiplierError ? form.framePriceMultiplierBasisPoints / 10_000 : undefined} marginCalculator={productsConfig.marginCalculator} variantOptionResolver={productsConfig.variantOptionResolver} onChange={(variants) => { form.variants = variants; }} onValidityChange={(valid) => { variantsValid = valid; }} disabled={editorLocked} />
				{/key}
			{/if}
			{#if form.productKind === "print_set"}
				<CatalogProductSetMembers members={form.setMembers} onChange={(members) => {
					form.setMembers = members;
					form.webMedia = alignCatalogProductWebMediaWithSetMembers(
						form.webMedia ?? [],
						members,
					);
				}} onRemove={removeSetMember} disabled={editorLocked} />
			{/if}
			{#if form.productKind === "digital_download"}
				<section class="download-file" aria-labelledby="catalog-download-file-heading">
					<div class="section-heading"><span>03</span><div><h2 id="catalog-download-file-heading">customer download</h2></div></div>
					{#if privateAssetCapability && privateAssetUpload}
						<label class="private-file-dropzone" class:disabled={privateUploadBlocked || dirty || editorLocked} aria-disabled={privateUploadBlocked || dirty || editorLocked} ondragover={(event) => event.preventDefault()} ondrop={dropDigitalDownloadFile}>
							<strong>{selectedPrivateFile?.name ?? "drop a ZIP here or click to choose"}</strong>
							<small>ZIP · 16 MB max</small>
							<input bind:this={privateFileInput} aria-label="choose customer download ZIP" type="file" accept="application/zip,application/x-zip-compressed,.zip" onchange={(event) => chooseDigitalDownloadFile(event.currentTarget.files?.[0] ?? null)} disabled={privateUploadBlocked || dirty || editorLocked} />
						</label>
						{#if privateAssetAttachment}
							<label>version (optional)<input maxlength="64" value={privateZipVersion} oninput={(event) => (privateZipVersion = event.currentTarget.value)} disabled={privateUploadBlocked || dirty || editorLocked} /></label>
							<div class="private-upload-actions">
								<button type="button" onclick={() => void startPrivateUpload()} disabled={!selectedPrivateFile || privateUploadBlocked || dirty || editorLocked}>upload file</button>
								{#if privateUploadState === "reading" || privateUploadState === "preparing"}<button type="button" class="secondary" onclick={cancelPrivateUpload}>cancel</button>{/if}
								{#if privateUploadState === "pending" && automaticChecksRemaining === 0}<button type="button" class="secondary" onclick={() => void checkPrivateUploadAgain()} disabled={!manualCheckReady}>check again</button>{/if}
							</div>
						{/if}
						{#if privateUploadMessage}<p class:upload-error={privateUploadState === "error"} role={privateUploadState === "error" ? "alert" : "status"}>{privateUploadMessage}</p>{/if}
					{/if}
					{#if privateAssetRows[0]?.asset && !privateAssetAttachment}<p class="download-ready">{privateAssetRows[0].asset.originalFilename}</p>{/if}
				</section>
			{/if}
			{#if !isGraphV2}
				<section aria-labelledby="product-draft-actions-heading">
					<div class="section-heading"><span>04</span><div><h2 id="product-draft-actions-heading">draft actions</h2><p>Discard the current draft and return to the published product.</p></div></div>
					<button type="button" class="danger" onclick={() => void discardDraft()} disabled={saveState === "saving" || saveState === "discarding"}>{saveState === "discarding" ? "discarding…" : "discard draft"}</button>
				</section>
			{/if}
		{/if}
	</div>
{/if}
</ProductWorkbench>

{#if pickerOpen && mediaCapability}
	<PortfolioMediaPicker
			assets={readyAssets}
			{selectedAssetIds}
			mediaBaseUrl={mediaCapability.mediaBaseUrl}
			hasMore={mediaPage ? !mediaPage.isDone : false}
			onChoose={addMediaAsset}
			onClose={() => (pickerOpen = false)}
	/>
{/if}
{/key}
<style>
	.loading, .page-alert { margin: 48px 40px; } .loading { color: var(--admin-text-muted); } .product-page { max-width: 1040px; }
	.back { display: inline-block; margin-bottom: 14px; color: var(--admin-text-muted); text-decoration: none; }
	.sale-control-grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 18px 20px; }
	.multiplier { max-width: 360px; margin-top: 20px; }
	.multiplier-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border: 1px solid var(--admin-border-strong); border-radius: 4px; background: var(--editor-control); }
	.multiplier-input input { border: 0; background: transparent; }
	.multiplier-input input:focus { outline: 0; }
	.multiplier-input > span { padding-right: 11px; color: var(--admin-text-muted); }
	.multiplier-input:focus-within { outline: 2px solid var(--admin-accent-strong); outline-offset: 2px; }
	.publication-message { margin: 0; color: var(--admin-text-muted); font-size: .78rem; line-height: 1.5; text-align: right; }
	.shop-publication { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
	.quiet-action { border-color: transparent; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
	.publication-alert { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
	.readback-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; margin: 0; border-block: 1px solid var(--admin-border); }
	.readback-grid div { min-width: 0; padding: 14px; border-left: 1px solid var(--admin-border); }
	.readback-grid div:first-child { border-left: 0; }
	.readback-grid dt { margin: 0 0 6px; color: var(--admin-text-muted); font-size: .68rem; text-transform: lowercase; letter-spacing: .08em; }
	.readback-grid dd { margin: 0; color: var(--admin-heading); font-size: .95rem; }
	.readback-description { margin: 18px 0 0; color: var(--admin-text-muted); line-height: 1.6; }
	.private-file-dropzone { display: grid; place-items: center; min-width: 0 !important; min-height: 112px; box-sizing: border-box; gap: 7px; padding: 18px; border: 1px dashed var(--admin-border-strong); border-radius: 8px; background: var(--admin-bg); color: var(--admin-text-muted); text-align: center; cursor: pointer; }
	.private-file-dropzone strong { max-width: 100%; overflow: hidden; color: var(--admin-heading); font-size: .78rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
	.private-file-dropzone small { color: var(--admin-text-muted); font-size: .7rem; }
	.private-file-dropzone input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
	.private-file-dropzone:focus-within { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.private-file-dropzone.disabled { opacity: .62; cursor: default; }
	.private-upload-actions { display: flex; gap: 8px; align-items: end; margin-top: 12px; }
	.private-upload-actions button { white-space: nowrap; }
	.download-ready { margin: 12px 0 0; color: var(--admin-text-muted); font-size: .72rem; overflow-wrap: anywhere; }
	.upload-error { color: var(--admin-danger, var(--status-rose)); }
	.danger { border-color: color-mix(in srgb, var(--admin-danger, var(--status-rose)) 55%, transparent) !important; color: var(--admin-danger, var(--status-rose)) !important; }
	@media (max-width: 720px) { .sale-control-grid { grid-template-columns: 1fr; } .private-upload-actions { align-items: stretch; flex-direction: column; } }
</style>
