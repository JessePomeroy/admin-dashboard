export type CatalogProductKind =
	| "print"
	| "print_set"
	| "postcard"
	| "merchandise"
	| "tapestry"
	| "digital_download";
export type CatalogPrintFulfillmentMode =
	| "production_partner"
	| "merchant_fulfilled";
export type CatalogSaleAvailability = "available" | "unavailable";
export type CatalogVariantStatus = "enabled" | "disabled";
export type CatalogRevisionSource = "admin" | "sanityImport" | "restore";
export type CatalogProductWebMediaRole =
	| "primary"
	| "cover"
	| "gallery"
	| "set_member"
	| "social_share";

export interface CatalogProductVariantDraftForm {
	key: string;
	materialOptionKey?: string;
	sizeOptionKey?: string;
	retailPriceCents?: number;
	status: CatalogVariantStatus;
}

export interface CatalogProductSetMemberDraftForm {
	key: string;
	mediaPlacementKey: string;
	printSourceKey: string;
}

export interface CatalogProductWebMediaDraftForm {
	key: string;
	role: CatalogProductWebMediaRole;
	assetId: string;
	altText?: string;
}

export interface CatalogProductDraftForm {
	productKind: CatalogProductKind;
	title?: string;
	slug?: string;
	description?: string;
	fulfillmentMode: CatalogPrintFulfillmentMode;
	saleAvailability: CatalogSaleAvailability;
	borderOptionsEnabled: boolean;
	frameOptionsEnabled: boolean;
	framePriceMultiplierBasisPoints: number;
	variants: CatalogProductVariantDraftForm[];
	setMembers: CatalogProductSetMemberDraftForm[];
	/** V2-only. Absent on the legacy V1 single-print form. */
	webMedia?: CatalogProductWebMediaDraftForm[];
	/** V2-only verified private print-source relations. */
	printSources?: CatalogProductGraphV2PrintSourceDraft[];
	/** V2-only verified paid download relation. */
	paidFile?: CatalogProductGraphV2PaidFileDraft;
}

export interface CatalogProductRevisionSummary {
	revisionId: string;
	title: string | null;
	saleAvailability: CatalogSaleAvailability;
	variantCount: number;
	createdAt: number;
}

export interface CatalogProductVariantProjection {
	key: string;
	order: number;
	materialOptionKey: string | null;
	sizeOptionKey: string | null;
	retailPriceCents: number | null;
	status: CatalogVariantStatus;
}

export interface CatalogProductEditorRevision {
	revisionId: string;
	schemaVersion: 1 | 2;
	productKind: CatalogProductKind;
	createdAt: number;
	currency?: "usd";
	title?: string | null;
	slug?: string | null;
	description?: string | null;
	fulfillmentMode?: CatalogPrintFulfillmentMode;
	saleAvailability?: CatalogSaleAvailability;
	borderOptionsEnabled?: boolean;
	frameOptionsEnabled?: boolean;
	framePriceMultiplierBasisPoints?: number;
	variantCount?: number;
	checksum?: string;
	source?: CatalogRevisionSource;
	variants?: CatalogProductVariantProjection[];
	draft?: CatalogProductGraphV2Draft;
	webMediaAssets?: CatalogEditorMediaRelation[];
	printSourceAssets?: CatalogEditorMediaRelation[];
	paidFileAsset?: CatalogEditorPaidFileRelation | null;
}

export interface CatalogProductEditorSummary {
	productId: string;
	productKey: string;
	productKind: CatalogProductKind;
	slug: string | null;
	draft: CatalogProductRevisionSummary | null;
	published: CatalogProductRevisionSummary | null;
	createdAt: number;
	updatedAt: number;
	publishedAt: number | null;
}

export interface CatalogProductEditorState {
	productId: string;
	productKey: string;
	productKind: CatalogProductKind;
	graphVersion?: 1 | 2;
	slug: string | null;
	draft: CatalogProductEditorRevision | null;
	published: CatalogProductEditorRevision | null;
	updatedAt: number;
	publishedAt: number | null;
}

/** @deprecated Use the role-specific catalog media projection types instead. */
export interface CatalogEditorMediaAsset {
	assetId?: string;
	filename?: string | null;
	width?: number | null;
	height?: number | null;
	altText?: string | null;
	url?: string | null;
}

/** @deprecated Use the role-specific catalog media relation types instead. */
export interface CatalogEditorMediaRelation {
	placementKey?: string;
	relationKey?: string;
	asset: CatalogEditorMediaAsset;
}

