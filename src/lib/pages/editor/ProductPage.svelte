<script lang="ts">
import { onDestroy } from "svelte";
import { useQuery } from "convex-svelte";
import { createEditorMedia } from "../../editorMedia.svelte";
import { useAdminClient } from "../../adminClient";
import type { CatalogProductArtworkStatus } from "../../catalogProductArtworkUpload";
import { createCatalogProductUploadSession } from "../../catalogProductUploadSession.svelte";
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
	type CatalogProductDraftForm,
	type CatalogProductEditorState,
	type CatalogProductEditorRevision,
	type CatalogProductGraphV2Draft,
} from "../../catalogProductEditor";
import { getAdminConfig } from "../../config";
import type { PortfolioMediaAsset } from "../../portfolioEditor";
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
let activeDraftOperation: object | null = null;
let multiplierInput = $state("1.00");
let multiplierError = $state("");
let variantsValid = $state(true);
let pickerOpen = $state(false);
let uploadedPrivateAssets = $state<CatalogEditorPrivateAsset[]>([]);
let mediaActionError = $state("");
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
const uploads = createCatalogProductUploadSession({
	upload: privateAssetUpload,
	currentDraft: currentUploadDraft,
});
function currentUploadDraft() {
	return baseRevisionId && saveState !== "conflict"
		? { productId, draftRevisionId: baseRevisionId, draftJson: serializeCatalogProductDraft(form) }
		: null;
}
const media = createEditorMedia({
	siteUrl: config.siteUrl,
	list: mediaCapability?.api.listForEditor,
	placed: mediaCapability?.api.getManyForEditor,
	references: () => (form.webMedia ?? []).map(placement => placement.assetId),
	pickerIncludesAttachments: true,
});
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
let publicationRequestActive = $derived(publicationOperation !== null);
let editorLocked = $derived(
	uploads.downloadBusy || uploads.artworkBusy || publicationRequestActive
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
	dirty || saveState !== "saved" || uploads.downloadBusy || uploads.artworkBusy
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

function finishLoadingServerDraft(state: CatalogProductEditorState) {
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	syncMultiplierFromForm();
	saveState = "saved";
	saveError = "";
	variantsValid = true;
	initialized = true;
}

function loadServerDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	form = catalogProductDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	finishLoadingServerDraft(state);
}

function loadServerGraphProductDraft(state: CatalogProductEditorState) {
	if (!state.draft) {
		throw new Error("The catalog graph editor requires an active draft.");
	}
	locallyCommittedRevisionIds = [];
	uploads.draftLoaded(state.draft.revisionId);
	form = catalogProductGraphDraftFromRevision(state.draft);
	graphSourceRevision = state.draft;
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	finishLoadingServerDraft(state);
}

function loadServerGraphProductWithoutDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	graphSourceRevision = null;
	form = emptyCatalogProductDraft();
	hasActiveDraft = false;
	baseRevisionId = undefined;
	finishLoadingServerDraft(state);
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
	activeDraftOperation = null;
	uploads.reset();
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
	media.resetUploads();
	uploadedPrivateAssets = [];
	mediaActionError = "";
	publicationOperation = null;
	publicationMessage = "";
	publicationError = "";
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

function chooseDigitalDownloadFile(file: File | null) {
	if (dirty || editorLocked || !baseRevisionId || form.productKind !== "digital_download") return;
	uploads.selectDownload(file, {
		kind: "paid_digital_file", relationKey: newCatalogPrivateRelationKey("download"),
	});
}

function dropDigitalDownloadFile(event: DragEvent) {
	event.preventDefault();
	if (uploads.downloadBusy || dirty || editorLocked) return;
	chooseDigitalDownloadFile(event.dataTransfer?.files?.[0] ?? null);
}

async function startPrivateUpload() {
	const draft = currentUploadDraft();
	if (!draft || dirty || editorLocked || form.productKind !== "digital_download") return;
	await uploads.startDownload(draft, ({ relation, asset }) => {
		uploadedPrivateAssets = [
			asset,
			...uploadedPrivateAssets.filter((candidate) => candidate.assetId !== asset.assetId),
		];
		form.paidFile = {
			key: relation.relationKey,
			assetId: asset.assetId,
			...(asset.version ? { version: asset.version } : {}),
		};
	});
}

onDestroy(() => {
	activeDraftOperation = null;
	uploads.dispose();
	clearPublicationReconciliationTimer();
	publicationOperation = null;
});

function beginDraftMutation(state: "saving" | "discarding") {
	const operation = {};
	const operationProductId = productId;
	activeDraftOperation = operation;
	saveState = state;
	saveError = "";
	// A new visit to the same product must not adopt a previous visit's response.
	return () => activeDraftOperation === operation && productId === operationProductId;
}

