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

export interface CatalogEditorMediaAsset {
	assetId?: string;
	filename?: string | null;
	width?: number | null;
	height?: number | null;
	altText?: string | null;
	url?: string | null;
}

export interface CatalogEditorMediaRelation {
	placementKey?: string;
	relationKey?: string;
	asset: CatalogEditorMediaAsset;
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

export type CatalogProductStatus = "draft" | "discarded";
const CATALOG_PRICE_CENTS_MAXIMUM = 100_000_000;
const CATALOG_FRAME_MULTIPLIER_BASIS_POINTS_MAXIMUM = 1_000_000;
export const CATALOG_PRODUCT_VARIANT_LIMIT = 100;
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
	return {
		...draft,
		title: form.title,
		slug: form.slug,
		description: form.description,
		...(draft.productKind === "print" || draft.productKind === "print_set"
			? { fulfillmentMode: requirePrintFulfillmentMode(form.fulfillmentMode) }
			: {}),
		saleAvailability: form.saleAvailability,
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
		...(draft.productKind === "print_set"
			? {
					setMembers: form.setMembers.map((member, order) => ({
						key: member.key,
						order,
						mediaPlacementKey: member.mediaPlacementKey,
						printSourceKey: member.printSourceKey,
					})),
				}
			: {}),
	};
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
	return product.draft ? "draft" : "discarded";
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