export interface CatalogEditorWebMediaAsset extends CatalogEditorMediaAsset {
	mediaAssetId: string;
	originalFilename: string;
	status: "ready";
	source: {
		contentType: string;
		sizeBytes: number;
		width: number;
		height: number;
	};
	derivatives: Record<string, {
		contentType: "image/webp";
		width: number;
		height: number;
	}>;
	createdAt: number;
}

export interface CatalogEditorWebMediaRelation extends CatalogEditorMediaRelation {
	placementKey: string;
	asset: CatalogEditorWebMediaAsset;
}

export interface CatalogEditorPrintSourceRelation extends CatalogEditorMediaRelation {
	relationKey: string;
	asset: {
		kind: "print_source";
		assetId: string;
		status: "verified";
		originalFilename: string;
		mimeType: "image/jpeg" | "image/png";
		sizeBytes: number;
		widthPixels: number;
		heightPixels: number;
		createdAt: number;
	};
}

export interface CatalogEditorPaidFileRelation {
	relationKey: string;
	asset: {
		kind: "paid_digital_file";
		assetId: string;
		status: "verified";
		originalFilename: string;
		mimeType: "application/zip";
		sizeBytes: number;
		version?: string;
		createdAt: number;
	};
}

export type CatalogEditorPrivateAsset =
	| CatalogEditorPrintSourceRelation["asset"]
	| CatalogEditorPaidFileRelation["asset"];
export type CatalogEditorPrivateAssetRelation =
	| { kind: "print_source"; relationKey: string }
	| { kind: "paid_digital_file"; relationKey: string };
export interface CatalogEditorPrivateAssetCandidatePage {
	draftRevisionId: string;
	relation: CatalogEditorPrivateAssetRelation & {
		currentAsset: CatalogEditorPrivateAsset;
	};
	page: CatalogEditorPrivateAsset[];
}

export interface CatalogProductGraphV2VariantDraft {
	key: string;
	order: number;
	materialOptionKey?: string;
	sizeOptionKey?: string;
	retailPriceCents?: number;
	status: CatalogVariantStatus;
}

export interface CatalogProductGraphV2SetMemberDraft {
	key: string;
	order: number;
	mediaPlacementKey: string;
	printSourceKey: string;
}

export interface CatalogProductGraphV2WebMediaDraft {
	key: string;
	order: number;
	role: CatalogProductWebMediaRole;
	assetId: string;
	altText?: string;
}

export interface CatalogProductGraphV2PrintSourceDraft {
	key: string;
	order: number;
	assetId: string;
}

export interface CatalogProductGraphV2PaidFileDraft {
	key: string;
	assetId: string;
	version?: string;
}

export interface CatalogProductGraphV2Draft {
	schemaVersion: 2;
	productKind: CatalogProductKind;
	title?: string;
	slug?: string;
	description?: string;
	seoDescription?: string;
	currency: "usd";
	saleAvailability: CatalogSaleAvailability;
	fulfillmentMode?: CatalogPrintFulfillmentMode | "digital_delivery";
	shopPlacement: {
		featured: boolean;
		orderRank?: string;
	};
	printOptions?: {
		borderOptionsEnabled: boolean;
		frameOptionsEnabled: boolean;
		framePriceMultiplierBasisPoints: number;
	};
	variants?: CatalogProductGraphV2VariantDraft[];
	webMedia?: unknown[];
	printSources?: unknown[];
	setMembers?: CatalogProductGraphV2SetMemberDraft[];
	paidFile?: unknown;
}

export type CatalogProductStatus =
	| "unpublished"
	| "published"
	| "changes"
	| "discarded";
const CATALOG_PRICE_CENTS_MAXIMUM = 100_000_000;
const CATALOG_FRAME_MULTIPLIER_BASIS_POINTS_MAXIMUM = 1_000_000;
export const CATALOG_PRODUCT_VARIANT_LIMIT = 100;
export const CATALOG_PRODUCT_WEB_MEDIA_LIMIT = 50;
export const CATALOG_EDITABLE_GRAPH_PRODUCT_KINDS = [
	"print",
	"print_set",
	"postcard",
	"merchandise",
	"tapestry",
	"digital_download",
] as const satisfies readonly CatalogProductKind[];
export type CatalogEditableGraphProductKind =
	(typeof CATALOG_EDITABLE_GRAPH_PRODUCT_KINDS)[number];

function optionalProjectionValue(value: string | null | undefined) {
	return value ?? undefined;
}

function requirePrintFulfillmentMode(
	value: unknown,
): CatalogPrintFulfillmentMode {
	if (value === "production_partner" || value === "merchant_fulfilled")
		return value;
	throw new Error("A print must use physical fulfillment.");
}