async function saveDraft() {
	if (!canSave) return;
	if (!editorState) return;
	if (isGraphV2 && !graphSourceRevision) return;
	if (!isGraphV2 && !editorState.draft) return;
	const isCurrentOperation = beginDraftMutation("saving");
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
		if (!isCurrentOperation()) return;
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
		if (!isCurrentOperation()) return;
		saveError = mutationError(error, "Could not save this product draft.");
	}
}
async function discardDraft() {
	if (!hasActiveDraft || !baseRevisionId) return;
	if (!globalThis.confirm(
		"Discard this draft? This clears its staged product details and any unsaved changes. The product identity remains, but this editor does not yet provide a restore action.",
	)) return;
	const isCurrentOperation = beginDraftMutation("discarding");
	try {
		await client.mutation(catalogApi.discardDraft, { productId, draftRevisionId: baseRevisionId });
		if (!isCurrentOperation()) return;
		rememberCommittedRevision(null);
		hasActiveDraft = false;
		baseRevisionId = undefined;
		graphSourceRevision = null;
		form = emptyCatalogProductDraft();
		savedJson = serializeCatalogProductDraft(form);
		syncMultiplierFromForm();
		saveState = "saved";
	} catch (error) {
		if (!isCurrentOperation()) return;
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
	const isCurrentOperation = beginDraftMutation("saving");
	try {
		const result = await client.mutation(catalogApi.saveDraft, { productId, draft }) as { revisionId: string };
		if (!isCurrentOperation()) return;
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
		if (!isCurrentOperation()) return;
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
	media.addUpload(asset);
	return addMediaAsset(asset);
}

async function uploadProductArtwork(
	file: File,
	onStatus: (status: CatalogProductArtworkStatus) => void,
) {
	const draft = currentUploadDraft();
	if (!draft || !mediaCapability?.uploadEndpoint
		|| (form.productKind !== "print" && form.productKind !== "print_set")) {
		throw new Error("This artwork upload is not available right now.");
	}
	mediaActionError = "";
	await uploads.uploadArtwork(file, {
		draft, productKind: form.productKind, mediaEndpoint: mediaCapability.uploadEndpoint, onStatus,
		onVerified: (result) => {
			form = attachCatalogProductArtwork(form, result.displayAsset, result.privateAsset);
			media.addUpload(result.displayAsset);
			uploadedPrivateAssets = [
				result.privateAsset,
				...uploadedPrivateAssets.filter((asset) => asset.assetId !== result.privateAsset.assetId),
			];
		},
	});
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
		{#if media.error}<p class="alert" role="alert">Could not load product images. Refresh this page to try again.</p>{/if}
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
					mediaById={media.byId}
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
						<label class="private-file-dropzone" class:disabled={uploads.downloadBusy || dirty || editorLocked} aria-disabled={uploads.downloadBusy || dirty || editorLocked} ondragover={(event) => event.preventDefault()} ondrop={dropDigitalDownloadFile}>
							<strong>{uploads.selectedFile?.name ?? "drop a ZIP here or click to choose"}</strong>
							<small>ZIP · 16 MB max</small>
							<input aria-label="choose customer download ZIP" type="file" accept="application/zip,application/x-zip-compressed,.zip" onchange={(event) => { chooseDigitalDownloadFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} disabled={uploads.downloadBusy || dirty || editorLocked} />
						</label>
						{#if uploads.hasDownload}
							<label>version (optional)<input maxlength="64" value={uploads.version} oninput={(event) => (uploads.version = event.currentTarget.value)} disabled={uploads.downloadBusy || dirty || editorLocked} /></label>
							<div class="private-upload-actions">
								<button type="button" onclick={() => void startPrivateUpload()} disabled={!uploads.selectedFile || uploads.downloadBusy || dirty || editorLocked}>upload file</button>
								{#if uploads.phase === "reading" || uploads.phase === "preparing"}<button type="button" class="secondary" onclick={uploads.cancelDownload}>cancel</button>{/if}
								{#if uploads.manualCheckVisible}<button type="button" class="secondary" onclick={() => void uploads.checkDownloadAgain()} disabled={!uploads.manualCheckReady}>check again</button>{/if}
							</div>
						{/if}
						{#if uploads.message}<p class:upload-error={uploads.phase === "error"} role={uploads.phase === "error" ? "alert" : "status"}>{uploads.message}</p>{/if}
					{/if}
					{#if privateAssetRows[0]?.asset && !uploads.hasDownload}<p class="download-ready">{privateAssetRows[0].asset.originalFilename}</p>{/if}
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
			assets={media.ready}
			{selectedAssetIds}
			mediaBaseUrl={mediaCapability.mediaBaseUrl}
			pagination={media.pagination}
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
