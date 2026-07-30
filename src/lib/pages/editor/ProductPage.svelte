<script lang="ts">
import { onDestroy } from "svelte";
import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
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
	alignCatalogProductWebMediaWithSetMembers,
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
	parseCatalogBasisPoints,
	serializeCatalogProductDraft,
	slugifyCatalogProductTitle,
	type CatalogEditorMediaRelation,
	type CatalogEditorPrintSourceRelation,
	type CatalogEditorPrivateAsset,
	type CatalogEditorPrivateAssetCandidatePage,
	type CatalogEditorPrivateAssetRelation,
	type CatalogProductDraftForm,
	type CatalogProductEditorState,
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
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";
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
} = capability;

const baseHref = productsConfig.baseHref ?? "/admin/editor/products";
const client = useAdminClient();
const editorQuery = useQuery(catalogApi.getEditorState, () => ({ productId }));
let editorState = $derived(editorQuery.data as CatalogProductEditorState | undefined);
let editorError = $derived(editorQuery.error);
let form = $state<CatalogProductDraftForm>(emptyCatalogProductDraft());
let initialized = $state(false);
let hasActiveDraft = $state(false);
let loadedServerRevisionId = $state<string | null>(null);
let loadedPublishedRevisionId = $state<string | null>(null);
let loadedUpdatedAt = $state<number | null>(null);
let baseRevisionId = $state<string | undefined>();
let locallyCommittedRevisionIds = $state<Array<string | null>>([]);
let savedJson = $state("");
let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "replacing" | "discarding" | "error" | "conflict">("loading");
let saveError = $state("");
let multiplierInput = $state("10000");
let multiplierError = $state("");
let variantsValid = $state(true);
let pickerOpen = $state(false);
let uploadedAssets = $state<PortfolioMediaAsset[]>([]);
let mediaActionError = $state("");
let activePrivateAssetRelation = $state<CatalogEditorPrivateAssetRelation | null>(null);
let selectedPrivateAssetId = $state("");
let replacementPending = $state(false);
let replacementRevisionId = $state<string | null>(null);
let replacementBaseRevisionId = $state<string | null>(null);
let replacementSubmittedJson = $state("");
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
	replacementRevisionId: string | null;
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
const privateAssetCandidateQuery = privateAssetCapability
	? useQuery(privateAssetCapability.listCandidates, () =>
		activePrivateAssetRelation && baseRevisionId
			? {
					productId,
					expectedDraftRevisionId: baseRevisionId,
					relation: activePrivateAssetRelation,
					paginationOpts: { numItems: 25, cursor: null },
				}
			: "skip")
	: null;
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
let canEditGraphProduct = $derived(isGraphV2 && canEditCatalogProductGraphKind(editorState?.productKind) && Boolean(editorState?.draft));
let readOnlyRevision = $derived(editorState?.draft ?? editorState?.published ?? null);

function isVerifiedPrintSourceRelation(
	relation: CatalogEditorMediaRelation,
): relation is CatalogEditorPrintSourceRelation {
	if (!relation.asset || typeof relation.asset !== "object") return false;
	const asset = relation.asset as Partial<CatalogEditorPrintSourceRelation["asset"]>;
	return typeof relation.relationKey === "string"
		&& asset.kind === "print_source"
		&& asset.status === "verified"
		&& typeof asset.assetId === "string"
		&& typeof asset.originalFilename === "string"
		&& (asset.mimeType === "image/jpeg" || asset.mimeType === "image/png")
		&& Number.isSafeInteger(asset.sizeBytes)
		&& Number.isSafeInteger(asset.widthPixels)
		&& Number.isSafeInteger(asset.heightPixels)
		&& typeof asset.createdAt === "number";
}

let privateAssetRows = $derived.by(() => {
	const revision = editorState?.draft;
	if (!revision) return [];
	const printSourceAssets = (revision.printSourceAssets ?? [])
		.filter(isVerifiedPrintSourceRelation);
	if (form.productKind === "digital_download") {
		const relation = revision.paidFileAsset;
		return relation
			? [{ label: "paid download", relation: { kind: "paid_digital_file" as const, relationKey: relation.relationKey }, asset: relation.asset }]
			: [];
	}
	if (form.productKind === "print_set") {
		return form.setMembers.map((member, index) => ({
			label: `member ${index + 1} print master`,
			relation: { kind: "print_source" as const, relationKey: member.printSourceKey },
			asset: printSourceAssets.find(
				(candidate) => candidate.relationKey === member.printSourceKey,
			)?.asset,
		}));
	}
	if (form.productKind === "print") {
		return printSourceAssets.slice(0, 1).map((relation) => ({
			label: "single-print master",
			relation: { kind: "print_source" as const, relationKey: relation.relationKey },
			asset: relation.asset,
		}));
	}
	return [];
});
let candidatePage = $derived(
	privateAssetCandidateQuery?.data as CatalogEditorPrivateAssetCandidatePage | undefined,
);
let activeCandidatePage = $derived(
	candidatePage
		&& baseRevisionId === candidatePage.draftRevisionId
		&& activePrivateAssetRelation?.kind === candidatePage.relation.kind
		&& activePrivateAssetRelation.relationKey === candidatePage.relation.relationKey
		? candidatePage
		: undefined,
);
let stagedPrivateAsset = $derived(privateUploadOperation?.stagedAsset ?? null);
let privateUploadState = $derived(privateUploadOperation?.phase ?? privateUploadFallbackState);
let candidateOptions = $derived(activeCandidatePage
	? [...new Map([
		activeCandidatePage.relation.currentAsset,
		...activeCandidatePage.page,
		...(stagedPrivateAsset
			&& privateUploadOperation?.snapshot.relation.kind === activeCandidatePage.relation.kind
			&& privateUploadOperation.snapshot.relation.relationKey === activeCandidatePage.relation.relationKey
			? [stagedPrivateAsset]
			: []),
	].map((asset) => [asset.assetId, asset])).values()]
	: []);