function parseBoundedInteger(
	value: string | number | null | undefined,
	options: { field: string; maximum: number; optional: boolean },
) {
	if (value === null || value === undefined || value === "") {
		if (options.optional) return undefined;
		throw new Error(`${options.field} is required.`);
	}
	let parsed: number;
	if (typeof value === "number") parsed = value;
	else {
		if (!/^(?:0|[1-9]\d*)$/.test(value)) {
			throw new Error(`${options.field} must be a whole number.`);
		}
		parsed = Number(value);
	}
	if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > options.maximum) {
		throw new Error(
			`${options.field} must be a whole number between 0 and ${options.maximum}.`,
		);
	}
	return parsed;
}

function newOpaqueCatalogKey(prefix: CatalogProductKind | "variant") {
	if (!globalThis.crypto?.randomUUID) {
		throw new Error("Secure catalog identity generation is unavailable.");
	}
	return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function emptyCatalogProductDraft(): CatalogProductDraftForm {
	return {
		productKind: "print",
		fulfillmentMode: "production_partner",
		saleAvailability: "unavailable",
		borderOptionsEnabled: false,
		frameOptionsEnabled: false,
		framePriceMultiplierBasisPoints: 10_000,
		variants: [],
		setMembers: [],
	};
}

export function newCatalogProductGraphDraft(
	productKind: CatalogProductKind,
	input: {
		title: string;
		slug: string;
		retailPriceCents?: number;
	},
): CatalogProductGraphV2Draft {
	const fixedPrice = productKind === "postcard"
		|| productKind === "merchandise"
		|| productKind === "tapestry"
		|| productKind === "digital_download";
	if (
		fixedPrice
		&& (
			!Number.isSafeInteger(input.retailPriceCents)
			|| (input.retailPriceCents ?? 0) <= 0
			|| (input.retailPriceCents ?? 0) > CATALOG_PRICE_CENTS_MAXIMUM
		)
	) {
		throw new Error("Enter a starting retail price in whole cents.");
	}
	const variants: CatalogProductGraphV2VariantDraft[] = fixedPrice
		? [{
				key: "default",
				order: 0,
				retailPriceCents: input.retailPriceCents,
				status: "disabled",
			}]
		: [{ key: newCatalogVariantKey(), order: 0, status: "disabled" }];
	const common = {
		schemaVersion: 2 as const,
		productKind,
		title: input.title.trim(),
		slug: input.slug,
		currency: "usd" as const,
		saleAvailability: "unavailable" as const,
		shopPlacement: { featured: false },
		variants,
		webMedia: [],
	};
	if (productKind === "print" || productKind === "print_set") {
		return {
			...common,
			productKind,
			fulfillmentMode: "production_partner",
			printOptions: {
				borderOptionsEnabled: false,
				frameOptionsEnabled: false,
				framePriceMultiplierBasisPoints: 10_000,
			},
			printSources: [],
			...(productKind === "print_set" ? { setMembers: [] } : {}),
		};
	}
	return {
		...common,
		productKind,
		fulfillmentMode: productKind === "digital_download"
			? "digital_delivery"
			: "merchant_fulfilled",
	};
}

export function catalogProductDraftFromRevision(
	revision: CatalogProductEditorRevision | null | undefined,
): CatalogProductDraftForm {
	if (!revision) return emptyCatalogProductDraft();
	if (revision.productKind !== "print") {
		throw new Error(
			"The single-print editor cannot edit another product kind.",
		);
	}
	if (revision.currency !== "usd") {
		throw new Error("The single-print editor requires USD pricing.");
	}
	if (revision.variantCount !== revision.variants?.length) {
		throw new Error("The catalog variant count does not match its revision.");
	}
	if (
		revision.fulfillmentMode === undefined ||
		revision.saleAvailability === undefined ||
		revision.borderOptionsEnabled === undefined ||
		revision.frameOptionsEnabled === undefined ||
		revision.framePriceMultiplierBasisPoints === undefined
	) {
		throw new Error("The single-print editor requires a complete print revision.");
	}
	return {
		productKind: "print",
		title: optionalProjectionValue(revision.title),
		slug: optionalProjectionValue(revision.slug),
		description: optionalProjectionValue(revision.description),
		fulfillmentMode: requirePrintFulfillmentMode(revision.fulfillmentMode),
		saleAvailability: revision.saleAvailability,
		borderOptionsEnabled: revision.borderOptionsEnabled,
		frameOptionsEnabled: revision.frameOptionsEnabled,
		framePriceMultiplierBasisPoints: parseCatalogBasisPoints(
			revision.framePriceMultiplierBasisPoints,
		),
		variants: (revision.variants ?? []).map((variant) => ({
			key: variant.key,
			materialOptionKey: optionalProjectionValue(variant.materialOptionKey),
			sizeOptionKey: optionalProjectionValue(variant.sizeOptionKey),
			retailPriceCents: parseCatalogPriceCents(variant.retailPriceCents),
			status: variant.status,
		})),
		setMembers: [],
	};
}

export function canEditCatalogProductGraphKind(
	kind: CatalogProductKind | null | undefined,
): kind is CatalogEditableGraphProductKind {
	return CATALOG_EDITABLE_GRAPH_PRODUCT_KINDS.includes(
		kind as CatalogEditableGraphProductKind,
	);
}

export function catalogProductGraphDraftFromRevision(
	revision: CatalogProductEditorRevision | null | undefined,
): CatalogProductDraftForm {
	const draft = revision?.draft;
	if (!revision || !draft || !canEditCatalogProductGraphKind(draft.productKind)) {
		throw new Error(
			"The catalog graph editor requires an active editable product draft.",
		);
	}
	if (draft.currency !== "usd") {
		throw new Error("The catalog graph editor requires USD pricing.");
	}
	if (
		(draft.productKind === "print" || draft.productKind === "print_set")
		&& !draft.printOptions
	) {
		throw new Error("The print-family graph editor requires print options.");
	}
	const webMedia = catalogProductGraphWebMedia(draft.webMedia);
	return {
		productKind: draft.productKind,
		title: optionalProjectionValue(draft.title),
		slug: optionalProjectionValue(draft.slug),
		description: optionalProjectionValue(draft.description),
		fulfillmentMode: draft.productKind === "print" || draft.productKind === "print_set"
			? requirePrintFulfillmentMode(draft.fulfillmentMode)
			: "production_partner",
		saleAvailability: draft.saleAvailability,
		borderOptionsEnabled: draft.printOptions?.borderOptionsEnabled ?? false,
		frameOptionsEnabled: draft.printOptions?.frameOptionsEnabled ?? false,
		framePriceMultiplierBasisPoints: parseCatalogBasisPoints(
			draft.printOptions?.framePriceMultiplierBasisPoints ?? 10_000,
		),
		variants: [...(draft.variants ?? [])]
			.sort((left, right) => left.order - right.order)
			.map((variant) => ({
				key: variant.key,
				materialOptionKey: variant.materialOptionKey,
				sizeOptionKey: variant.sizeOptionKey,
				retailPriceCents: parseCatalogPriceCents(variant.retailPriceCents),
				status: variant.status,
			})),
		setMembers: [...(draft.setMembers ?? [])]
			.sort((left, right) => left.order - right.order)
			.map((member) => ({
				key: member.key,
				mediaPlacementKey: member.mediaPlacementKey,
				printSourceKey: member.printSourceKey,
			})),
		webMedia: canonicalCatalogProductWebMedia(webMedia).map((placement) => ({
			key: placement.key,
			role: placement.role,
			assetId: placement.assetId,
			altText: placement.altText,
		})),
		...(draft.productKind === "print" || draft.productKind === "print_set"
			? { printSources: catalogProductGraphPrintSources(draft.printSources) }
			: {}),
		...(draft.productKind === "digital_download"
			&& isUnknownRecord(draft.paidFile)
			&& typeof draft.paidFile.key === "string"
			&& typeof draft.paidFile.assetId === "string"
			? {
					paidFile: {
						key: draft.paidFile.key,
						assetId: draft.paidFile.assetId,
						...(typeof draft.paidFile.version === "string"
							? { version: draft.paidFile.version }
							: {}),
					},
				}
			: {}),
	};
}

export function copyCatalogProductDraft(
	source:
		| CatalogProductDraftForm
		| CatalogProductEditorRevision
		| null
		| undefined,
): CatalogProductDraftForm {
	if (!source) return emptyCatalogProductDraft();
	if ("revisionId" in source) return catalogProductDraftFromRevision(source);
	return {
		title: source.title,
		slug: source.slug,
		description: source.description,
		productKind: source.productKind,
		fulfillmentMode: requirePrintFulfillmentMode(source.fulfillmentMode),
		saleAvailability: source.saleAvailability,
		borderOptionsEnabled: source.borderOptionsEnabled,
		frameOptionsEnabled: source.frameOptionsEnabled,
		framePriceMultiplierBasisPoints: parseCatalogBasisPoints(
			source.framePriceMultiplierBasisPoints,
		),
		variants: source.variants.map((variant) => ({
			key: variant.key,
			materialOptionKey: variant.materialOptionKey,
			sizeOptionKey: variant.sizeOptionKey,
			retailPriceCents: parseCatalogPriceCents(variant.retailPriceCents),
			status: variant.status,
		})),
		setMembers: source.setMembers.map((member) => ({ ...member })),
		...(source.webMedia
			? { webMedia: source.webMedia.map((placement) => ({ ...placement })) }
			: {}),
		...(source.printSources
			? { printSources: source.printSources.map((relation) => ({ ...relation })) }
			: {}),
		...(source.paidFile ? { paidFile: { ...source.paidFile } } : {}),
	};
}

export function serializeCatalogProductDraft(draft: CatalogProductDraftForm) {
	return JSON.stringify({
		title: draft.title ?? null,
		slug: draft.slug ?? null,
		description: draft.description ?? null,
		productKind: draft.productKind,
		fulfillmentMode: draft.fulfillmentMode,
		saleAvailability: draft.saleAvailability,
		borderOptionsEnabled: draft.borderOptionsEnabled,
		frameOptionsEnabled: draft.frameOptionsEnabled,
		framePriceMultiplierBasisPoints: draft.framePriceMultiplierBasisPoints,
		variants: draft.variants.map((variant) => ({
			key: variant.key,
			materialOptionKey: variant.materialOptionKey ?? null,
			sizeOptionKey: variant.sizeOptionKey ?? null,
			retailPriceCents: variant.retailPriceCents ?? null,
			status: variant.status,
		})),
		setMembers: draft.setMembers.map((member) => ({
			key: member.key,
			mediaPlacementKey: member.mediaPlacementKey,
			printSourceKey: member.printSourceKey,
		})),
		...(draft.webMedia
			? {
					webMedia: draft.webMedia.map((placement) => ({
						key: placement.key,
						role: placement.role,
						assetId: placement.assetId,
						altText: placement.altText ?? null,
					})),
				}
			: {}),
		...(draft.printSources
			? { printSources: draft.printSources.map((relation) => ({ ...relation })) }
			: {}),
		...(draft.paidFile ? { paidFile: { ...draft.paidFile } } : {}),
	});
}

const CATALOG_PRODUCT_WEB_MEDIA_ROLES: readonly CatalogProductWebMediaRole[] = [
	"primary",
	"cover",
	"gallery",
	"set_member",
	"social_share",
];

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function catalogProductGraphWebMedia(
	value: unknown,
): CatalogProductGraphV2WebMediaDraft[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("Catalog web media must be an ordered list.");
	}
	return value.map((placement) => {
		if (
			!isUnknownRecord(placement)
			|| typeof placement.key !== "string"
			|| !Number.isSafeInteger(placement.order)
			|| (placement.order as number) < 0
			|| !CATALOG_PRODUCT_WEB_MEDIA_ROLES.includes(
				placement.role as CatalogProductWebMediaRole,
			)
			|| typeof placement.assetId !== "string"
			|| (placement.altText !== undefined && typeof placement.altText !== "string")
		) {
			throw new Error("Catalog web media contains an invalid placement.");
		}
		return {
			key: placement.key,
			order: placement.order as number,
			role: placement.role as CatalogProductWebMediaRole,
			assetId: placement.assetId,
			...(typeof placement.altText === "string"
				? { altText: placement.altText }
				: {}),
		};
	});
}

function catalogProductGraphPrintSources(
	value: unknown,
): CatalogProductGraphV2PrintSourceDraft[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("Catalog print sources must be an ordered list.");
	}
	return value.map((source) => {
		if (
			!isUnknownRecord(source)
			|| typeof source.key !== "string"
			|| !Number.isSafeInteger(source.order)
			|| (source.order as number) < 0
			|| typeof source.assetId !== "string"
		) {
			throw new Error("Catalog print sources contain an invalid relation.");
		}
		return {
			key: source.key,
			order: source.order as number,
			assetId: source.assetId,
		};
	});
}

function canonicalCatalogProductWebMedia<T extends {
	key: string;
	order?: number;
	role: CatalogProductWebMediaRole;
}>(placements: readonly T[]) {
	return [...placements].sort((left, right) =>
		CATALOG_PRODUCT_WEB_MEDIA_ROLES.indexOf(left.role)
			- CATALOG_PRODUCT_WEB_MEDIA_ROLES.indexOf(right.role)
			|| (left.order ?? 0) - (right.order ?? 0)
			|| left.key.localeCompare(right.key)
	);
}

function orderedCatalogProductWebMedia(
	placements: readonly CatalogProductWebMediaDraftForm[],
	members: readonly CatalogProductSetMemberDraftForm[],
) {
	const memberPlacementKeys = new Set(members.map((member) => member.mediaPlacementKey));
	const memberPlacements = new Map(
		placements
			.filter((placement) => placement.role === "set_member")
			.map((placement) => [placement.key, placement]),
	);
	if (
		memberPlacementKeys.size !== members.length
		|| memberPlacements.size !== memberPlacementKeys.size
		|| [...memberPlacementKeys].some((key) => !memberPlacements.has(key))
	) {
		throw new Error("Print-set member image relations must resolve exactly.");
	}
	return CATALOG_PRODUCT_WEB_MEDIA_ROLES.flatMap((role) =>
		role === "set_member"
			? members.map(
				(member) => memberPlacements.get(member.mediaPlacementKey) as CatalogProductWebMediaDraftForm,
			)
			: placements.filter((placement) => placement.role === role)
	);
}