let usesSinglePrice = $derived(
	form.productKind === "postcard"
		|| form.productKind === "merchandise"
		|| form.productKind === "tapestry"
		|| form.productKind === "digital_download",
);
let dirty = $derived(initialized && hasActiveDraft && currentJson !== savedJson);
let privateUploadBusy = $derived(["reading", "preparing", "uploading", "completing", "pending"].includes(privateUploadState));
let privateUploadBlocked = $derived(privateUploadOperation !== null);
let publicationRequestActive = $derived(publicationOperation !== null);
let editorLocked = $derived(
	replacementPending || privateUploadBusy || publicationRequestActive
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
	dirty || saveState !== "saved" || replacementPending || privateUploadBlocked
		|| publicationRequestActive || publicationQueryStale,
);
let canPublish = $derived(Boolean(
	publicationCapability && editorState?.draft && !publicationActionsLocked
		&& editorState.draft.revisionId !== editorState.published?.revisionId,
));
let canUnpublish = $derived(Boolean(
	publicationCapability && editorState?.published && !publicationActionsLocked,
));
let canSave = $derived(
	hasActiveDraft
		&& variantsValid
		&& (!form.frameOptionsEnabled || !multiplierError)
		&& !editorLocked
		&& (dirty || saveState === "error"),
);
let publicationUpdatedAtIso = $derived(formatPublicationTime(editorState?.updatedAt ?? null));
let publicationPublishedAtIso = $derived(formatPublicationTime(editorState?.publishedAt ?? null));

function syncLoadedPublication(state: CatalogProductEditorState) {
	loadedServerRevisionId = state.draft?.revisionId ?? null;
	loadedPublishedRevisionId = state.published?.revisionId ?? null;
	loadedUpdatedAt = state.updatedAt;
}

function loadServerDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	form = catalogProductDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	multiplierInput = String(form.framePriceMultiplierBasisPoints);
	saveState = "saved";
	saveError = "";
	multiplierError = "";
	initialized = true;
}