export function alignCatalogProductWebMediaWithSetMembers(
	placements: readonly CatalogProductWebMediaDraftForm[],
	members: readonly CatalogProductSetMemberDraftForm[],
) {
	return orderedCatalogProductWebMedia(placements, members).map(
		(placement) => ({ ...placement }),
	);
}

function graphWebMediaFromForm(
	placements: readonly CatalogProductWebMediaDraftForm[],
	members: readonly CatalogProductSetMemberDraftForm[],
) {
	const roleOrders = new Map<CatalogProductWebMediaRole, number>();
	return alignCatalogProductWebMediaWithSetMembers(placements, members).map((placement) => {
		const order = roleOrders.get(placement.role) ?? 0;
		roleOrders.set(placement.role, order + 1);
		return {
			key: placement.key,
			order,
			role: placement.role,
			assetId: placement.assetId,
			...(placement.altText?.trim() ? { altText: placement.altText.trim() } : {}),
		};
	});
}

export function catalogProductGraphDraftFromForm(
	revision: CatalogProductEditorRevision,
	form: CatalogProductDraftForm,
): CatalogProductGraphV2Draft {
	const draft = revision.draft;
	if (!draft || !canEditCatalogProductGraphKind(draft.productKind)) {
		throw new Error("The catalog graph editor requires an editable graph draft.");
	}
	if (form.productKind !== draft.productKind) {
		throw new Error("The catalog graph editor cannot change product kind.");
	}
	const currentWebMedia = catalogProductGraphWebMedia(draft.webMedia);
	const currentPrintSources = form.printSources
		?? catalogProductGraphPrintSources(draft.printSources);
	const webMedia = form.webMedia ?? currentWebMedia.map((placement) => ({
		key: placement.key,
		role: placement.role,
		assetId: placement.assetId,
		altText: placement.altText,
	}));
	const orderedPrintSources = draft.productKind === "print_set"
		? (() => {
			if (currentPrintSources.length !== form.setMembers.length) {
				throw new Error("Print-set source relations must resolve exactly.");
			}
			const sourceKeys = new Set(form.setMembers.map((member) => member.printSourceKey));
			if (sourceKeys.size !== form.setMembers.length) {
				throw new Error("Print-set source relations must resolve exactly.");
			}
			return form.setMembers.map((member, order) => {
				const source = currentPrintSources.find(
					(candidate) => candidate.key === member.printSourceKey,
				);
				if (!source) throw new Error("Print-set source relations must resolve exactly.");
				return { ...source, order };
			});
		})()
		: currentPrintSources;
	return {
		...draft,
		title: form.title,
		slug: form.slug,
		description: form.description,
		...(draft.productKind === "print" || draft.productKind === "print_set"
			? { fulfillmentMode: requirePrintFulfillmentMode(form.fulfillmentMode) }
			: {}),
		saleAvailability: form.saleAvailability,
		webMedia: graphWebMediaFromForm(webMedia, form.setMembers),
		...(draft.productKind === "print" || draft.productKind === "print_set"
			? {
					printOptions: {
						borderOptionsEnabled: form.borderOptionsEnabled,
						frameOptionsEnabled: form.frameOptionsEnabled,
						framePriceMultiplierBasisPoints: parseCatalogBasisPoints(
							form.framePriceMultiplierBasisPoints,
						),
					},
				}
			: {}),
		variants: form.variants.map((variant, order) => ({
			key: variant.key,
			order,
			...(variant.materialOptionKey ? { materialOptionKey: variant.materialOptionKey } : {}),
			...(variant.sizeOptionKey ? { sizeOptionKey: variant.sizeOptionKey } : {}),
			...(variant.retailPriceCents !== undefined
				? { retailPriceCents: parseCatalogPriceCents(variant.retailPriceCents) }
				: {}),
			status: variant.status,
			})),
		...(draft.printSources !== undefined || form.printSources !== undefined
			? { printSources: currentPrintSources }
			: {}),
		...(draft.productKind === "print_set"
			? {
					printSources: orderedPrintSources,
					setMembers: form.setMembers.map((member, order) => ({
						key: member.key,
						order,
						mediaPlacementKey: member.mediaPlacementKey,
						printSourceKey: member.printSourceKey,
					})),
				}
			: {}),
		...(draft.productKind === "digital_download"
			&& form.paidFile
			? { paidFile: { ...form.paidFile } }
			: {}),
	};
}

export function newCatalogPrivateRelationKey(prefix: "print" | "download" | "member") {
	return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function defaultCatalogProductWebMediaRole(
	kind: CatalogProductKind,
	placements: readonly CatalogProductWebMediaDraftForm[],
): CatalogProductWebMediaRole {
	if (kind === "print") {
		return placements.some((placement) => placement.role === "primary")
			? "gallery"
			: "primary";
	}
	if (kind === "print_set") {
		if (placements.some((placement) => placement.role === "cover")) {
			throw new Error(
				"This print set already has a cover. Remove the current cover before choosing another.",
			);
		}
		return "cover";
	}
	return "gallery";
}

export function addCatalogProductWebMedia(
	placements: readonly CatalogProductWebMediaDraftForm[],
	asset: { _id: string; assetId: string },
	productKind: CatalogProductKind,
) {
	if (placements.length >= CATALOG_PRODUCT_WEB_MEDIA_LIMIT) {
		throw new Error(
			`A product cannot exceed ${CATALOG_PRODUCT_WEB_MEDIA_LIMIT} web images.`,
		);
	}
	const role = defaultCatalogProductWebMediaRole(productKind, placements);
	const matchingPlacements = placements.filter(
		(placement) => placement.role !== "social_share" && placement.assetId === asset._id,
	);
	const reusesSetMemberAsCover = productKind === "print_set"
		&& role === "cover"
		&& matchingPlacements.length > 0
		&& matchingPlacements.every((placement) => placement.role === "set_member");
	if (matchingPlacements.length > 0 && !reusesSetMemberAsCover) {
		throw new Error("This image is already attached to the product.");
	}
	const nextPlacement = {
			key: `media-${role}-${asset.assetId}`,
			role,
			assetId: asset._id,
			altText: "",
	};
	const roleIndex = CATALOG_PRODUCT_WEB_MEDIA_ROLES.indexOf(role);
	const insertionIndex = placements.findIndex(
		(placement) => CATALOG_PRODUCT_WEB_MEDIA_ROLES.indexOf(placement.role) > roleIndex,
	);
	const next = placements.map((placement) => ({ ...placement }));
	next.splice(insertionIndex < 0 ? next.length : insertionIndex, 0, nextPlacement);
	return next;
}

export function removeCatalogProductWebMedia(
	placements: readonly CatalogProductWebMediaDraftForm[],
	key: string,
	members: readonly CatalogProductSetMemberDraftForm[] = [],
) {
	if (members.some((member) => member.mediaPlacementKey === key)) {
		throw new Error(
			"This image belongs to a print-set member and cannot be removed until that complete member workflow is available.",
		);
	}
	return placements
		.filter((placement) => placement.key !== key)
		.map((placement) => ({ ...placement }));
}

export function moveCatalogProductWebMedia(
	placements: readonly CatalogProductWebMediaDraftForm[],
	key: string,
	direction: -1 | 1,
) {
	const index = placements.findIndex((placement) => placement.key === key);
	const placement = placements[index];
	if (!placement || placement.role === "set_member") return placements;
	const sameRoleIndexes = placements.flatMap((candidate, candidateIndex) =>
		candidate.role === placement.role ? [candidateIndex] : []
	);
	const roleIndex = sameRoleIndexes.indexOf(index);
	const destination = sameRoleIndexes[roleIndex + direction];
	if (destination === undefined) return placements;
	const reordered = placements.map((candidate) => ({ ...candidate }));
	[reordered[index], reordered[destination]] = [
		reordered[destination],
		reordered[index],
	];
	return reordered;
}

export function catalogProductLabel(product: CatalogProductEditorSummary) {
	return (
		product.draft?.title?.trim() ||
		product.published?.title?.trim() ||
		product.slug ||
		`untitled ${catalogProductKindLabel(product.productKind)}`
	);
}

export function catalogProductStatus(
	product: CatalogProductEditorSummary,
): CatalogProductStatus {
	if (product.published) {
		return product.draft && product.draft.revisionId !== product.published.revisionId
			? "changes"
			: "published";
	}
	return product.draft ? "unpublished" : "discarded";
}

export function slugifyCatalogProductTitle(value: string) {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96)
		.replace(/-+$/g, "");
}