function loadServerGraphProductDraft(state: CatalogProductEditorState) {
	locallyCommittedRevisionIds = [];
	if (privateUploadOperation && state.draft?.revisionId !== privateUploadOperation.snapshot.draftRevisionId) {
		clearCompletionCheckTimer();
		privateUploadOperation = null;
		privateUploadFallbackState = "error";
		privateUploadMessage = "The draft relation changed. Reload this product before starting another upload.";
	}
	form = catalogProductGraphDraftFromRevision(state.draft);
	hasActiveDraft = Boolean(state.draft);
	baseRevisionId = state.draft?.revisionId;
	syncLoadedPublication(state);
	savedJson = serializeCatalogProductDraft(form);
	multiplierInput = String(form.framePriceMultiplierBasisPoints);
	saveState = "saved";
	saveError = "";
	multiplierError = "";
	initialized = true;
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

function formatPublicationTime(value: number | null) {
	if (value === null || !Number.isSafeInteger(value)) return null;
	try { return new Date(value).toISOString(); } catch { return null; }
}

function completePublication(operation: PublicationOperation, state: CatalogProductEditorState) {
	clearPublicationReconciliationTimer();
	syncLoadedPublication(state);
	publicationOperation = null;
	publicationError = "";
	publicationMessage = operation.action === "publish"
		? "Published in Convex CMS."
		: "Unpublished from Convex CMS.";
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
	if (!editorState) return;
	if (isGraphV2) {
		const serverRevisionId = editorState.draft?.revisionId ?? null;
		const serverPublishedRevisionId = editorState.published?.revisionId ?? null;
		if (!initialized) {
			if (canEditGraphProduct) return loadServerGraphProductDraft(editorState);
			hasActiveDraft = Boolean(editorState.draft);
			baseRevisionId = editorState.draft?.revisionId;
			syncLoadedPublication(editorState);
			saveState = "saved";
			initialized = true;
			return;
		}
		if (publicationOperation) {
			reconcilePublicationState(editorState);
			return;
		}
		if (!canEditGraphProduct) {
			syncLoadedPublication(editorState);
			if (saveState !== "conflict") saveState = "saved";
			return;
		}
		if (saveState === "conflict") return;
		if (replacementPending) {
			if (!replacementRevisionId) return;
			if (
				serverRevisionId === replacementRevisionId
				&& serverPublishedRevisionId === loadedPublishedRevisionId
			) {
				syncLoadedPublication(editorState);
				baseRevisionId = serverRevisionId;
				savedJson = replacementSubmittedJson;
				replacementPending = false;
				replacementRevisionId = null;
				replacementBaseRevisionId = null;
				activePrivateAssetRelation = null;
				selectedPrivateAssetId = "";
				if (
					privateUploadOperation?.replacementRevisionId === serverRevisionId
					&& stagedUploadMatchesQuery(privateUploadOperation)
				) {
					clearCompletionCheckTimer();
					privateUploadOperation = null;
					privateUploadFallbackState = "idle";
					privateUploadMessage = "";
				}
				saveState = currentJson === savedJson ? "saved" : "dirty";
				return;
			}
			if (serverRevisionId !== replacementBaseRevisionId) {
				replacementPending = false;
				saveState = "conflict";
				saveError = "A newer server draft arrived before the replacement revision could be confirmed. Reload this product before continuing.";
			}
			return;
		}
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
			syncLoadedPublication(editorState);
			baseRevisionId = serverRevisionId ?? undefined;
			locallyCommittedRevisionIds = locallyCommittedRevisionIds.slice(localEchoIndex + 1);
			return;
		}
		if (dirty) {
			saveState = "conflict";
			saveError = "A newer server state arrived while this page had unsaved changes. Reload before continuing.";
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
		loadedServerRevisionId = serverRevisionId;
		baseRevisionId = serverRevisionId ?? undefined;
		locallyCommittedRevisionIds = locallyCommittedRevisionIds.slice(localEchoIndex + 1);
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
function updateMultiplier(value: string) {
	multiplierInput = value;
	try {
		form.framePriceMultiplierBasisPoints = parseCatalogBasisPoints(value);
		multiplierError = "";
	} catch (error) {
		multiplierError = error instanceof Error ? error.message : "Enter whole basis points.";
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
		publicationError = "The Convex CMS publication result could not be confirmed. Reload this product; do not submit the action again.";
	}, PUBLICATION_RECONCILIATION_MS);
}

async function runPublication(action: "publish" | "unpublish") {
	if (!publicationCapability || !editorState) return;
	if (action === "publish" ? !canPublish : !canUnpublish) return;
	if (action === "unpublish" && !globalThis.confirm(
		"Unpublish this product from Convex CMS?",
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
		? "Publishing once to Convex CMS…"
		: "Unpublishing once from Convex CMS…";
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
		publicationMessage = "Confirming the exact Convex CMS publication state…";
		schedulePublicationReconciliation(publicationOperation);
		reconcilePublicationState(editorState);
	} catch (error) {
		if (publicationOperation?.requestId !== operation.requestId) return;
		const message = error instanceof Error ? error.message : "";
		if (message.toLowerCase().includes("catalog publication conflict")) {
			publicationConflict();
			return;
		}
		const completenessMessage = action === "publish" ? publicationCompletenessMessage(error) : null;
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

function formatPrivateAssetSize(sizeBytes: number) {
	if (sizeBytes < 1024) return `${sizeBytes} B`;
	const units = ["KB", "MB", "GB"];
	const index = Math.min(Math.floor(Math.log(sizeBytes) / Math.log(1024)) - 1, 2);
	const value = sizeBytes / 1024 ** (index + 1);
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function privateAssetDetails(asset: CatalogEditorPrivateAsset) {
	return asset.kind === "print_source"
		? `${asset.mimeType} · ${formatPrivateAssetSize(asset.sizeBytes)} · ${asset.widthPixels}×${asset.heightPixels}px`
		: `${asset.mimeType} · ${formatPrivateAssetSize(asset.sizeBytes)} · ${asset.version ?? "version not set"}`;
}

function choosePrivateAssetRelation(
	relation: CatalogEditorPrivateAssetRelation,
	currentAssetId: string | undefined,
) {
	if (editorLocked || dirty) return;
	clearCompletionCheckTimer();
	activePrivateAssetRelation = relation;
	selectedPrivateAssetId = currentAssetId ?? "";
	selectedPrivateFile = null;
	if (privateFileInput) privateFileInput.value = "";
	privateZipVersion = "";
	privateUploadMessage = "";
	saveError = "";
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

function stagedUploadMatchesQuery(operation: PrivateUploadOperation) {
	const assetId = operation.stagedAsset?.assetId;
	const relation = operation.snapshot.relation;
	if (!assetId || !editorState?.draft) return false;
	if (relation.kind === "paid_digital_file") {
		return editorState.draft.paidFileAsset?.relationKey === relation.relationKey
			&& editorState.draft.paidFileAsset.asset.assetId === assetId;
	}
	return editorState.draft.printSourceAssets?.some(
		(item) => item.relationKey === relation.relationKey && item.asset.assetId === assetId,
	) ?? false;
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
	const result = await completeCatalogPrivateEditorUpload(
		privateAssetUpload.completeEndpoint,
		operation.uploadHandle,
	);
	if (!operationStillActive(operation.uploadHandle)) return;
	if (result.status === "verified") {
		clearCompletionCheckTimer();
		if (!uploadSnapshotStillActive(operation) || result.asset.kind !== operation.snapshot.relation.kind) {
			privateUploadOperation = null;
			privateUploadFallbackState = "error";
			privateUploadMessage = "The draft relation changed. Reload this product before using the verified asset.";
			return;
		}
		operation.stagedAsset = result.asset;
		operation.phase = "verified";
		selectedPrivateAssetId = result.asset.assetId;
		privateUploadMessage = `${result.asset.originalFilename} is verified, staged unattached, and selected below.`;
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
	privateUploadMessage = "This upload reached a terminal outcome. Select the file again to begin a new upload.";
}

async function startPrivateUpload() {
	if (
		!privateAssetUpload
		|| !selectedPrivateFile
		|| !activePrivateAssetRelation
		|| !activeCandidatePage
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
		privateUploadMessage = "A brand-new upload handle could not be created. Try again.";
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
		replacementRevisionId: null,
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
		privateUploadMessage = "Preparing one private upload…";
		let prepared: Awaited<ReturnType<typeof prepareCatalogPrivateEditorUpload>> | null = await prepareCatalogPrivateEditorUpload(
			privateAssetUpload.prepareEndpoint,
			declaration,
			controller.signal,
		);
		if (!operationStillActive(uploadHandle) || operation.putIssued) return;
		operation.putIssued = true;
		operation.controller = null;
		selectedPrivateFile = null;
		if (privateFileInput) privateFileInput.value = "";
		privateZipVersion = "";
		operation.phase = "uploading";
		privateUploadMessage = "Uploading once. This transfer will not be retried.";
		try {
			await putCatalogPrivateEditorUpload(prepared, file, declaration.contentType);
		} catch {
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
	clearCompletionCheckTimer();
	clearPublicationReconciliationTimer();
	privateUploadOperation = null;
	publicationOperation = null;
	controller?.abort();
});

async function checkPrivateUploadAgain() {
	if (!manualCheckReady || privateUploadState !== "pending") return;
	manualCheckReady = false;
	await reconcilePrivateUpload();
}

async function replacePrivateAsset() {
	if (
		!privateAssetCapability
		|| !activePrivateAssetRelation
		|| !activeCandidatePage
		|| !baseRevisionId
		|| dirty
		|| editorLocked
	) return;
	const candidate = candidateOptions.find(
		(asset) => asset.assetId === selectedPrivateAssetId,
	);
	if (
		!candidate
		|| candidate.assetId === activeCandidatePage.relation.currentAsset.assetId
	) return;
	if (!globalThis.confirm(
		`Replace ${activeCandidatePage.relation.currentAsset.originalFilename} with ${candidate.originalFilename}?`,
	)) return;
	const displayedRevisionId = baseRevisionId;
	replacementSubmittedJson = currentJson;
	replacementBaseRevisionId = displayedRevisionId;
	replacementRevisionId = null;
	replacementPending = true;
	saveState = "replacing";
	saveError = "";
	pickerOpen = false;
	try {
		const result = await client.mutation(privateAssetCapability.replace, {
			productId,
			expectedDraftRevisionId: displayedRevisionId,
			relation: { ...activePrivateAssetRelation, assetId: candidate.assetId },
		}) as { revisionId: string };
		replacementRevisionId = result.revisionId;
		if (
			privateUploadOperation?.phase === "verified"
			&& privateUploadOperation.stagedAsset?.assetId === candidate.assetId
			&& privateUploadOperation.snapshot.relation.kind === activePrivateAssetRelation.kind
			&& privateUploadOperation.snapshot.relation.relationKey === activePrivateAssetRelation.relationKey
		) privateUploadOperation.replacementRevisionId = result.revisionId;
	} catch (error) {
		replacementPending = false;
		replacementRevisionId = null;
		replacementBaseRevisionId = null;
		saveError = mutationError(error, "Could not replace this private asset.");
	}
}

async function saveDraft() {
	if (!canSave) return;
	if (!editorState?.draft) return;
	saveState = "saving";
	saveError = "";
	try {
		const submittedForm = copyCatalogProductDraft(form);
		const submittedJson = serializeCatalogProductDraft(submittedForm);
		const draft = canEditGraphProduct
			? catalogProductGraphDraftFromForm(editorState.draft, submittedForm)
			: submittedForm;
		const result = await client.mutation(catalogApi.saveDraft, {
			productId,
			...(baseRevisionId ? { expectedDraftRevisionId: baseRevisionId } : {}),
			draft,
		}) as { revisionId: string };
		baseRevisionId = result.revisionId;
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
		form = emptyCatalogProductDraft();
		savedJson = serializeCatalogProductDraft(form);
		multiplierInput = String(form.framePriceMultiplierBasisPoints);
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not discard this product draft.");
	}
}
async function startDraft() {
	if (editorLocked) return;
	const draft = catalogProductDraftFromRevision(editorState?.published);
	saveState = "saving";
	saveError = "";
	try {
		const result = await client.mutation(catalogApi.saveDraft, { productId, draft }) as { revisionId: string };
		form = draft;
		hasActiveDraft = true;
		baseRevisionId = result.revisionId;
		rememberCommittedRevision(result.revisionId);
		savedJson = serializeCatalogProductDraft(draft);
		multiplierInput = String(form.framePriceMultiplierBasisPoints);
		saveState = "saved";
	} catch (error) {
		saveError = mutationError(error, "Could not start a new product draft.");
	}
}

function addMediaAsset(asset: PortfolioMediaAsset) {
	mediaActionError = "";
	try {
		form.webMedia = addCatalogProductWebMedia(
			form.webMedia ?? [],
			asset,
			form.productKind,
		);
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
</script>

<svelte:head><title>Product — {config.siteName}</title></svelte:head>
{#if editorError}
	<p class="alert page-alert" role="alert">Could not load this product draft. Refresh this page to try again.</p>
{:else if editorState === undefined}
	<p class="loading" role="status">Loading product draft…</p>
{:else}
		<div class="settings-page product-page">
		<header class="settings-header">
			<div><a class="back" href={baseHref}>← products</a><h1>{canEditGraphProduct || !isGraphV2 ? form.title?.trim() || editorState.productKey : catalogProductEditorTitle(readOnlyRevision)?.trim() || editorState.productKey}</h1><p class="description">{canEditGraphProduct ? `Edit this private imported ${catalogProductKindLabel(editorState.productKind)} draft. Public Shop authority is configured separately.` : isGraphV2 ? "Review the imported private catalog graph. Product-specific editing arrives in a later slice." : "Edit the private product definition and ordered price variants. Public Shop authority is configured separately."}</p></div>
			{#if hasActiveDraft && (!isGraphV2 || canEditGraphProduct)}<div class="actions"><span class="save-state" aria-live="polite">{saveState}</span><button type="button" class="primary" onclick={() => void saveDraft()} disabled={!canSave}>save draft</button></div>{/if}
		</header>
		{#if saveError}<p class="alert" role="alert">{saveError}</p>{/if}
		{#if publicationError}<div class="alert publication-alert" role="alert"><span>{publicationError}</span>{#if publicationOperation?.phase === "reload-required"}<button type="button" onclick={() => globalThis.location.reload()}>reload product</button>{/if}</div>{/if}
		{#if mediaActionError}<p class="alert" role="alert">{mediaActionError}</p>{/if}
		{#if mediaQueryError}<p class="alert" role="alert">Could not load product images. Refresh this page to try again.</p>{/if}
		{#if privateAssetCandidateQuery?.error}<p class="alert" role="alert">Could not load verified replacement assets. The draft may have changed; reload this product before continuing.</p>{/if}
		{#if publicationCapability && isGraphV2}
			<section class="publication" aria-labelledby="catalog-publication-heading">
				<div><h2 id="catalog-publication-heading">Convex CMS publication</h2><p>Convex publication is separate; public Shop authority is configured separately.</p></div>
				<div class="publication-controls">
					<p class="publication-status" role="status" aria-live="polite">{publicationStatus}</p>
					<div class="publication-actions">
						<button type="button" class="primary" onclick={() => void runPublication("publish")} disabled={!canPublish}>publish to Convex CMS</button>
						<button type="button" class="danger" onclick={() => void runPublication("unpublish")} disabled={!canUnpublish}>unpublish from Convex CMS</button>
					</div>
				</div>
				<dl class="publication-evidence">
					<div><dt>draft revision ID</dt><dd><code>{editorState.draft?.revisionId ?? "none — no active draft"}</code></dd></div>
					<div><dt>published revision ID</dt><dd><code>{editorState.published?.revisionId ?? "none — not published"}</code></dd></div>
					<div><dt>product updatedAt</dt><dd>{#if publicationUpdatedAtIso}<time datetime={publicationUpdatedAtIso}>{publicationUpdatedAtIso}</time>{:else}invalid timestamp{/if} · <code>{editorState.updatedAt}</code></dd></div>
					<div><dt>publishedAt</dt><dd>{#if editorState.publishedAt === null}not published{:else if publicationPublishedAtIso}<time datetime={publicationPublishedAtIso}>{publicationPublishedAtIso}</time> · <code>{editorState.publishedAt}</code>{:else}invalid timestamp · <code>{editorState.publishedAt}</code>{/if}</dd></div>
				</dl>
				{#if publicationMessage}<p class="publication-message" role="status" aria-live="polite">{publicationMessage}</p>{/if}
			</section>
		{/if}
		{#if isGraphV2 && !canEditGraphProduct}
			<section aria-labelledby="product-readback-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-readback-heading">imported catalog draft</h2><p>{publicationCapability ? "This product is stored in the Convex CMS catalog graph." : "This product is stored in the new graph model as an unpublished draft."}</p></div></div>
				<dl class="readback-grid">
					<div><dt>kind</dt><dd>{catalogProductKindLabel(editorState.productKind)}</dd></div>
					<div><dt>URL name</dt><dd>{editorState.slug ? `/${editorState.slug}` : "not set"}</dd></div>
					<div><dt>availability</dt><dd>{catalogProductEditorSaleAvailability(readOnlyRevision) ?? "not set"}</dd></div>
					<div><dt>variants</dt><dd>{catalogProductEditorVariantCount(readOnlyRevision)}</dd></div>
					<div><dt>web images</dt><dd>{readOnlyRevision?.webMediaAssets?.length ?? 0}</dd></div>
					<div><dt>print files</dt><dd>{readOnlyRevision?.printSourceAssets?.length ?? 0}</dd></div>
				</dl>
				{#if catalogProductEditorDescription(readOnlyRevision)}
					<p class="readback-description">{catalogProductEditorDescription(readOnlyRevision)}</p>
				{/if}
				<p class="readback-note">{publicationCapability ? "Convex publication is separate; public Shop authority is configured separately." : "Read-only for this slice: this imported product is visible to the protected Editor. Public Shop authority is configured separately."}</p>
			</section>
		{:else if !hasActiveDraft}
			<section aria-labelledby="discarded-product-heading">
				<div class="section-heading"><span>01</span><div><h2 id="discarded-product-heading">no active draft</h2><p>This product identity remains in the catalog, but its editable draft was discarded. No product details are currently staged.</p></div></div>
				<button type="button" onclick={() => void startDraft()} disabled={editorLocked}>{saveState === "saving" ? "starting…" : "start a new draft"}</button>
			</section>
		{:else}
			<section aria-labelledby="product-identity-heading">
				<div class="section-heading"><span>01</span><div><h2 id="product-identity-heading">product details</h2><p>The working name, URL name, and description stored with this draft.</p></div></div>
				<div class="fields two-column">
					<label>product name<input maxlength="160" value={form.title ?? ""} oninput={(event) => updateOptionalField("title", event.currentTarget.value)} onblur={fillSlugIfEmpty} disabled={editorLocked} /></label>
					<label>URL name<input maxlength="96" value={form.slug ?? ""} oninput={(event) => updateOptionalField("slug", event.currentTarget.value)} spellcheck="false" disabled={editorLocked} /><small>Lowercase words separated by hyphens.</small></label>
					<label class="wide">description<textarea rows="5" maxlength="5000" value={form.description ?? ""} oninput={(event) => updateOptionalField("description", event.currentTarget.value)} disabled={editorLocked}></textarea></label>
				</div>
			</section>
			<section aria-labelledby="sale-settings-heading">
				<div class="section-heading"><span>02</span><div><h2 id="sale-settings-heading">sale settings</h2><p>{form.productKind === "print" || form.productKind === "print_set" ? `Choose how the ${catalogProductKindLabel(form.productKind)} is fulfilled and whether customers may currently order it.` : "Choose whether customers may currently order this product."}</p></div></div>
				<div class="fields two-column">
					{#if form.productKind === "print" || form.productKind === "print_set"}<label>fulfillment<select bind:value={form.fulfillmentMode} disabled={editorLocked}><option value="production_partner">production partner</option><option value="merchant_fulfilled">handled by the studio</option></select></label>{/if}
					<label>sale availability<select bind:value={form.saleAvailability} disabled={editorLocked}><option value="available">available</option><option value="unavailable">unavailable</option></select></label>
				</div>
				{#if form.productKind === "print" || form.productKind === "print_set"}
					<div class="option-grid"><label class="check"><input type="checkbox" bind:checked={form.borderOptionsEnabled} disabled={editorLocked} /><span>offer border options</span></label><label class="check"><input type="checkbox" bind:checked={form.frameOptionsEnabled} disabled={editorLocked} /><span>offer frame options</span></label></div>
					{#if form.frameOptionsEnabled}<label class="multiplier">frame price multiplier (basis points)<input inputmode="numeric" value={multiplierInput} oninput={(event) => updateMultiplier(event.currentTarget.value)} aria-invalid={Boolean(multiplierError)} disabled={editorLocked} /><small>10,000 = 1×; 20,000 = 2×.</small>{#if multiplierError}<small class="field-error">{multiplierError}</small>{/if}</label>{/if}
				{/if}
			</section>
			<CatalogProductVariants variants={form.variants} productLabel={catalogProductKindLabel(form.productKind)} fixedPrice={usesSinglePrice} onChange={(variants) => { form.variants = variants; }} onValidityChange={(valid) => { variantsValid = valid; }} disabled={editorLocked} />
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
				/>
			{/if}
			{#if form.productKind === "print_set"}
				<CatalogProductSetMembers members={form.setMembers} onChange={(members) => {
					form.setMembers = members;
					form.webMedia = alignCatalogProductWebMediaWithSetMembers(
						form.webMedia ?? [],
						members,
					);
				}} disabled={editorLocked} />
			{/if}
			{#if ["print", "print_set", "digital_download"].includes(form.productKind)}
				<section class="private-assets" aria-labelledby="catalog-private-assets-heading">
					<div class="section-heading"><span>05</span><div><h2 id="catalog-private-assets-heading">verified private assets</h2><p>Current safe metadata and already-verified replacement choices for this draft.</p></div></div>
					{#if privateAssetRows.length === 0}
						<p class="private-asset-empty" role="status">No verified private asset is linked to this draft.</p>
					{:else}
						<ul class="private-asset-list">
							{#each privateAssetRows as row (row.relation.relationKey)}
								<li>
									<div class="private-asset-metadata"><strong>{row.label}</strong><span>{row.asset?.originalFilename ?? "verified metadata unavailable"}</span>{#if row.asset}<small>verified · {privateAssetDetails(row.asset)}</small>{/if}<small>{row.relation.relationKey}</small></div>
									{#if privateAssetCapability && row.asset}
										{#if activePrivateAssetRelation?.kind === row.relation.kind && activePrivateAssetRelation.relationKey === row.relation.relationKey}
											<div class="replacement-action">
												{#if privateAssetUpload}
													<div class="private-upload">
														<label>new private {row.relation.kind === "print_source" ? "JPEG or PNG" : "ZIP"}<input bind:this={privateFileInput} type="file" accept={row.relation.kind === "print_source" ? "image/jpeg,image/png" : "application/zip,.zip"} onchange={(event) => { selectedPrivateFile = event.currentTarget.files?.[0] ?? null; privateUploadMessage = ""; }} disabled={privateUploadBlocked || dirty} /></label>
														{#if row.relation.kind === "paid_digital_file"}<label>version (optional)<input maxlength="64" value={privateZipVersion} oninput={(event) => (privateZipVersion = event.currentTarget.value)} disabled={privateUploadBlocked || dirty} /></label>{/if}
														<div class="private-upload-actions">
															<button type="button" onclick={() => void startPrivateUpload()} disabled={!selectedPrivateFile || privateUploadBlocked || dirty || !activeCandidatePage}>stage verified asset</button>
															{#if privateUploadState === "reading" || privateUploadState === "preparing"}<button type="button" class="secondary" onclick={cancelPrivateUpload}>cancel before upload</button>{/if}
															{#if privateUploadState === "pending" && automaticChecksRemaining === 0}<button type="button" class="secondary" onclick={() => void checkPrivateUploadAgain()} disabled={!manualCheckReady}>check again</button>{/if}
														</div>
														{#if privateUploadMessage}<p class:upload-error={privateUploadState === "error"} role={privateUploadState === "error" ? "alert" : "status"}>{privateUploadMessage}</p>{/if}
													</div>
												{/if}
												{#if activeCandidatePage}
													<div class="replacement-confirm"><label>verified replacement<select aria-label={`Replacement for ${row.label}`} bind:value={selectedPrivateAssetId} disabled={editorLocked || dirty}>{#each candidateOptions as asset (asset.assetId)}<option value={asset.assetId}>{asset.originalFilename} — {formatPrivateAssetSize(asset.sizeBytes)}</option>{/each}</select></label><button type="button" onclick={() => void replacePrivateAsset()} disabled={editorLocked || dirty || !selectedPrivateAssetId || selectedPrivateAssetId === activeCandidatePage.relation.currentAsset.assetId}>replace asset</button></div>
												{:else if !privateAssetCandidateQuery?.error}<span role="status">Loading verified choices…</span>{/if}
											</div>
										{:else}
											<button type="button" onclick={() => choosePrivateAssetRelation(row.relation, row.asset?.assetId)} disabled={editorLocked || dirty}>choose replacement</button>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<p class="private-asset-note">A verified upload is staged unattached. Only the separate confirmed replacement action changes the selected relation.</p>
				</section>
			{/if}
			{#if !isGraphV2}
				<section aria-labelledby="product-draft-actions-heading">
					<div class="section-heading"><span>04</span><div><h2 id="product-draft-actions-heading">draft actions</h2><p>Discard clears the active draft pointer. The product identity and immutable revision history remain retained.</p></div></div>
					<button type="button" class="danger" onclick={() => void discardDraft()} disabled={saveState === "saving" || saveState === "discarding"}>{saveState === "discarding" ? "discarding…" : "discard draft"}</button>
				</section>
			{/if}
		{/if}
	</div>
{/if}

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
<style>
	.loading, .page-alert { margin: 48px 40px; } .loading { color: var(--admin-text-muted); } .product-page { max-width: 1040px; }
	.back { display: inline-block; margin-bottom: 14px; color: var(--admin-text-muted); text-decoration: none; }
	select { width: 100%; box-sizing: border-box; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 11px 12px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; text-transform: none; }
	select:focus { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.option-grid { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-top: 22px; }
	.check { flex-direction: row !important; align-items: center; color: var(--admin-text) !important; } .check input { width: auto !important; }
	.multiplier { max-width: 360px; margin-top: 20px; }
	.publication { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; border: 1px solid var(--admin-border); border-radius: 10px; padding: 18px; }
	.publication h2, .publication p { margin: 0; } .publication h2 { color: var(--admin-heading); font-size: 1rem; } .publication > div > p, .publication-message { margin-top: 6px; color: var(--admin-text-muted); font-size: .78rem; line-height: 1.5; }
	.publication-controls { display: grid; justify-items: end; gap: 8px; } .publication-status { color: var(--admin-heading); font-size: .78rem; font-weight: 600; } .publication-actions { display: flex; gap: 8px; } .publication-message, .publication-evidence { grid-column: 1 / -1; }
	.publication-evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin: 0; } .publication-evidence div { min-width: 0; } .publication-evidence dt { color: var(--admin-text-muted); font-size: .68rem; } .publication-evidence dd { margin: 3px 0 0; overflow-wrap: anywhere; color: var(--admin-heading); font-size: .72rem; } .publication-evidence code { font-size: inherit; }
	.publication-alert { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
	.readback-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin: 0; }
	.readback-grid div { border: 1px solid var(--admin-border); border-radius: 10px; padding: 14px; background: color-mix(in srgb, var(--admin-surface) 82%, transparent); }
	.readback-grid dt { margin: 0 0 6px; color: var(--admin-text-muted); font-size: .68rem; text-transform: lowercase; letter-spacing: .08em; }
	.readback-grid dd { margin: 0; color: var(--admin-heading); font-size: .95rem; }
	.readback-description, .readback-note { margin: 18px 0 0; color: var(--admin-text-muted); line-height: 1.6; }
	.readback-note { border-top: 1px solid var(--admin-border); padding-top: 18px; font-size: .84rem; }
	.private-asset-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
	.private-asset-list li { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(240px, auto); gap: 18px; align-items: end; border: 1px solid var(--admin-border); border-radius: 8px; padding: 14px; }
	.private-asset-metadata { display: grid; min-width: 0; gap: 5px; }
	.private-asset-metadata strong, .private-asset-metadata span { overflow-wrap: anywhere; color: var(--admin-heading); }
	.private-asset-metadata strong { font-size: .76rem; font-weight: 500; }
	.private-asset-metadata span { font-size: .88rem; }
	.private-asset-metadata small, .replacement-action > span, .private-asset-note, .private-asset-empty { color: var(--admin-text-muted); font-size: .72rem; }
	.replacement-action, .private-upload { display: grid; gap: 10px; }
	.replacement-action label { min-width: 240px; color: var(--admin-text-muted); font-size: .68rem; }
	.private-upload { border-bottom: 1px solid var(--admin-border); padding-bottom: 12px; }
	.private-upload input { box-sizing: border-box; width: 100%; }
	.private-upload-actions, .replacement-confirm { display: flex; gap: 8px; align-items: end; }
	.private-upload-actions button, .replacement-confirm button { white-space: nowrap; }
	.private-upload p { margin: 0; color: var(--admin-text-muted); font-size: .72rem; }
	.private-upload .upload-error { color: var(--admin-danger, var(--status-rose)); }
	.private-asset-note { margin: 16px 0 0; }
	.danger { border-color: color-mix(in srgb, var(--admin-danger, var(--status-rose)) 55%, transparent) !important; color: var(--admin-danger, var(--status-rose)) !important; }
	@media (max-width: 720px) { .publication { grid-template-columns: 1fr; } .publication-controls { justify-items: start; } .private-asset-list li { grid-template-columns: 1fr; } .replacement-action label { min-width: 0; } .private-upload-actions, .replacement-confirm { align-items: stretch; flex-direction: column; } }
</style>