export function slugifyCatalogOptionKey(value: string) {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120)
		.replace(/-+$/g, "");
}

export function newCatalogProductKey(kind: CatalogProductKind = "print") {
	return newOpaqueCatalogKey(kind);
}
function newCatalogVariantKey() {
	return newOpaqueCatalogKey("variant");
}
export function newCatalogProductVariant(): CatalogProductVariantDraftForm {
	return { key: newCatalogVariantKey(), status: "enabled" };
}

export function addCatalogProductVariant(
	variants: readonly CatalogProductVariantDraftForm[],
	variant: CatalogProductVariantDraftForm = newCatalogProductVariant(),
) {
	if (variants.length >= CATALOG_PRODUCT_VARIANT_LIMIT) {
		throw new Error(
			`A print cannot exceed ${CATALOG_PRODUCT_VARIANT_LIMIT} variants.`,
		);
	}
	if (variants.some(({ key }) => key === variant.key)) {
		throw new Error("Catalog variant keys must be unique.");
	}
	return [...variants, { ...variant }];
}

export function removeCatalogProductVariant(
	variants: readonly CatalogProductVariantDraftForm[],
	key: string,
) {
	const index = variants.findIndex((variant) => variant.key === key);
	if (index < 0) return variants;
	return [...variants.slice(0, index), ...variants.slice(index + 1)];
}

export function moveCatalogProductVariant(
	variants: readonly CatalogProductVariantDraftForm[],
	index: number,
	direction: -1 | 1,
) {
	const destination = index + direction;
	if (
		index < 0 ||
		index >= variants.length ||
		destination < 0 ||
		destination >= variants.length
	) {
		return variants;
	}
	const reordered = variants.map((variant) => ({ ...variant }));
	[reordered[index], reordered[destination]] = [
		reordered[destination],
		reordered[index],
	];
	return reordered;
}

export function moveCatalogProductSetMember(
	members: readonly CatalogProductSetMemberDraftForm[],
	index: number,
	direction: -1 | 1,
) {
	const destination = index + direction;
	if (
		index < 0 ||
		index >= members.length ||
		destination < 0 ||
		destination >= members.length
	) {
		return members;
	}
	const reordered = members.map((member) => ({ ...member }));
	[reordered[index], reordered[destination]] = [
		reordered[destination],
		reordered[index],
	];
	return reordered;
}

export function parseCatalogPriceCents(
	value: string | number | null | undefined,
) {
	return parseBoundedInteger(value, {
		field: "Retail price cents",
		maximum: CATALOG_PRICE_CENTS_MAXIMUM,
		optional: true,
	});
}

/** Parse literal basis points: 10,000 = 1x and 20,000 = 2x. */
export function parseCatalogBasisPoints(
	value: string | number | null | undefined,
) {
	const parsed = parseBoundedInteger(value, {
		field: "Frame price multiplier basis points",
		maximum: CATALOG_FRAME_MULTIPLIER_BASIS_POINTS_MAXIMUM,
		optional: false,
	});
	if (parsed === undefined)
		throw new Error("Frame price multiplier basis points is required.");
	return parsed;
}

export function catalogProductKindLabel(kind: CatalogProductKind) {
	switch (kind) {
		case "print":
			return "print";
		case "print_set":
			return "print set";
		case "postcard":
			return "postcard";
		case "merchandise":
			return "merchandise";
		case "tapestry":
			return "tapestry";
		case "digital_download":
			return "digital download";
	}
}

export function catalogProductEditorTitle(
	revision: CatalogProductEditorRevision | null | undefined,
) {
	return revision?.title ?? revision?.draft?.title ?? null;
}

export function catalogProductEditorDescription(
	revision: CatalogProductEditorRevision | null | undefined,
) {
	return revision?.description ?? revision?.draft?.description ?? null;
}

export function catalogProductEditorSaleAvailability(
	revision: CatalogProductEditorRevision | null | undefined,
) {
	return revision?.saleAvailability ?? revision?.draft?.saleAvailability ?? null;
}

export function catalogProductEditorVariantCount(
	revision: CatalogProductEditorRevision | null | undefined,
) {
	return revision?.variantCount ?? revision?.variants?.length ??
		revision?.draft?.variants?.length ?? 0;
}
