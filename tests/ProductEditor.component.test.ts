import { readFileSync } from "node:fs";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductPage from "../src/lib/pages/editor/ProductPage.svelte";
import ProductsPage from "../src/lib/pages/editor/ProductsPage.svelte";
import ProductPageNavigationHarness from "./ProductPageNavigationHarness.svelte";

const productWorkbenchSource = readFileSync(
	"src/lib/pages/editor/ProductWorkbench.svelte",
	"utf8",
);
const productVariantsSource = readFileSync(
	"src/lib/pages/editor/CatalogProductVariants.svelte",
	"utf8",
);

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
	artworkUpload: vi.fn(),
	mutation: vi.fn(async (ref: { name?: string }) =>
		ref.name === "catalog:createDraft"
			? { productId: "new-product", revisionId: "new-revision" }
			: {
					productId: "product-1",
					revisionId: "saved-revision",
					draftRevisionId: null,
				},
	),
	goto: vi.fn(async () => {}),
	listData: [] as unknown[],
	listError: undefined as Error | undefined,
	detailData: undefined as unknown,
	detailError: undefined as Error | undefined,
	mediaListData: undefined as unknown,
	mediaListError: undefined as Error | undefined,
	mediaPlacedData: [] as unknown[],
	mediaPlacedError: undefined as Error | undefined,
	candidateData: undefined as unknown,
	candidateError: undefined as Error | undefined,
	candidateArgs: undefined as unknown,
	notifyQuery: undefined as (() => void) | undefined,
	enabledKinds: ["print"] as string[],
	graphApiEnabled: false,
	privateAssetEnabled: false,
	publicationEnabled: false,
	publicationRefsEnabled: false,
	publicShopEnabled: false,
	mediaEnabled: false,
	mediaRegisterEnabled: true,
	marginEnabled: false,
	marginCalculator: vi.fn((input: { frameMarkupMultiplier?: number }) => ({
		summary: "Wholesale: $3.19 · Stripe fee: $1.03 · Take-home: $20.78 (83.1%)",
		...(input.frameMarkupMultiplier !== undefined
			? { framedSummary: "Framed estimate: $42.00 take-home" }
			: {}),
	})),
	variantOptionsEnabled: false,
	variantOptionResolver: vi.fn(({ materialOptionKey }: { materialOptionKey?: string }) => {
		const materials = [
			{ value: "archival-matte", label: "Archival Matte" },
			{ value: "canvas-black-1.25", label: "Canvas Black — 1.25\" stretch" },
		];
		const sizes = materialOptionKey === "canvas-black-1.25"
			? [{ value: "8x10", label: "8×10" }, { value: "11x14", label: "11×14" }]
			: !materialOptionKey || materialOptionKey === "archival-matte"
				? [{ value: "4x6", label: "4×6" }, { value: "8x10", label: "8×10" }]
				: [];
		return { materials, sizes };
	}),
	refs: {
		listForEditor: { name: "catalog:listForEditor" },
		getEditorState: { name: "catalog:getEditorState" },
		createDraft: { name: "catalog:createDraft" },
		saveDraft: { name: "catalog:saveDraft" },
		discardDraft: { name: "catalog:discardDraft" },
		listDraftPrivateAssetCandidates: { name: "catalog:listDraftPrivateAssetCandidates" },
		replaceDraftPrivateAsset: { name: "catalog:replaceDraftPrivateAsset" },
		publishDraft: { name: "catalog:publishDraft" },
		unpublish: { name: "catalog:unpublish" },
	},
	mediaRefs: {
		listForEditor: { name: "media:listForEditor" },
		getManyForEditor: { name: "media:getManyForEditor" },
		registerReadyWebAsset: { name: "media:registerReadyWebAsset" },
	},
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("../src/lib/cmsMediaUpload", () => ({
	uploadCmsMediaFile: mocks.upload,
}));
vi.mock("../src/lib/catalogProductArtworkUpload", () => ({
	uploadCatalogProductArtwork: mocks.artworkUpload,
}));
vi.mock("convex-svelte", async () => {
	const { createSubscriber } = await import("svelte/reactivity");
	const subscribe = createSubscriber((update) => {
		mocks.notifyQuery = update;
		return () => {
			if (mocks.notifyQuery === update) mocks.notifyQuery = undefined;
		};
	});
	return {
		useQuery: (ref: { name?: string }, args?: unknown) => ({
			get data() {
				subscribe();
				if (ref.name === "catalog:listForEditor") {
					const resolvedArgs = typeof args === "function" ? (args as () => unknown)() : args;
					if (resolvedArgs === "skip") return undefined;
					const kind = typeof resolvedArgs === "object" && resolvedArgs !== null && "productKind" in resolvedArgs
						? (resolvedArgs as { productKind: string }).productKind
						: undefined;
					return kind && Array.isArray(mocks.listData)
						? mocks.listData.filter((item) => (item as { productKind?: string }).productKind === kind)
						: mocks.listData;
				}
				if (ref.name === "media:listForEditor") return mocks.mediaListData;
				if (ref.name === "media:getManyForEditor") return mocks.mediaPlacedData;
				if (ref.name === "catalog:listDraftPrivateAssetCandidates") {
					mocks.candidateArgs = typeof args === "function"
						? (args as () => unknown)()
						: args;
					return mocks.candidateData;
				}
				return mocks.detailData;
			},
			get error() {
				subscribe();
				if (ref.name === "catalog:listForEditor") return mocks.listError;
				if (ref.name === "media:listForEditor") return mocks.mediaListError;
				if (ref.name === "media:getManyForEditor") return mocks.mediaPlacedError;
				if (ref.name === "catalog:listDraftPrivateAssetCandidates") return mocks.candidateError;
				return mocks.detailError;
			},
		}),
	};
});
vi.mock("../src/lib/adminClient", () => ({
	useAdminClient: () => ({ mutation: mocks.mutation }),
}));
vi.mock("../src/lib/config", () => ({
	getAdminConfig: () => ({
		siteUrl: "https://site.example",
		siteName: "test site",
		fromEmail: "test@example.com",
		isCreator: true,
		api: {
			catalogProducts: mocks.refs,
			...(mocks.graphApiEnabled
				? {
						catalogProductGraphs: {
							listForEditor: mocks.refs.listForEditor,
							getEditorState: mocks.refs.getEditorState,
							createDraft: mocks.refs.createDraft,
							saveDraft: mocks.refs.saveDraft,
							discardDraft: mocks.refs.discardDraft,
							...(mocks.privateAssetEnabled
								? {
										listDraftPrivateAssetCandidates: mocks.refs.listDraftPrivateAssetCandidates,
										replaceDraftPrivateAsset: mocks.refs.replaceDraftPrivateAsset,
									}
								: {}),
							...(mocks.publicationRefsEnabled
								? {
										publishDraft: mocks.refs.publishDraft,
										unpublish: mocks.refs.unpublish,
									}
								: {}),
						},
					}
				: {}),
			...(mocks.mediaEnabled
				? {
						mediaAssets: {
							listForEditor: mocks.mediaRefs.listForEditor,
							getManyForEditor: mocks.mediaRefs.getManyForEditor,
							...(mocks.mediaRegisterEnabled
								? { registerReadyWebAsset: mocks.mediaRefs.registerReadyWebAsset }
								: {}),
						},
					}
				: {}),
		},
		editor: {
			products: {
				baseHref: "/admin/editor/products",
				enabledKinds: mocks.enabledKinds,
				...(mocks.publicationEnabled ? { publicationEnabled: true } : {}),
				...(mocks.publicShopEnabled ? { publicShopEnabled: true } : {}),
				...(mocks.privateAssetEnabled
					? {
							privateAssetReplacementEnabled: true,
							privateAssetUpload: {
								prepareEndpoint: "/api/admin/catalog/private-upload/prepare",
								completeEndpoint: "/api/admin/catalog/private-upload/complete",
							},
						}
					: {}),
				...(mocks.mediaEnabled
					? {
							mediaBaseUrl: "https://media.example",
							uploadEndpoint: "/api/admin/media",
						}
					: {}),
				...(mocks.marginEnabled
					? { marginCalculator: mocks.marginCalculator }
					: {}),
				...(mocks.variantOptionsEnabled
					? { variantOptionResolver: mocks.variantOptionResolver }
					: {}),
			},
		},
	}),
}));

const components: ReturnType<typeof mount>[] = [];
const revision = {
	revisionId: "revision-1",
	schemaVersion: 1,
	productKind: "print",
	currency: "usd",
	title: "Lake print",
	slug: "lake-print",
	description: "A quiet lake.",
	fulfillmentMode: "production_partner",
	saleAvailability: "available",
	borderOptionsEnabled: false,
	frameOptionsEnabled: false,
	framePriceMultiplierBasisPoints: 10000,
	variantCount: 1,
	checksum: "checksum",
	source: "admin",
	createdAt: 1,
	variants: [
		{
			key: "variant-original",
			order: 0,
			materialOptionKey: "fine-art-paper",
			sizeOptionKey: "8x10",
			retailPriceCents: 2500,
			status: "enabled",
		},
	],
};
const graphRevision = {
	revisionId: "graph-revision-1",
	schemaVersion: 2,
	productKind: "print",
	createdAt: 1,
	draft: {
		schemaVersion: 2,
		productKind: "print",
		title: "Avant Alien 2.2",
		slug: "avant-alien-2-2",
		description: "Imported print description.",
		seoDescription: "Imported SEO copy.",
		currency: "usd",
		fulfillmentMode: "production_partner",
		saleAvailability: "available",
		shopPlacement: { featured: true, orderRank: "a0" },
		printOptions: {
			borderOptionsEnabled: true,
			frameOptionsEnabled: false,
			framePriceMultiplierBasisPoints: 10_000,
		},
		variants: [
			{
				key: "variant-original",
				order: 0,
				materialOptionKey: "fine-art-paper",
				sizeOptionKey: "8x10",
				retailPriceCents: 2500,
				status: "enabled",
			},
		],
		webMedia: [
			{
				key: "web-primary",
				order: 0,
				role: "primary",
				assetId: "media-1",
				altText: "A luminous print.",
			},
		],
		printSources: [{ key: "print-source", order: 0, assetId: "source-1" }],
	},
	webMediaAssets: [{ placementKey: "web-primary", asset: { mediaAssetId: "media-1" } }],
	printSourceAssets: [{ relationKey: "print-source", asset: { assetId: "source-1" } }],
	paidFileAsset: null,
};
const fixedPriceGraphRevision = {
	revisionId: "graph-revision-2",
	schemaVersion: 2,
	productKind: "tapestry",
	createdAt: 1,
	draft: {
		schemaVersion: 2,
		productKind: "tapestry",
		title: "Soft Portal",
		slug: "soft-portal",
		description: "Imported tapestry description.",
		seoDescription: "Imported tapestry SEO copy.",
		currency: "usd",
		fulfillmentMode: "merchant_fulfilled",
		saleAvailability: "available",
		shopPlacement: { featured: false, orderRank: "c0" },
		variants: [
			{
				key: "default",
				order: 0,
				retailPriceCents: 8000,
				status: "enabled",
			},
		],
		webMedia: [
			{
				key: "web-primary",
				order: 0,
				role: "gallery",
				assetId: "media-2",
				altText: "A tapestry.",
			},
		],
	},
	webMediaAssets: [{ placementKey: "web-primary", asset: { mediaAssetId: "media-2" } }],
	printSourceAssets: [],
	paidFileAsset: null,
};
const printSetGraphRevision = {
	revisionId: "graph-revision-set",
	schemaVersion: 2,
	productKind: "print_set",
	createdAt: 1,
	draft: {
		schemaVersion: 2,
		productKind: "print_set",
		title: "Twin Moons",
		slug: "twin-moons",
		description: "Imported print set.",
		seoDescription: "Imported print set SEO copy.",
		currency: "usd",
		fulfillmentMode: "production_partner",
		saleAvailability: "available",
		shopPlacement: { featured: true, orderRank: "d0" },
		printOptions: {
			borderOptionsEnabled: true,
			frameOptionsEnabled: false,
			framePriceMultiplierBasisPoints: 10_000,
		},
		variants: [
			{
				key: "variant-set",
				order: 0,
				retailPriceCents: 18000,
				status: "enabled",
			},
		],
		webMedia: [
			{
				key: "cover",
				order: 0,
				role: "cover",
				assetId: "media-cover",
				altText: "A print set.",
			},
			{
				key: "member-a-media",
				order: 0,
				role: "set_member",
				assetId: "media-a",
				altText: "First print.",
			},
			{
				key: "member-b-media",
				order: 1,
				role: "set_member",
				assetId: "media-b",
				altText: "Second print.",
			},
		],
		printSources: [
			{ key: "member-a-source", order: 0, assetId: "source-a" },
			{ key: "member-b-source", order: 1, assetId: "source-b" },
		],
		setMembers: [
			{
				key: "member-a",
				order: 0,
				mediaPlacementKey: "member-a-media",
				printSourceKey: "member-a-source",
			},
			{
				key: "member-b",
				order: 1,
				mediaPlacementKey: "member-b-media",
				printSourceKey: "member-b-source",
			},
		],
	},
	webMediaAssets: [
		{ placementKey: "cover", asset: { mediaAssetId: "media-cover" } },
		{ placementKey: "member-a-media", asset: { mediaAssetId: "media-a" } },
		{ placementKey: "member-b-media", asset: { mediaAssetId: "media-b" } },
	],
	printSourceAssets: [
		{ relationKey: "member-a-source", asset: { assetId: "source-a" } },
		{ relationKey: "member-b-source", asset: { assetId: "source-b" } },
	],
	paidFileAsset: null,
};
const digitalDownloadGraphRevision = {
	revisionId: "graph-revision-download",
	schemaVersion: 2,
	productKind: "digital_download",
	createdAt: 1,
	draft: {
		schemaVersion: 2,
		productKind: "digital_download",
		title: "Time-aware theme",
		slug: "time-aware-theme",
		description: "Imported digital download.",
		seoDescription: "Imported download SEO copy.",
		currency: "usd",
		fulfillmentMode: "digital_delivery",
		saleAvailability: "available",
		shopPlacement: { featured: false, orderRank: "e0" },
		variants: [
			{
				key: "default",
				order: 0,
				retailPriceCents: 1200,
				status: "enabled",
			},
		],
		webMedia: [
			{
				key: "web-primary",
				order: 0,
				role: "gallery",
				assetId: "media-download",
				altText: "A time-aware theme preview.",
			},
		],
		paidFile: {
			key: "download",
			assetId: "paid-file-1",
			version: "1.0.0",
		},
	},
	webMediaAssets: [
		{ placementKey: "web-primary", asset: { mediaAssetId: "media-download" } },
	],
	printSourceAssets: [],
	paidFileAsset: {
		relationKey: "download",
		asset: {
			kind: "paid_digital_file",
			assetId: "paid-file-1",
			status: "verified",
			originalFilename: "time-aware-theme-v1.0.0.zip",
			mimeType: "application/zip",
			sizeBytes: 1_572_864,
			version: "1.0.0",
			createdAt: 1_750_000_000_000,
		},
	},
};

function privatePrintAsset(assetId: string, originalFilename: string) {
	return {
		kind: "print_source" as const,
		assetId,
		status: "verified" as const,
		originalFilename,
		mimeType: "image/png" as const,
		sizeBytes: 24,
		widthPixels: 1,
		heightPixels: 1,
		createdAt: 1_750_000_000_000,
	};
}

function encodedPng() {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	new DataView(bytes.buffer).setUint32(16, 1);
	new DataView(bytes.buffer).setUint32(20, 1);
	return bytes;
}

function encodedZip() {
	return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
}

function mediaAsset(
	_id: string,
	assetId: string,
	originalFilename: string,
) {
	return {
		_id,
		assetId,
		originalFilename,
		status: "ready" as const,
		source: {
			contentType: "image/jpeg",
			sizeBytes: 1_000,
			width: 1200,
			height: 800,
		},
		derivatives: {
			thumb: { key: `sites/site.example/web/${assetId}/thumb.webp`, width: 320, height: 213 },
			card: { key: `sites/site.example/web/${assetId}/card.webp`, width: 768, height: 512 },
		},
		createdAt: 1,
	};
}

async function mountList() {
	components.push(mount(ProductsPage, { target: document.body }));
	await tick();
}
async function mountDetail() {
	components.push(
		mount(ProductPage, {
			target: document.body,
			props: { productId: "product-1" },
		}),
	);
	await tick();
	await tick();
}
function button(label: string) {
	const visibleLabel = label === "publish" ? "publish to Convex CMS"
		: label === "unpublish" ? "unpublish from Convex CMS" : label;
	return Array.from(document.querySelectorAll("button")).find(
		(item) => item.textContent?.trim() === visibleLabel,
	) as HTMLButtonElement | undefined;
}
function input(label: string) {
	return Array.from(document.querySelectorAll("label"))
		.find((item) => item.textContent?.includes(label))
		?.querySelector("input") as HTMLInputElement | null;
}
function checkbox(label: string) {
	return Array.from(document.querySelectorAll("label"))
		.find((item) => item.textContent?.includes(label))
		?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
}
function segmentedChoice(groupLabel: string, optionLabel: string) {
	const fieldset = Array.from(document.querySelectorAll("fieldset")).find(
		(item) => item.querySelector("legend")?.textContent?.trim() === groupLabel,
	);
	return Array.from(fieldset?.querySelectorAll("label") ?? [])
		.find((item) => item.textContent?.trim() === optionLabel)
		?.querySelector('input[type="radio"]') as HTMLInputElement | null;
}
function chooseFile(input: HTMLInputElement, file: File) {
	chooseFiles(input, [file]);
}
function chooseFiles(input: HTMLInputElement, files: File[]) {
	Object.defineProperty(input, "files", {
		configurable: true,
		value: Object.assign(files, {
			item: (index: number) => files[index] ?? null,
		}),
	});
	input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function updateDetailQuery(value: unknown) {
	mocks.detailData = value;
	mocks.notifyQuery?.();
	await tick();
	await tick();
}
function enablePublication() {
	mocks.graphApiEnabled = true;
	mocks.publicationEnabled = true;
	mocks.publicationRefsEnabled = true;
}
function graphDetail(
	draft: typeof graphRevision | null = graphRevision,
	published: typeof graphRevision | null = null,
	updatedAt = 10,
) {
	return {
		productId: "product-1",
		productKey: "sanity.catalog.print",
		productKind: "print",
		graphVersion: 2,
		slug: "avant-alien-2-2",
		draft,
		published,
		updatedAt,
		publishedAt: published ? updatedAt : null,
	};
}

const completenessErrors = [
	["Product title is required before publishing", "product name or URL name"],
	["Product slug is required before publishing", "product name or URL name"],
	["An available product needs an enabled variant before publishing", "Enable a variant"],
	["Every enabled variant needs a retail price before publishing", "retail price"],
	["Every enabled print variant needs a material and size before publishing", "supported material and size"],
	["Every enabled print variant needs a supported material and size pair", "supported material and size"],
	["A print needs one verified print source before publishing", "product artwork"],
	["A non-empty print set is required before publishing", "artwork image"],
	["A digital download needs a verified paid file before publishing", "customer download ZIP"],
	["Catalog print needs required display media before publishing", "display media and alternative text"],
] as const;

describe("draft-only product editor", () => {
	beforeEach(() => {
		mocks.upload.mockReset();
		mocks.artworkUpload.mockReset();
		mocks.mutation.mockClear();
		mocks.goto.mockClear();
		mocks.mutation.mockImplementation(async (ref: { name?: string }) =>
			ref.name === "catalog:createDraft"
				? { productId: "new-product", revisionId: "new-revision" }
				: {
						productId: "product-1",
						revisionId: "saved-revision",
						draftRevisionId: null,
					},
		);
		mocks.listData = [];
		mocks.listError = undefined;
		mocks.detailData = undefined;
		mocks.detailError = undefined;
		mocks.mediaListData = undefined;
		mocks.mediaListError = undefined;
		mocks.mediaPlacedData = [];
		mocks.mediaPlacedError = undefined;
		mocks.candidateData = undefined;
		mocks.candidateError = undefined;
		mocks.candidateArgs = undefined;
		mocks.enabledKinds = ["print"];
		mocks.graphApiEnabled = false;
		mocks.privateAssetEnabled = false;
		mocks.publicationEnabled = false;
		mocks.publicationRefsEnabled = false;
		mocks.publicShopEnabled = false;
		mocks.mediaEnabled = false;
		mocks.mediaRegisterEnabled = true;
		mocks.marginEnabled = false;
		mocks.marginCalculator.mockClear();
		mocks.variantOptionsEnabled = false;
		mocks.variantOptionResolver.mockClear();
	});
	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("labels active and discarded identities honestly and creates a private print draft", async () => {
		mocks.listData = [
			{
				productId: "product-1",
				productKey: "print-one",
				productKind: "print",
				slug: "lake-print",
				draft: {
					revisionId: "revision-1",
					title: "Lake print",
					saleAvailability: "available",
					variantCount: 1,
					createdAt: 1,
				},
				published: null,
				createdAt: 1,
				updatedAt: 1,
				publishedAt: null,
			},
			{
				productId: "product-2",
				productKey: "print-two",
				productKind: "print",
				slug: null,
				draft: null,
				published: null,
				createdAt: 1,
				updatedAt: 2,
				publishedAt: null,
			},
		];
		await mountList();
		expect(document.querySelector(".workbench-heading p")).toBeNull();
		expect(
			Array.from(
				document.querySelectorAll(".status"),
				(item) => item.textContent,
			),
		).toEqual(["unpublished", "discarded"]);
		(document.querySelector(".new-product") as HTMLButtonElement).click();
		await tick();
		expect(document.querySelector(".create-panel select")).toBeNull();
		expect(document.querySelector('[role="combobox"][aria-labelledby^="new-product-type-label"]')).not.toBeNull();
		const name = input("product name");
		expect(name).not.toBeNull();
		name!.value = "Winter Light";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.createDraft,
			expect.objectContaining({
				siteUrl: "https://site.example",
				draft: expect.objectContaining({
					title: "Winter Light",
					slug: "winter-light",
				}),
			}),
		);
		expect(mocks.goto).toHaveBeenCalledWith(
			"/admin/editor/products/new-product",
		);
	});

	it("creates a real Graph V2 product kind without redundant workspace copy", async () => {
		mocks.graphApiEnabled = true;
		mocks.enabledKinds = ["digital_download"];
		mocks.publicationEnabled = true;
		mocks.publicationRefsEnabled = true;
		mocks.publicShopEnabled = true;
		await mountList();
		expect(document.querySelector(".workbench-heading p")).toBeNull();
		button("new")?.click();
		await tick();
		const name = input("product name")!;
		name.value = "Night Preset";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("starting price (USD)")!;
		price.value = "24.00";
		price.dispatchEvent(new Event("input", { bubbles: true }));
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.createDraft,
			expect.objectContaining({
				siteUrl: "https://site.example",
				draft: expect.objectContaining({
					schemaVersion: 2,
					productKind: "digital_download",
					title: "Night Preset",
					slug: "night-preset",
					fulfillmentMode: "digital_delivery",
					saleAvailability: "unavailable",
					variants: [{
						key: "default",
						order: 0,
						retailPriceCents: 2400,
						status: "disabled",
					}],
				}),
			}),
		);
	});

	it("filters the enabled taxonomy and keeps the selected record current", async () => {
		mocks.graphApiEnabled = true;
		mocks.enabledKinds = ["print", "tapestry"];
		mocks.listData = [
			{
				productId: "product-1",
				productKey: "sanity.catalog.print",
				productKind: "print",
				slug: "lake-print",
				draft: { revisionId: "print-revision", title: "Lake print", variantCount: 1, createdAt: 1 },
				published: null,
				createdAt: 1,
				updatedAt: 1,
				publishedAt: null,
			},
			{
				productId: "product-2",
				productKey: "sanity.catalog.tapestry",
				productKind: "tapestry",
				slug: "soft-portal",
				draft: null,
				published: { revisionId: "tapestry-revision", title: "Soft Portal", variantCount: 1, createdAt: 1 },
				createdAt: 1,
				updatedAt: 2,
				publishedAt: null,
			},
			{
				productId: "product-3",
				productKey: "sanity.catalog.print.changed",
				productKind: "print",
				slug: "changed-print",
				draft: { revisionId: "new-draft", title: "Changed print", variantCount: 1, createdAt: 2 },
				published: { revisionId: "old-published", title: "Changed print", variantCount: 1, createdAt: 1 },
				createdAt: 1,
				updatedAt: 3,
				publishedAt: 2,
			},
		];
		mocks.detailData = graphDetail();
		await mountDetail();

		expect(document.querySelector('[aria-current="page"]')?.getAttribute("href"))
			.toBe("/admin/editor/products/product-1");
		const tapestry = Array.from(document.querySelectorAll<HTMLButtonElement>(".kind-filters button"))
			.find((item) => item.textContent?.includes("tapestries"));
		tapestry?.click();
		await tick();
		expect(Array.from(document.querySelectorAll(".product-list strong"), (item) => item.textContent))
			.toEqual(["Soft Portal"]);
		expect(document.querySelector(".new-product")).not.toBeNull();
		expect(Array.from(document.querySelectorAll(".status-filters button"), (item) => item.textContent))
			.toEqual(["all", "unpublished", "published"]);
		const allKinds = Array.from(document.querySelectorAll<HTMLButtonElement>(".kind-filters button"))
			.find((item) => item.textContent?.includes("all products"));
		allKinds?.click();
		const draftStatus = Array.from(document.querySelectorAll<HTMLButtonElement>(".status-filters button"))
			.find((item) => item.textContent === "unpublished");
		draftStatus?.click();
		await tick();
		expect(Array.from(document.querySelectorAll(".product-list strong"), (item) => item.textContent))
			.toEqual(["Lake print"]);
		const publishedStatus = Array.from(document.querySelectorAll<HTMLButtonElement>(".status-filters button"))
			.find((item) => item.textContent === "published");
		publishedStatus?.click();
		await tick();
		expect(Array.from(document.querySelectorAll(".product-list strong"), (item) => item.textContent))
			.toEqual(["Changed print", "Soft Portal"]);
		const search = document.querySelector<HTMLInputElement>('.search-field input[type="search"]');
		search!.value = "missing";
		search!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.body.textContent).toContain("No products match these filters.");
	});

	it("distinguishes collection loading from empty and failure states", async () => {
		mocks.listData = undefined as unknown as unknown[];
		await mountList();
		expect(document.querySelector('[role="status"]')?.textContent).toContain("loading product drafts");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		mocks.listData = [];
		await mountList();
		expect(document.body.textContent).toContain("No product drafts yet.");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		mocks.listError = new Error("list unavailable");
		await mountList();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not load product drafts");
	});

	it("regenerates a manually edited URL name from the product name", async () => {
		await mountList();
		button("new")?.click();
		await tick();
		const name = input("product name")!;
		const slug = document.querySelector<HTMLInputElement>("#new-product-slug")!;
		name.value = "Winter Light";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		slug.value = "custom-url";
		slug.dispatchEvent(new Event("input", { bubbles: true }));
		name.value = "Winter Blue";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		expect(slug.value).toBe("custom-url");
		await tick();
		button("generate url")?.click();
		await tick();
		expect(slug.value).toBe("winter-blue");
	});

	it("contains modal focus and moves it before native submit disabling", async () => {
		let resolveCreate: ((value: { productId: string }) => void) | undefined;
		mocks.mutation.mockImplementationOnce(() => new Promise((resolve) => {
			resolveCreate = resolve;
		}));
		await mountList();
		const trigger = document.querySelector<HTMLButtonElement>(".new-product");
		trigger?.click();
		await tick();
		await tick();
		const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
		const close = document.querySelector<HTMLButtonElement>('[aria-label="Close new product form"]');
		const submit = document.querySelector<HTMLButtonElement>(".create-panel .primary");
		expect(dialog).not.toBeNull();
		expect((document.querySelector(".product-workbench") as HTMLElement & { inert: boolean }).inert).toBe(true);
		expect(document.activeElement).toBe(input("product name"));
		close?.focus();
		dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
		expect(document.activeElement).toBe(submit);
		dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
		expect(document.activeElement).toBe(close);

		const name = input("product name");
		name!.value = "Pending print";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		submit?.focus();
		submit?.click();
		await tick();
		expect(submit?.disabled).toBe(true);
		expect(document.activeElement).toBe(close);
		resolveCreate?.({ productId: "new-product" });
		await tick();
		await Promise.resolve();
	});

	it("closes the create dialog with Escape and returns focus to its trigger", async () => {
		await mountList();
		const trigger = document.querySelector<HTMLButtonElement>(".new-product");
		trigger?.click();
		await tick();
		await tick();
		const productType = document.querySelector<HTMLButtonElement>(
			'[role="combobox"][aria-labelledby^="new-product-type-label"]',
		);
		productType?.click();
		await tick();
		const firstType = document.querySelector<HTMLButtonElement>(
			'#new-product-type-options [role="option"]',
		);
		firstType?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await tick();
		await Promise.resolve();
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		expect(document.querySelector("#new-product-type-options")).toBeNull();
		expect(document.activeElement).toBe(productType);
		document.querySelector('[role="dialog"]')?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		await tick();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("keeps navigation failure recovery visible while goto is pending", async () => {
		let rejectNavigation: ((reason: Error) => void) | undefined;
		mocks.goto.mockImplementationOnce(() => new Promise((_, reject) => {
			rejectNavigation = reject;
		}));
		await mountList();
		(document.querySelector(".new-product") as HTMLButtonElement).click();
		await tick();
		const name = input("product name");
		name!.value = "Slow navigation";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();

		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		expect(button("draft created")?.disabled).toBe(true);
		document.querySelector<HTMLButtonElement>('[aria-label="Close new product form"]')?.click();
		dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBe(dialog);

		rejectNavigation?.(new Error("navigation failed"));
		await Promise.resolve();
		await tick();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"created, but it could not be opened automatically",
		);
		expect(document.querySelector('.success a[href="/admin/editor/products/new-product"]')).not.toBeNull();
	});

	it("describes publication in user-facing terms only when the host exposes it", async () => {
		await mountList();
		expect(document.body.textContent).toContain("Select one from the list, or create a new product draft.");
		expect(document.body.textContent).not.toContain("publication controls");
		expect(document.body.textContent).not.toContain("verified asset replacement");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		mocks.graphApiEnabled = true;
		await mountList();
		expect(document.body.textContent).toContain("Select one from the list, or create a new product draft.");
		expect(document.body.textContent).not.toContain("publication controls");
		expect(document.body.textContent).not.toContain("verified asset replacement");
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";

		enablePublication();
		await mountList();
		expect(document.body.textContent).toContain("Select one from the list, or create a new product draft.");
		expect(document.body.textContent).not.toContain("Convex publication");
	});

	it("retains 44px taxonomy, filter, creation, and action targets through 768px", () => {
		expect(productWorkbenchSource).toContain("@media (max-width: 768px)");
		expect(productWorkbenchSource).toContain(
			".kind-filters button, .new-product, .status-filters button, .primary { min-height: 44px; }",
		);
	});

	it("reuses one product identity when an uncertain create is retried", async () => {
		mocks.mutation
			.mockRejectedValueOnce(
				new Error("Connection lost after sending the draft."),
			)
			.mockResolvedValueOnce({
				productId: "new-product",
				revisionId: "new-revision",
			});
		await mountList();
		(document.querySelector(".new-product") as HTMLButtonElement).click();
		await tick();
		const name = input("product name");
		name!.value = "Winter Light";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledTimes(2);
		expect(mocks.mutation.mock.calls[0][1].productKey).toBe(
			mocks.mutation.mock.calls[1][1].productKey,
		);
	});

	it("locks a successfully created product when automatic navigation fails", async () => {
		mocks.goto.mockRejectedValueOnce(new Error("navigation failed"));
		await mountList();
		(document.querySelector(".new-product") as HTMLButtonElement).click();
		await tick();
		const name = input("product name");
		name!.value = "Winter Light";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		button("create product draft")?.click();
		await tick();
		await Promise.resolve();
		await tick();

		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.createDraft,
			expect.objectContaining({ siteUrl: "https://site.example" }),
		);
		expect(mocks.goto).toHaveBeenCalledOnce();
		const lockedButton = button("draft created");
		expect(lockedButton?.disabled).toBe(true);
		lockedButton?.click();
		await tick();
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"created, but it could not be opened automatically",
		);
		const fallbackLink = document.querySelector<HTMLAnchorElement>(
			'.success a[href="/admin/editor/products/new-product"]',
		);
		expect(fallbackLink?.textContent).toContain("Open the product draft");
	});

	it("fails closed on deep links when single prints are disabled", () => {
		mocks.enabledKinds = [];
		expect(() => mount(ProductsPage, { target: document.body })).toThrow(
			/single-print product editor is not configured/i,
		);
		expect(() =>
			mount(ProductPage, {
				target: document.body,
				props: { productId: "product-1" },
			}),
		).toThrow(/single-print product editor is not configured/i);
		expect(mocks.mutation).not.toHaveBeenCalled();
	});

	it("saves an explicitly edited draft with its CAS revision and ordered variants", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		expect(button("publish")).toBeUndefined();
		expect(document.querySelector("#catalog-publication-heading")).toBeNull();
		button("add variant")?.click();
		await tick();
		const newVariantKey = document.querySelectorAll(".variant-heading small")[1]?.textContent ?? "";
		document.querySelector("#catalog-variants-heading")?.closest("section")?.querySelector("ol")?.dispatchEvent(new CustomEvent("finalize", { bubbles: true, detail: { items: [{ key: newVariantKey, status: "enabled", id: newVariantKey }, { ...revision.variants[0], id: revision.variants[0].key }], info: { source: "pointer", trigger: "droppedIntoZone", id: newVariantKey } } }));
		const name = input("product name");
		name!.value = "Lake print revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const slug = input("URL name");
		slug!.value = "Lake Light !!!";
		slug!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "revision-1",
				draft: expect.objectContaining({
					title: "Lake print revised",
					slug: "lake-light",
				}),
			}),
		);
		expect(saveCall?.[1].draft.variants).toHaveLength(2);
		expect(saveCall?.[1].draft.variants[1].key).toBe("variant-original");
	});

	it("saves migrated V2 print drafts without dropping imported graph relations", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.print",
			productKind: "print",
			graphVersion: 2,
			slug: "avant-alien-2-2",
			draft: graphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		expect(document.querySelector(".publication")).toBeNull();
		expect(document.querySelector(".publication-evidence")).toBeNull();
		expect(button("publish")).toBeUndefined();
		expect(document.body.textContent).not.toContain("discard draft");

		const name = input("product name");
		name!.value = "Avant Alien 2.2 revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		segmentedChoice("sale availability", "not for sale")!.click();
		button("add variant")?.click();
		await tick();
		const newVariantKey = document.querySelectorAll(".variant-heading small")[1]?.textContent ?? "";
		document.querySelector("#catalog-variants-heading")?.closest("section")?.querySelector("ol")?.dispatchEvent(new CustomEvent("finalize", { bubbles: true, detail: { items: [{ key: newVariantKey, status: "enabled", id: newVariantKey }, { ...graphRevision.draft.variants[0], id: graphRevision.draft.variants[0].key }], info: { source: "pointer", trigger: "droppedIntoZone", id: newVariantKey } } }));
		await tick();

		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "graph-revision-1",
			}),
		);
		expect(saveCall?.[1].draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "print",
				title: "Avant Alien 2.2 revised",
				saleAvailability: "unavailable",
				seoDescription: "Imported SEO copy.",
				shopPlacement: { featured: true, orderRank: "a0" },
				webMedia: graphRevision.draft.webMedia,
				printSources: graphRevision.draft.printSources,
				printOptions: expect.objectContaining({
					borderOptionsEnabled: true,
				}),
			}),
		);
		expect(saveCall?.[1].draft.variants).toEqual([
			expect.objectContaining({ order: 0 }),
			expect.objectContaining({ key: "variant-original", order: 1 }),
		]);
	});

	it("uses consistent segmented sale controls without native popup menus or checkboxes", async () => {
		mocks.graphApiEnabled = true;
		mocks.detailData = graphDetail();
		await mountDetail();

		const saleSection = document.querySelector("#sale-settings-heading")?.closest("section");
		const variantsSection = document.querySelector("#catalog-variants-heading")?.closest("section");
		expect(document.querySelector("#catalog-variants-heading")?.textContent).toBe("prices and options");
		expect(variantsSection?.querySelector(".variant-heading")?.textContent).toContain("variant 1");
		expect(variantsSection?.querySelector("button")?.textContent).toContain("add variant");
		expect(saleSection?.contains(input("retail price (USD)")!)).toBe(false);
		expect(variantsSection?.contains(input("retail price (USD)")!)).toBe(true);
		expect(saleSection?.querySelector("select")).toBeNull();
		expect(saleSection?.querySelector('input[type="checkbox"]')).toBeNull();
		expect(saleSection?.querySelectorAll('input[type="radio"]')).toHaveLength(8);
		expect(segmentedChoice("fulfillment", "production partner")?.checked).toBe(true);
		expect(segmentedChoice("sale availability", "available")?.checked).toBe(true);

		segmentedChoice("fulfillment", "handled by studio")!.click();
		segmentedChoice("sale availability", "not for sale")!.click();
		segmentedChoice("border options", "no borders")!.click();
		segmentedChoice("frame options", "offer frames")!.click();
		await tick();
		expect(input("frame price multiplier")?.value).toBe("1.00");
		expect(document.querySelector(".multiplier-input")?.textContent).toContain("×");
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(([ref]) => ref === mocks.refs.saveDraft);
		expect(saveCall?.[1].draft).toEqual(expect.objectContaining({
			fulfillmentMode: "merchant_fulfilled",
			saleAvailability: "unavailable",
			printOptions: expect.objectContaining({
				borderOptionsEnabled: false,
				frameOptionsEnabled: true,
			}),
		}));
	});

	it("renders host-labelled material and compatible size listboxes without rewriting legacy keys", async () => {
		mocks.graphApiEnabled = true;
		mocks.variantOptionsEnabled = true;
		mocks.detailData = graphDetail();
		await mountDetail();

		const legacyMaterial = document.querySelector<HTMLButtonElement>(
			"#catalog-material-variant-original-trigger",
		)!;
		expect(legacyMaterial.textContent).toContain("fine-art-paper");
		legacyMaterial.click();
		await tick();
		expect(document.querySelector<HTMLButtonElement>(
			'[role="option"][data-value="fine-art-paper"]',
		)?.disabled).toBe(true);
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await tick();
		expect(legacyMaterial.getAttribute("aria-expanded")).toBe("false");

		const title = input("product name")!;
		title.value = "Legacy print retained";
		title.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const legacySave = mocks.mutation.mock.calls.find(([ref]) => ref === mocks.refs.saveDraft);
		expect(legacySave?.[1].draft.variants[0]).toEqual(expect.objectContaining({
			materialOptionKey: "fine-art-paper",
			sizeOptionKey: "8x10",
		}));
	});

	it("clears only an incompatible size when a material choice changes", async () => {
		mocks.graphApiEnabled = true;
		mocks.variantOptionsEnabled = true;
		const optionRevision = {
			...graphRevision,
			draft: {
				...graphRevision.draft,
				variants: [{
					...graphRevision.draft.variants[0],
					materialOptionKey: "archival-matte",
					sizeOptionKey: "4x6",
				}],
			},
		};
		mocks.detailData = graphDetail(optionRevision);
		await mountDetail();

		const material = document.querySelector<HTMLButtonElement>(
			"#catalog-material-variant-original-trigger",
		)!;
		const size = document.querySelector<HTMLButtonElement>(
			"#catalog-size-variant-original-trigger",
		)!;
		expect(material.textContent).toContain("Archival Matte");
		expect(size.textContent).toContain("4×6");
		material.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		await tick();
		await Promise.resolve();
		expect(document.activeElement?.getAttribute("data-value")).toBe("archival-matte");
		document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		expect(document.activeElement?.getAttribute("data-value")).toBe("canvas-black-1.25");
		(document.activeElement as HTMLButtonElement).click();
		await tick();
		expect(size.textContent).toContain("choose a size");

		size.click();
		await tick();
		expect(document.querySelector('[role="option"][data-value="4x6"]')).toBeNull();
		(document.querySelector('[role="option"][data-value="11x14"]') as HTMLButtonElement).click();
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saveCall = mocks.mutation.mock.calls.find(([ref]) => ref === mocks.refs.saveDraft);
		expect(saveCall?.[1].draft.variants[0]).toEqual(expect.objectContaining({
			materialOptionKey: "canvas-black-1.25",
			sizeOptionKey: "11x14",
		}));
	});

	it("keeps contextual publication actions and an accessible status while hiding internal evidence", async () => {
		enablePublication();
		mocks.detailData = graphDetail(graphRevision, null, 1_750_000_000_000);
		await mountDetail();
		const status = () => document.querySelector(".publication-status")?.textContent;
		expect(status()).toBe("unpublished");
		expect(document.querySelector('[aria-label="Convex CMS actions"]')).not.toBeNull();
		expect(document.querySelector(".publication-evidence")).toBeNull();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		expect(document.querySelector(".authority-note")).toBeNull();
		expect(document.body.textContent).not.toContain("graph-revision-1");
		expect(document.body.textContent).not.toContain("1750000000000");
		expect(button("publish")?.textContent).toBe("publish to Convex CMS");

		await updateDetailQuery(graphDetail(graphRevision, graphRevision, 1_750_000_000_001));
		expect(status()).toBe("published — current draft");
		const newerDraft = { ...graphRevision, revisionId: "graph-revision-2", createdAt: 12 };
		await updateDetailQuery(graphDetail(newerDraft, graphRevision, 1_750_000_000_002));
		expect(status()).toBe("published — newer draft available");
	});

	it("places compact Shop actions with sale settings without repeating explanatory copy", async () => {
		enablePublication();
		mocks.publicShopEnabled = true;
		mocks.detailData = graphDetail();
		await mountDetail();
		expect(document.querySelector('[aria-label="Shop actions"]')).not.toBeNull();
		expect(Array.from(document.querySelectorAll("button"), (item) => item.textContent?.trim()))
			.toContain("publish to Shop");
		expect(document.body.textContent).not.toContain("exact product revision read by your public Shop");
	});

	it("blocks publication while a visible price or frame multiplier is invalid", async () => {
		enablePublication();
		mocks.detailData = graphDetail();
		await mountDetail();
		const price = input("retail price (USD)")!;
		price.value = "25.001";
		price.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("publish")).toBeUndefined();
		const refreshedRevision = {
			...graphRevision,
			revisionId: "graph-revision-refreshed",
			createdAt: 12,
		};
		await updateDetailQuery(graphDetail(refreshedRevision, null, 12));
		expect(input("retail price (USD)")?.value).toBe("25.00");
		expect(input("retail price (USD)")?.getAttribute("aria-invalid")).toBe("false");
		expect(button("publish")).toBeDefined();

		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
		mocks.detailData = graphDetail({
			...graphRevision,
			draft: {
				...graphRevision.draft,
				printOptions: {
					...graphRevision.draft.printOptions,
					frameOptionsEnabled: true,
					framePriceMultiplierBasisPoints: 20_000,
				},
			},
		});
		await mountDetail();
		const multiplier = input("frame price multiplier")!;
		multiplier.value = "2.00001";
		multiplier.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("publish")).toBeUndefined();
	});

	it("resets product-scoped validation when navigation reuses the same variant key and price", async () => {
		mocks.detailData = graphDetail();
		const harness = mount(ProductPageNavigationHarness, { target: document.body });
		components.push(harness);
		await tick();
		await tick();
		const firstPrice = input("retail price (USD)")!;
		firstPrice.value = "25.001";
		firstPrice.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(firstPrice.getAttribute("aria-invalid")).toBe("true");

		mocks.detailData = {
			...graphDetail({
				...graphRevision,
				revisionId: "graph-revision-product-2",
				draft: {
					...graphRevision.draft,
					title: "Second product",
				},
			}),
			productId: "product-2",
			productKey: "catalog.second-product",
		};
		harness.navigate("product-2");
		mocks.notifyQuery?.();
		await tick();
		await tick();
		expect(document.querySelector(".settings-header h1")?.textContent).toBe("Second product");
		expect(input("retail price (USD)")?.value).toBe("25.00");
		expect(input("retail price (USD)")?.getAttribute("aria-invalid")).toBe("false");
	});

	for (const [graph, action] of [[false, "save"], [true, "save"], [false, "discard"], [false, "start"], [true, "start"]] as const) {
		for (const outcome of ["success", "error"] as const) {
			it.each([false, true])(`ignores a late ${graph ? "graph" : "legacy"} ${action} ${outcome} after navigation (return to original: %s)`, async (returnToOriginal) => {
				mocks.graphApiEnabled = graph;
				const detail = (productId: string, revisionId: string, title: string, active = true) => {
					const draft = graph
						? { ...graphRevision, revisionId, draft: { ...graphRevision.draft, title } }
						: { ...revision, revisionId, title };
					return {
						...graphDetail(), productId, graphVersion: graph ? 2 : undefined,
						draft: active ? draft : null, published: active ? null : draft,
					};
				};
				mocks.detailData = detail("product-1", "original-revision", "Original product", action !== "start");
				let resolveOld!: (value: { revisionId: string }) => void;
				let rejectOld!: (reason: Error) => void;
				let resolveCurrent!: (value: { revisionId: string }) => void;
				mocks.mutation
					.mockImplementationOnce(() => new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }))
					.mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
				vi.spyOn(globalThis, "confirm").mockReturnValue(true);
				const harness = mount(ProductPageNavigationHarness, { target: document.body });
				components.push(harness);
				await tick();
				await tick();
				if (action === "save") {
					input("product name")!.value = "Original edit";
					input("product name")!.dispatchEvent(new Event("input", { bubbles: true }));
					await tick();
				}
				const actionButton = button(action === "start" ? "start a new draft" : `${action} draft`);
				expect(actionButton?.disabled).toBe(false);
				actionButton!.click();
				await tick();
				expect(mocks.mutation).toHaveBeenCalledTimes(1);

				harness.navigate("product-2");
				await updateDetailQuery(detail("product-2", "current-revision", "Current product"));
				if (returnToOriginal) {
					harness.navigate("product-1");
					await updateDetailQuery(detail("product-1", "current-revision", "Current product"));
				}
				input("product name")!.value = "Current edit";
				input("product name")!.dispatchEvent(new Event("input", { bubbles: true }));
				await tick();
				button("save draft")!.click();
				await tick();
				expect(mocks.mutation).toHaveBeenCalledTimes(2);

				if (outcome === "success") resolveOld({ revisionId: "obsolete-result" });
				else rejectOld(new Error("Catalog draft conflict from obsolete request"));
				await tick();
				await tick();
				expect(input("product name")?.value).toBe("Current edit");
				expect(document.querySelector(".save-state")?.textContent).toBe("saving");
				expect(document.querySelector('[role="alert"]')).toBeNull();

				resolveCurrent({ revisionId: "current-result" });
				await tick();
				await tick();
				input("product name")!.value = "Next current edit";
				input("product name")!.dispatchEvent(new Event("input", { bubbles: true }));
				await tick();
				button("save draft")!.click();
				await tick();
				expect(mocks.mutation.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
					productId: returnToOriginal ? "product-1" : "product-2",
					expectedDraftRevisionId: "current-result",
					draft: expect.objectContaining({ title: "Next current edit" }),
				}));
			});
		}
	}

	it("publishes once with exact CAS args and waits for an exact result/query echo", async () => {
		enablePublication();
		mocks.detailData = graphDetail();
		mocks.mutation.mockResolvedValueOnce({
			productId: "product-1",
			draftRevisionId: "graph-revision-1",
			publishedRevisionId: "graph-revision-1",
			updatedAt: 11,
			publishedAt: 11,
		});
		await mountDetail();
		button("publish")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.publishDraft, {
			productId: "product-1",
			expectedDraftRevisionId: "graph-revision-1",
			expectedPublishedRevisionId: null,
			expectedUpdatedAt: 10,
		});
		expect(button("publish")).toBeUndefined();
		expect(document.body.textContent).toContain("Confirming the exact Convex CMS publication state");
		expect(document.querySelector(".publication-status")?.textContent).toBe("unpublished");

		await updateDetailQuery(graphDetail(graphRevision, graphRevision, 11));
		expect(document.querySelector(".publication-status")?.textContent).toBe("published — current draft");
		expect(document.body.textContent).toContain("Published in Convex CMS.");
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
	});

	it("locks publication while dirty, saving, and waiting for a save query echo", async () => {
		enablePublication();
		mocks.detailData = graphDetail();
		let finishSave: ((value: { revisionId: string }) => void) | undefined;
		mocks.mutation.mockImplementation(() => new Promise((resolve) => {
			finishSave = resolve;
		}));
		await mountDetail();
		expect(button("publish")?.disabled).toBe(false);
		const name = input("product name")!;
		name.value = "Revised while private";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("publish")).toBeUndefined();
		button("save draft")?.click();
		await tick();
		expect(button("publish")).toBeUndefined();
		finishSave?.({ revisionId: "graph-revision-2" });
		await Promise.resolve();
		await tick();
		expect(button("publish")).toBeUndefined();

		const savedDraft = {
			...graphRevision,
			revisionId: "graph-revision-2",
			draft: { ...graphRevision.draft, title: "Revised while private" },
		};
		await updateDetailQuery(graphDetail(savedDraft, null, 11));
		expect(button("publish")?.disabled).toBe(false);
	});

	it.each([
		"Network response was lost",
		"[CONVEX M(catalogProductGraphs:publishDraft)] Server Error\nUncaught Error: Not authorized to publish this product",
		"[CONVEX M(catalogProductGraphs:publishDraft)] Server Error\nUncaught Error: Product slug must be unique before publishing",
		"Product slug belongs to another catalog identity",
	])("reconciles an ambiguous publish error without a duplicate call: %s", async (message) => {
		vi.useFakeTimers();
		enablePublication();
		mocks.detailData = graphDetail();
		mocks.mutation.mockRejectedValueOnce(new Error(message));
		await mountDetail();
		button("publish")?.click();
		await tick();
		await Promise.resolve();
		expect(document.body.textContent).toContain("without resubmitting");
		button("publish")?.click();
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(8_000);
		await tick();
		expect(document.querySelector(".publication-alert")?.textContent).toContain("Reload this product");
		expect(button("reload product")).toBeDefined();

		await updateDetailQuery(graphDetail(graphRevision, graphRevision, 11));
		expect(document.body.textContent).toContain("Published in Convex CMS.");
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
	});

	it("explains an uncertain Shop action without exposing publication protocol language", async () => {
		vi.useFakeTimers();
		enablePublication();
		mocks.publicShopEnabled = true;
		mocks.detailData = graphDetail();
		mocks.mutation.mockRejectedValueOnce(new Error("Network response was lost"));
		await mountDetail();
		button("publish to Shop")?.click();
		await tick();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(8_000);
		await tick();
		const alert = document.querySelector(".publication-alert")?.textContent ?? "";
		expect(alert).toContain(
			"We could not confirm whether the Shop finished this action. Reload the product before trying again.",
		);
		expect(alert).not.toContain("publication result");
	});

	it.each(completenessErrors)("stops immediately for reviewed completeness rejection: %s", async (serverMessage, ownerText) => {
		vi.useFakeTimers();
		enablePublication();
		mocks.detailData = graphDetail();
		mocks.mutation.mockRejectedValueOnce(new Error(
			`[CONVEX M(catalogProductGraphs:publishDraft)] [Request ID: abc] Server Error\nUncaught Error: ${serverMessage}`,
		));
		await mountDetail();
		button("publish")?.click();
		await tick();
		await Promise.resolve();
		const alert = document.querySelector(".publication-alert")?.textContent ?? "";
		expect(alert).toContain(ownerText);
		expect(alert).not.toContain(serverMessage);
		expect(document.body.textContent).not.toContain("response was uncertain");
		expect(button("publish")?.disabled).toBe(false);
		expect(button("retry")).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(8_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		expect(button("reload product")).toBeUndefined();
	});

	it("shows the exact closed completeness alert without reconciliation or a timer", async () => {
		vi.useFakeTimers();
		enablePublication();
		mocks.detailData = graphDetail();
		mocks.mutation.mockRejectedValueOnce(new Error([
			"[CONVEX M(catalogProductGraphs:publishDraft)] [Request ID: request-id-redacted] Server Error",
			"Uncaught Error: Catalog display media needs alternative text before publishing",
		].join("\n")));
		await mountDetail();
		button("publish")?.click();
		await tick();
		await Promise.resolve();

		expect(document.querySelector(".publication-alert")?.textContent).toBe(
			"Convex CMS did not publish this draft. Add the required display media and alternative text, then save the draft and publish to Convex CMS again.",
		);
		expect(document.body.textContent).not.toContain("response was uncertain");
		expect(button("publish")?.disabled).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(8_000);
		expect(mocks.mutation).toHaveBeenCalledTimes(1);
		expect(button("reload product")).toBeUndefined();
	});

	it("confirms unpublish, sends a nullable draft pointer, and surfaces CAS conflict generically", async () => {
		enablePublication();
		mocks.detailData = graphDetail(null, graphRevision, 20);
		const confirm = vi.spyOn(globalThis, "confirm")
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);
		mocks.mutation.mockRejectedValueOnce(
			new Error("Catalog publication conflict: reload before retrying"),
		);
		await mountDetail();
		expect(document.querySelector(".publication-status")?.textContent).toBe("published — no active draft");
		button("unpublish")?.click();
		await tick();
		expect(mocks.mutation).not.toHaveBeenCalled();
		button("unpublish")?.click();
		await tick();
		await Promise.resolve();
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(confirm).toHaveBeenLastCalledWith("Unpublish this product from Convex CMS?");
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.unpublish, {
			productId: "product-1",
			expectedDraftRevisionId: null,
			expectedPublishedRevisionId: "graph-revision-1",
			expectedUpdatedAt: 20,
		});
		expect(document.querySelector(".publication-alert")?.textContent).toContain(
			"Publication state changed unexpectedly",
		);
		expect(button("unpublish")).toBeUndefined();
	});

	it("starts a replacement Graph V2 draft from the published revision and saves before query echo", async () => {
		mocks.graphApiEnabled = true;
		mocks.detailData = graphDetail(null, graphRevision, 20);
		mocks.mutation
			.mockResolvedValueOnce({ revisionId: "revision-restarted" })
			.mockResolvedValueOnce({ revisionId: "revision-edited" })
			.mockResolvedValueOnce({ revisionId: "revision-after-delayed-echo" });
		await mountDetail();

		expect(document.querySelector("#discarded-product-heading")?.textContent).toBe(
			"no active draft",
		);
		expect(document.querySelector("#product-readback-heading")).toBeNull();
		button("start a new draft")?.click();
		await tick();
		await Promise.resolve();

		const restartCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(restartCall?.[1]).toEqual({
			productId: "product-1",
			draft: graphRevision.draft,
		});
		expect(input("product name")?.value).toBe("Avant Alien 2.2");

		const name = input("product name")!;
		name.value = "Restarted before echo";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCalls = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCalls).toHaveLength(2);
		expect(saveCalls[1][1]).toEqual(expect.objectContaining({
			productId: "product-1",
			expectedDraftRevisionId: "revision-restarted",
			draft: expect.objectContaining({
				schemaVersion: 2,
				title: "Restarted before echo",
				seoDescription: "Imported SEO copy.",
			}),
		}));

		await updateDetailQuery(graphDetail({
			...graphRevision,
			revisionId: "revision-restarted",
		}, graphRevision, 21));
		expect(input("product name")?.value).toBe("Restarted before echo");

		name.value = "After delayed echo";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const finalSaveCall = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.saveDraft,
		)[2];
		expect(finalSaveCall?.[1]).toEqual(expect.objectContaining({
			expectedDraftRevisionId: "revision-edited",
			draft: expect.objectContaining({ title: "After delayed echo" }),
		}));
	});

	it("starts an incomplete fixed-price Graph V2 replacement without inventing a price", async () => {
		mocks.graphApiEnabled = true;
		mocks.enabledKinds = ["digital_download"];
		mocks.detailData = {
			productId: "product-1",
			productKey: "catalog.retained-download",
			productKind: "digital_download",
			graphVersion: 2,
			slug: "retained-download",
			draft: null,
			published: null,
			updatedAt: 20,
			publishedAt: null,
		};
		await mountDetail();

		button("start a new draft")?.click();
		await tick();
		await Promise.resolve();
		const restartCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(restartCall?.[1].draft).toEqual(expect.objectContaining({
			schemaVersion: 2,
			productKind: "digital_download",
			slug: "retained-download",
			saleAvailability: "unavailable",
			variants: [{ key: "default", order: 0, status: "disabled" }],
		}));
		expect(restartCall?.[1].draft.variants[0]).not.toHaveProperty(
			"retailPriceCents",
		);
		expect(input("retail price (USD)")?.value).toBe("");
	});

	it("saves migrated fixed-price graph product drafts without exposing print-only controls", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.tapestry",
			productKind: "tapestry",
			graphVersion: 2,
			slug: "soft-portal",
			draft: fixedPriceGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		const saleSection = document.querySelector("#sale-settings-heading")?.closest("section");
		expect(document.querySelector("#sale-settings-heading")?.textContent).toBe("price and availability");
		expect(saleSection?.querySelector(".section-heading p")).toBeNull();
		expect(saleSection?.contains(input("retail price (USD)")!)).toBe(true);
		expect(saleSection?.querySelectorAll("fieldset")).toHaveLength(1);
		expect(document.querySelector("#catalog-variants-heading")).toBeNull();
		expect(document.querySelector(".variant-heading")).toBeNull();
		expect(document.body.textContent).not.toContain("variant 1");
		expect(document.body.textContent).not.toContain("default");
		expect(input("retail price (USD)")?.getAttribute("aria-label")).toBe("retail price (USD)");
		expect(Array.from(document.querySelectorAll(".section-heading > span"), (item) => item.textContent)).toEqual(["01", "02"]);
		expect(input("fulfillment")).toBeUndefined();
		expect(document.body.textContent).not.toContain("offer frame options");
		expect(button("add variant")).toBeUndefined();
		expect(input("material key")).toBeUndefined();
		expect(input("size key")).toBeUndefined();

		const name = input("product name");
		name!.value = "Soft Portal revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("retail price (USD)");
		price!.value = "90.00";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		segmentedChoice("sale availability", "not for sale")!.click();
		await tick();

		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "graph-revision-2",
			}),
		);
		expect(saveCall?.[1].draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "tapestry",
				title: "Soft Portal revised",
				saleAvailability: "unavailable",
				seoDescription: "Imported tapestry SEO copy.",
				shopPlacement: { featured: false, orderRank: "c0" },
				webMedia: fixedPriceGraphRevision.draft.webMedia,
			}),
		);
		expect(saveCall?.[1].draft).not.toHaveProperty("printOptions");
		expect(saveCall?.[1].draft.variants).toEqual([
				expect.objectContaining({
					key: "default",
					order: 0,
					retailPriceCents: 9000,
					status: "disabled",
				}),
		]);
	});

	it("recomputes a host-owned print margin as the USD price changes", async () => {
		mocks.graphApiEnabled = true;
		mocks.marginEnabled = true;
		const pricedPrint = {
			...graphRevision,
			draft: {
				...graphRevision.draft,
				printOptions: {
					...graphRevision.draft.printOptions,
					frameOptionsEnabled: true,
					framePriceMultiplierBasisPoints: 20_000,
				},
				variants: [{
					...graphRevision.draft.variants[0],
					materialOptionKey: "archival-matte",
					sizeOptionKey: "8x10",
				}],
			},
		};
		mocks.detailData = graphDetail(pricedPrint);
		await mountDetail();
		expect(mocks.marginCalculator).toHaveBeenLastCalledWith({
			productKind: "print",
			materialOptionKey: "archival-matte",
			sizeOptionKey: "8x10",
			retailPriceCents: 2500,
			setMemberCount: 0,
			frameMarkupMultiplier: 2,
		});
		expect(document.body.textContent).toContain("Take-home: $20.78 (83.1%)");
		expect(document.body.textContent).toContain("Framed estimate: $42.00 take-home");
		const frameMultiplier = input("frame price multiplier")!;
		expect(frameMultiplier.value).toBe("2.00");
		frameMultiplier.value = "2.00001";
		frameMultiplier.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(frameMultiplier.getAttribute("aria-invalid")).toBe("true");
		expect(frameMultiplier.getAttribute("aria-describedby")).toBe(
			"catalog-frame-multiplier-hint catalog-frame-multiplier-error",
		);
		expect(document.querySelector("#catalog-frame-multiplier-error")?.getAttribute("role"))
			.toBe("alert");
		expect(mocks.marginCalculator).toHaveBeenLastCalledWith(expect.objectContaining({
			frameMarkupMultiplier: undefined,
		}));
		expect(document.body.textContent).toContain("Take-home: $20.78 (83.1%)");
		expect(document.body.textContent).not.toContain("Framed estimate: $42.00 take-home");
		frameMultiplier.value = "2.00";
		frameMultiplier.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(document.body.textContent).toContain("Framed estimate: $42.00 take-home");
		const price = input("retail price (USD)")!;
		const marginOutput = document.querySelector<HTMLOutputElement>("output.margin-output")!;
		expect(marginOutput.getAttribute("aria-live")).toBe("polite");
		expect(price.getAttribute("aria-describedby")).toBe(marginOutput.id);
		expect(price.value).toBe("25.00");
		const marginCallsBeforeClearingPrice = mocks.marginCalculator.mock.calls.length;
		price.value = "";
		price.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(mocks.marginCalculator).toHaveBeenCalledTimes(marginCallsBeforeClearingPrice);
		expect(document.querySelector("output.margin-output")).toBeNull();
		expect(price.getAttribute("aria-describedby")).toBeNull();
		price.value = "31.25";
		price.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(mocks.marginCalculator).toHaveBeenLastCalledWith(expect.objectContaining({
			retailPriceCents: 3125,
		}));
		price.value = "31.251";
		price.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(price.getAttribute("aria-invalid")).toBe("true");
		expect(document.querySelector("output.margin-output")).toBeNull();
		expect(document.body.textContent).not.toContain("Take-home: $20.78 (83.1%)");
		expect(document.body.textContent).not.toContain("Framed estimate: $42.00 take-home");
		expect(productVariantsSource).toContain(".money-input:focus-within");
		expect(productVariantsSource).toContain(".money-input > input:focus { outline: 0; }");
	});

	it("does not invent margin estimates for fixed-price product kinds", async () => {
		mocks.graphApiEnabled = true;
		mocks.enabledKinds = ["tapestry"];
		mocks.marginEnabled = true;
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.tapestry",
			productKind: "tapestry",
			graphVersion: 2,
			slug: "soft-portal",
			draft: fixedPriceGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(mocks.marginCalculator).not.toHaveBeenCalled();
		expect(document.body.textContent).not.toContain("Wholesale:");
	});

	it("edits product display media while preserving hidden share metadata", async () => {
		mocks.graphApiEnabled = true;
		mocks.mediaEnabled = true;
		mocks.mediaRegisterEnabled = false;
		mocks.enabledKinds = ["print", "tapestry"];
		const first = mediaAsset(
			"media-1",
			"11111111-1111-4111-8111-111111111111",
			"first.jpg",
		);
		const second = mediaAsset(
			"media-2",
			"22222222-2222-4222-8222-222222222222",
			"second.jpg",
		);
		const hiddenShare = mediaAsset(
			"media-share",
			"33333333-3333-4333-8333-333333333333",
			"hidden-share.jpg",
		);
		const extra = mediaAsset(
			"media-3",
			"44444444-4444-4444-8444-444444444444",
			"extra.jpg",
		);
		mocks.mediaListData = {
			page: [extra, second, first],
			isDone: true,
			continueCursor: "",
		};
		mocks.mediaPlacedData = [first, second, hiddenShare];
		const mediaRevision = {
			...fixedPriceGraphRevision,
			draft: {
				...fixedPriceGraphRevision.draft,
				webMedia: [
					{ key: "gallery-z", order: 0, role: "gallery", assetId: first._id, altText: "First alt" },
					{ key: "gallery-a", order: 1, role: "gallery", assetId: second._id, altText: "Second alt" },
					{ key: "share", order: 0, role: "social_share", assetId: hiddenShare._id, altText: "Share alt" },
				],
			},
		};
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.tapestry",
			productKind: "tapestry",
			graphVersion: 2,
			slug: "soft-portal",
			draft: mediaRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};

		await mountDetail();
		const mediaSection = document.querySelector(
			'section[aria-labelledby="catalog-product-media-heading"]',
		) as HTMLElement;
		const productDetailsHeading = document.querySelector("#product-identity-heading")!;
		expect(
			mediaSection.compareDocumentPosition(productDetailsHeading)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(mediaSection.textContent).toContain("first.jpg");
		expect(mediaSection.textContent).toContain("second.jpg");
		expect(mediaSection.textContent).not.toContain("hidden-share.jpg");
		expect(mediaSection.querySelectorAll("li")).toHaveLength(2);
		expect(mediaSection.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true);
		const firstRow = mediaSection.querySelectorAll("li")[0];
		expect(firstRow.getAttribute("aria-label")).toBe("first.jpg product image");
		expect(firstRow.querySelector('input[maxlength="1000"]')?.getAttribute("aria-label"))
			.toBe("Alt text for first.jpg");
		expect(firstRow.querySelector(".drag-handle")?.getAttribute("aria-label"))
			.toBe("Reorder first.jpg");
		expect(firstRow.querySelector("button.remove")?.getAttribute("aria-label"))
			.toBe("Remove first.jpg");

		const galleryZone = mediaSection.querySelector(
			'ul[aria-label="Reorder product gallery images"]',
		) as HTMLUListElement;
		expect(mediaSection.querySelector('[aria-label^="Move image"]')).toBeNull();
		expect(galleryZone.querySelectorAll(".drag-handle")).toHaveLength(2);
		galleryZone.dispatchEvent(new CustomEvent("consider", {
			bubbles: true,
			detail: {
				items: [
					{ ...mediaRevision.draft.webMedia[0], id: "shadow", isDndShadowItem: true },
					{ ...mediaRevision.draft.webMedia[1], id: "gallery-a" },
				],
				info: { source: "pointer", trigger: "dragStarted", id: "gallery-z" },
			},
		}));
		await tick();
		expect(mediaSection.querySelectorAll("li")).toHaveLength(2);
		galleryZone.dispatchEvent(new CustomEvent("finalize", {
			bubbles: true,
			detail: {
				items: [
					{ ...mediaRevision.draft.webMedia[1], id: "gallery-a" },
					{ ...mediaRevision.draft.webMedia[0], id: "gallery-z" },
				],
				info: { source: "pointer", trigger: "droppedIntoZone", id: "gallery-z" },
			},
		}));
		await tick();
		const firstAlt = mediaSection.querySelectorAll<HTMLInputElement>('input[maxlength="1000"]')[0];
		firstAlt.value = "Second image revised";
		firstAlt.dispatchEvent(new Event("input", { bubbles: true }));
		button("choose existing image")?.click();
		await tick();
		expect(document.querySelector(".picker")?.textContent).toContain("hidden-share.jpg");
		const extraPickerRow = Array.from(document.querySelectorAll(".picker li"))
			.find((row) => row.textContent?.includes("extra.jpg"));
		(extraPickerRow?.querySelector("button") as HTMLButtonElement).click();
		await tick();
		expect(mediaSection.querySelectorAll("li")).toHaveLength(3);

		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const firstSave = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		)?.[1].draft;
		expect(firstSave.webMedia).toEqual([
			expect.objectContaining({ key: "gallery-a", role: "gallery", order: 0, altText: "Second image revised" }),
			expect.objectContaining({ key: "gallery-z", role: "gallery", order: 1, altText: "First alt" }),
			expect.objectContaining({
				key: "media-gallery-44444444-4444-4444-8444-444444444444",
				role: "gallery",
				order: 2,
				assetId: "media-3",
			}),
			expect.objectContaining({ key: "share", role: "social_share", order: 0, altText: "Share alt" }),
		]);

		const extraRow = Array.from(mediaSection.querySelectorAll("li"))
			.find((row) => row.textContent?.includes("extra.jpg"));
		(Array.from(extraRow?.querySelectorAll("button") ?? [])
			.find((item) => item.textContent?.trim() === "remove") as HTMLButtonElement).click();
		await tick();
		expect(mediaSection.querySelectorAll("li")).toHaveLength(2);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saves = mocks.mutation.mock.calls.filter(([ref]) => ref === mocks.refs.saveDraft);
		expect(saves).toHaveLength(2);
		expect(saves[1][1].draft.webMedia).toHaveLength(3);
		expect(saves[1][1].draft.webMedia).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ assetId: "media-3" })]),
		);
		expect(mocks.mutation.mock.calls.some(
			([ref]) => ref === mocks.mediaRefs.registerReadyWebAsset,
		)).toBe(false);
	});

	it("keeps an upload that finishes during a save dirty until it is persisted", async () => {
		mocks.graphApiEnabled = true;
		mocks.mediaEnabled = true;
		mocks.enabledKinds = ["print", "tapestry"];
		mocks.mediaListData = { page: [], isDone: true, continueCursor: "" };
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.tapestry",
			productKind: "tapestry",
			graphVersion: 2,
			slug: "soft-portal",
			draft: fixedPriceGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		let finishUpload: ((asset: ReturnType<typeof mediaAsset>) => void) | undefined;
		mocks.upload.mockImplementation(() => new Promise((resolve) => {
			finishUpload = resolve;
		}));
		let finishFirstSave: ((result: { revisionId: string }) => void) | undefined;
		let holdFirstSave = true;
		mocks.mutation.mockImplementation((ref: { name?: string }) => {
			if (ref.name === "catalog:saveDraft" && holdFirstSave) {
				holdFirstSave = false;
				return new Promise((resolve) => {
					finishFirstSave = resolve;
				});
			}
			return Promise.resolve({ revisionId: "saved-revision-2" });
		});

		await mountDetail();
		chooseFile(
			document.querySelector('input[type="file"]') as HTMLInputElement,
			new File(["image"], "during-save.jpg", { type: "image/jpeg" }),
		);
		await tick();
		const name = input("product name");
		name!.value = "Soft Portal revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		const firstSave = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		)?.[1].draft;
		expect(firstSave.webMedia).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ assetId: "media-during-save" })]),
		);

		finishUpload?.(mediaAsset(
			"media-during-save",
			"55555555-5555-4555-8555-555555555555",
			"during-save.jpg",
		));
		await Promise.resolve();
		await tick();
		await Promise.resolve();
		await tick();
		expect(document.body.textContent).toContain("during-save.jpg");

		finishFirstSave?.({ revisionId: "saved-revision-1" });
		await Promise.resolve();
		await tick();
		await Promise.resolve();
		await tick();
		expect(document.querySelector(".save-state")?.textContent).toBe("dirty");
		expect(button("save draft")?.disabled).toBe(false);

		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saves = mocks.mutation.mock.calls.filter(([ref]) => ref === mocks.refs.saveDraft);
		expect(saves).toHaveLength(2);
		expect(saves[1][1].draft.webMedia).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ assetId: "media-during-save" }),
			]),
		);
	});

	it("surfaces product media query failures", async () => {
		mocks.graphApiEnabled = true;
		mocks.mediaEnabled = true;
		mocks.mediaListError = new Error("media unavailable");
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.tapestry",
			productKind: "tapestry",
			graphVersion: 2,
			slug: "soft-portal",
			draft: fixedPriceGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not load product images",
		);
	});

	it("allows a set-member asset to become the single missing cover without changing its member relation", async () => {
		mocks.graphApiEnabled = true;
		mocks.mediaEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.enabledKinds = ["print", "print_set"];
		const firstMemberAsset = mediaAsset(
			"media-a",
			"55555555-5555-4555-8555-555555555555",
			"first-member.jpg",
		);
		const secondMemberAsset = mediaAsset(
			"media-b",
			"66666666-6666-4666-8666-666666666666",
			"second-member.jpg",
		);
		const revisionWithoutCover = {
			...printSetGraphRevision,
			draft: {
				...printSetGraphRevision.draft,
				webMedia: printSetGraphRevision.draft.webMedia.filter(
					(placement) => placement.role !== "cover",
				),
			},
			webMediaAssets: printSetGraphRevision.webMediaAssets.filter(
				(relation) => relation.placementKey !== "cover",
			),
		};
		mocks.mediaListData = {
			page: [firstMemberAsset, secondMemberAsset],
			isDone: true,
			continueCursor: "",
		};
		mocks.mediaPlacedData = [firstMemberAsset, secondMemberAsset];
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.printSet",
			productKind: "print_set",
			graphVersion: 2,
			slug: "twin-moons",
			draft: revisionWithoutCover,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};

		await mountDetail();
		button("choose existing image")?.click();
		await tick();
		const memberPickerRow = Array.from(document.querySelectorAll(".picker li"))
			.find((row) => row.textContent?.includes("first-member.jpg"));
		const addMemberAsCover = memberPickerRow?.querySelector("button") as HTMLButtonElement;
		expect(addMemberAsCover.textContent?.trim()).toBe("add");
		expect(addMemberAsCover.disabled).toBe(false);

		addMemberAsCover.click();
		await tick();
		expect(document.querySelector(".picker")).toBeNull();
		expect(button("choose existing image")).toBeDefined();
		const mediaRows = document.querySelectorAll(
			'section[aria-labelledby="catalog-product-media-heading"] li',
		);
		expect(mediaRows).toHaveLength(3);

		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const savedDraft = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		)?.[1].draft;
		expect(savedDraft.webMedia).toEqual([
			expect.objectContaining({
				key: "media-cover-55555555-5555-4555-8555-555555555555",
				role: "cover",
				assetId: "media-a",
				order: 0,
			}),
			expect.objectContaining({
				key: "member-a-media",
				role: "set_member",
				assetId: "media-a",
				order: 0,
			}),
			expect.objectContaining({
				key: "member-b-media",
				role: "set_member",
				assetId: "media-b",
				order: 1,
			}),
		]);
		expect(savedDraft.setMembers).toEqual([
			{
				key: "member-a",
				order: 0,
				mediaPlacementKey: "member-a-media",
				printSourceKey: "member-a-source",
			},
			{
				key: "member-b",
				order: 1,
				mediaPlacementKey: "member-b-media",
				printSourceKey: "member-b-source",
			},
		]);
	});

	it("saves migrated print-set graph drafts with ordered member references", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.printSet",
			productKind: "print_set",
			graphVersion: 2,
			slug: "twin-moons",
			draft: printSetGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		expect(document.body.textContent).toContain("set members");

		const name = input("product name");
		name!.value = "Twin Moons revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		document.querySelector("#catalog-set-members-heading")?.closest("section")?.querySelector("ol")?.dispatchEvent(new CustomEvent("finalize", { bubbles: true, detail: { items: [...printSetGraphRevision.draft.setMembers].reverse().map((member) => ({ ...member, id: member.key })), info: { source: "pointer", trigger: "droppedIntoZone", id: "member-b" } } }));
		await tick();

		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "graph-revision-set",
			}),
		);
		expect(saveCall?.[1].draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "print_set",
				title: "Twin Moons revised",
				seoDescription: "Imported print set SEO copy.",
				shopPlacement: { featured: true, orderRank: "d0" },
				printOptions: expect.objectContaining({ borderOptionsEnabled: true }),
			}),
		);
		expect(saveCall?.[1].draft.webMedia).toEqual([
			expect.objectContaining({ key: "cover", role: "cover", order: 0 }),
			expect.objectContaining({ key: "member-b-media", role: "set_member", order: 0 }),
			expect.objectContaining({ key: "member-a-media", role: "set_member", order: 1 }),
		]);
		expect(saveCall?.[1].draft.printSources).toEqual([
			expect.objectContaining({ key: "member-b-source", order: 0 }),
			expect.objectContaining({ key: "member-a-source", order: 1 }),
		]);
		expect(saveCall?.[1].draft.setMembers).toEqual([
			expect.objectContaining({ key: "member-b", order: 0 }),
			expect.objectContaining({ key: "member-a", order: 1 }),
		]);
	});

	it("saves migrated digital-download drafts while showing only safe paid-file metadata", async () => {
		mocks.graphApiEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.enabledKinds = ["print", "digital_download"];
		mocks.detailData = {
			productId: "product-1",
			productKey: "sanity.catalog.digitalDownload",
			productKind: "digital_download",
			graphVersion: 2,
			slug: "time-aware-theme",
			draft: digitalDownloadGraphRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		expect(document.querySelector(".settings-header .description")).toBeNull();
		expect(document.body.textContent).toContain("time-aware-theme-v1.0.0.zip");
		expect(document.querySelector("#catalog-download-file-heading")?.textContent).toBe("customer download");
		expect(document.querySelector("#catalog-download-file-heading")?.closest(".section-heading")?.querySelector(":scope > span")?.textContent).toBe("03");
		expect(document.querySelector("#sale-settings-heading")?.closest("section")?.contains(input("retail price (USD)")!)).toBe(true);
		expect(document.querySelector("#catalog-variants-heading")).toBeNull();
		expect(document.querySelector(".variant-heading")).toBeNull();
		expect(document.querySelector(".download-ready")?.textContent).toBe("time-aware-theme-v1.0.0.zip");
		expect(document.querySelector<HTMLInputElement>('[aria-label="choose customer download ZIP"]')?.accept)
			.toBe("application/zip,application/x-zip-compressed,.zip");
		expect(document.body.textContent).toContain("drop a ZIP here or click to choose");
		expect(document.body.textContent).toContain("ZIP · 16 MB max");
		expect(document.body.textContent).not.toContain("application/zip");
		expect(document.body.textContent).not.toContain("1.5 MB");
		expect(document.querySelector("#catalog-private-assets-heading")).toBeNull();
		expect(document.querySelector(".private-asset-metadata")).toBeNull();
		expect(document.body.textContent).not.toContain("verified replacement");
		expect(input("fulfillment")).toBeUndefined();
		expect(document.body.textContent).not.toContain("offer border options");
		expect(document.body.textContent).not.toContain("offer frame options");
		expect(document.body.textContent).not.toContain("set members");
		expect(button("add variant")).toBeUndefined();
		expect(input("material key")).toBeUndefined();
		expect(input("size key")).toBeUndefined();

		const name = input("product name");
		name!.value = "Time-aware theme revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("retail price (USD)");
		price!.value = "";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);
		expect(document.body.textContent).toContain(
			"Retail price must be at least $0.01.",
		);
		price!.value = "0";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);
		price!.value = "15.00";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(false);

		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "graph-revision-download",
			}),
		);
		expect(saveCall?.[1].draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "digital_download",
				fulfillmentMode: "digital_delivery",
				title: "Time-aware theme revised",
				seoDescription: "Imported download SEO copy.",
				shopPlacement: { featured: false, orderRank: "e0" },
				webMedia: digitalDownloadGraphRevision.draft.webMedia,
				paidFile: digitalDownloadGraphRevision.draft.paidFile,
			}),
		);
		expect(saveCall?.[1].draft.variants).toEqual([
			expect.objectContaining({
				key: "default",
				order: 0,
				retailPriceCents: 1500,
			}),
		]);
		expect(saveCall?.[1].draft).not.toHaveProperty("printOptions");
		expect(saveCall?.[1].draft).not.toHaveProperty("printSources");
		expect(saveCall?.[1].draft).not.toHaveProperty("setMembers");
	});

	it("uploads one print image through the paired private and display-media seam", async () => {
		mocks.graphApiEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.mediaEnabled = true;
		const currentDisplay = mediaAsset(
			"media-1",
			"11111111-1111-4111-8111-111111111111",
			"current-preview.jpg",
		);
		const replacementDisplay = mediaAsset(
			"media-new",
			"22222222-2222-4222-8222-222222222222",
			"new-preview.jpg",
		);
		const replacementSource = privatePrintAsset(
			"source-new",
			"new-full-resolution.png",
		);
		mocks.mediaPlacedData = [currentDisplay];
		mocks.detailData = graphDetail({
			...graphRevision,
			printSourceAssets: [{
				relationKey: "print-source",
				asset: privatePrintAsset("source-1", "current-full-resolution.png"),
			}],
		});
		mocks.artworkUpload.mockImplementation(async (
			_file: File,
			options: { onStatus: (status: "preparing") => void },
		) => {
			options.onStatus("preparing");
			return { displayAsset: replacementDisplay, privateAsset: replacementSource };
		});

		await mountDetail();
		expect(document.querySelector("#catalog-private-assets-heading")).toBeNull();
		expect(document.body.textContent).not.toContain("current-full-resolution.png");
		const file = new File([encodedPng()], "new-artwork.png", { type: "image/png" });
		chooseFile(
			document.querySelector<HTMLInputElement>(
				'label[aria-label="Upload product artwork"] input[type="file"]',
			)!,
			file,
		);
		await vi.waitFor(() => expect(document.body.textContent).toContain("new-preview.jpg"));

		expect(mocks.artworkUpload).toHaveBeenCalledWith(file, expect.objectContaining({
			productKind: "print",
			privatePrepareEndpoint: "/api/admin/catalog/private-upload/prepare",
			privateCompleteEndpoint: "/api/admin/catalog/private-upload/complete",
			mediaEndpoint: "/api/admin/media",
			signal: expect.anything(),
			onCheckpoint: expect.any(Function),
			onStatus: expect.any(Function),
		}));
		expect(document.body.textContent).not.toContain("new-full-resolution.png");

		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const savedDraft = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		)?.[1].draft;
		expect(savedDraft.webMedia).toEqual(expect.arrayContaining([
			expect.objectContaining({ role: "primary", assetId: "media-new" }),
		]));
		expect(savedDraft.printSources).toEqual([
			expect.objectContaining({ order: 0, assetId: "source-new" }),
		]);
	});

	it("attaches print-set artwork in the selected file order", async () => {
		mocks.graphApiEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.mediaEnabled = true;
		mocks.enabledKinds = ["print", "print_set"];
		const emptySetRevision = {
			...printSetGraphRevision,
			draft: {
				...printSetGraphRevision.draft,
				webMedia: [],
				printSources: [],
				setMembers: [],
			},
			webMediaAssets: [],
			printSourceAssets: [],
		};
		mocks.detailData = {
			productId: "product-1",
			productKey: "catalog.printSet.new",
			productKind: "print_set",
			graphVersion: 2,
			slug: "new-print-set",
			draft: emptySetRevision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		const firstDisplay = mediaAsset(
			"media-first",
			"33333333-3333-4333-8333-333333333333",
			"first-preview.jpg",
		);
		const secondDisplay = mediaAsset(
			"media-second",
			"44444444-4444-4444-8444-444444444444",
			"second-preview.jpg",
		);
		const firstSource = privatePrintAsset("source-first", "first-original.png");
		const secondSource = privatePrintAsset("source-second", "second-original.png");
		let finishFirst: ((result: {
			displayAsset: typeof firstDisplay;
			privateAsset: typeof firstSource;
		}) => void) | undefined;
		let finishSecond: ((result: {
			displayAsset: typeof secondDisplay;
			privateAsset: typeof secondSource;
		}) => void) | undefined;
		mocks.artworkUpload
			.mockImplementationOnce(() => new Promise((resolve) => {
				finishFirst = resolve;
			}))
			.mockImplementationOnce(() => new Promise((resolve) => {
				finishSecond = resolve;
			}));

		await mountDetail();
		const firstFile = new File([encodedPng()], "first.png", { type: "image/png" });
		const secondFile = new File([encodedPng()], "second.png", { type: "image/png" });
		chooseFiles(
			document.querySelector<HTMLInputElement>(
				'label[aria-label="Upload product artwork"] input[type="file"]',
			)!,
			[firstFile, secondFile],
		);
		await vi.waitFor(() => expect(mocks.artworkUpload).toHaveBeenCalledTimes(1));
		expect(mocks.artworkUpload.mock.calls[0][0]).toBe(firstFile);
		finishFirst?.({ displayAsset: firstDisplay, privateAsset: firstSource });
		await vi.waitFor(() => expect(mocks.artworkUpload).toHaveBeenCalledTimes(2));
		expect(mocks.artworkUpload.mock.calls[1][0]).toBe(secondFile);
		finishSecond?.({ displayAsset: secondDisplay, privateAsset: secondSource });
		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("first-preview.jpg");
			expect(document.body.textContent).toContain("second-preview.jpg");
		});
		for (const [, options] of mocks.artworkUpload.mock.calls) {
			expect(options).toEqual(expect.objectContaining({
				productKind: "print_set",
				privatePrepareEndpoint: "/api/admin/catalog/private-upload/prepare",
				privateCompleteEndpoint: "/api/admin/catalog/private-upload/complete",
				mediaEndpoint: "/api/admin/media",
			}));
		}
		expect(document.body.textContent).not.toContain("first-original.png");
		expect(document.body.textContent).not.toContain("second-original.png");

		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const savedDraft = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		)?.[1].draft;
		expect(savedDraft.printSources.map((source: { assetId: string }) => source.assetId))
			.toEqual(["source-first", "source-second"]);
		expect(savedDraft.webMedia
			.filter((placement: { role: string }) => placement.role === "set_member")
			.map((placement: { assetId: string }) => placement.assetId))
			.toEqual(["media-first", "media-second"]);
		expect(savedDraft.webMedia.filter((placement: { role: string }) => placement.role === "cover"))
			.toEqual([expect.objectContaining({ assetId: "media-first" })]);
		expect(savedDraft.setMembers).toHaveLength(2);
		expect(savedDraft.setMembers.map((member: {
			mediaPlacementKey: string;
			printSourceKey: string;
		}) => ({
			mediaAssetId: savedDraft.webMedia.find(
				(placement: { key: string }) => placement.key === member.mediaPlacementKey,
			)?.assetId,
			printAssetId: savedDraft.printSources.find(
				(source: { key: string }) => source.key === member.printSourceKey,
			)?.assetId,
		}))).toEqual([
			{ mediaAssetId: "media-first", printAssetId: "source-first" },
			{ mediaAssetId: "media-second", printAssetId: "source-second" },
		]);
	});

	it("attaches a customer ZIP through the compact download control", async () => {
		mocks.graphApiEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.enabledKinds = ["digital_download"];
		const draftWithoutFile = {
			...digitalDownloadGraphRevision,
			draft: {
				...digitalDownloadGraphRevision.draft,
				paidFile: undefined,
			},
			paidFileAsset: null,
		};
		mocks.detailData = {
			productId: "product-1",
			productKey: "catalog.digital.new",
			productKind: "digital_download",
			graphVersion: 2,
			slug: "night-preset",
			draft: draftWithoutFile,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		const verified = {
			kind: "paid_digital_file",
			assetId: "paid-file-new",
			status: "verified",
			originalFilename: "night-preset.zip",
			mimeType: "application/zip",
			sizeBytes: 3,
			version: "1.0.0",
			createdAt: 1,
		};
		const relationUuid = "123e4567-e89b-42d3-a456-426614174010";
		const uploadUuid = "123e4567-e89b-42d3-a456-426614174011";
		vi.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce(relationUuid)
			.mockReturnValueOnce(uploadUuid);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(Response.json({
				status: "upload_required",
				uploadHandle: uploadUuid,
				uploadUrl: "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source",
				uploadToken: "opaque-token",
				uploadExpiresAt: "2026-01-01T00:00:00.000Z",
			}))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(Response.json({ status: "verified", asset: verified }));
		vi.stubGlobal("fetch", fetchMock);

		await mountDetail();
		expect(document.querySelector("#catalog-private-assets-heading")).toBeNull();
		expect(document.body.textContent).not.toContain("verified replacement");
		expect(input("version (optional)")).toBeUndefined();
		const file = new File([encodedZip()], "night-preset.zip", { type: "application/x-zip-compressed" });
		Object.defineProperty(file, "arrayBuffer", {
			value: vi.fn(async () => encodedZip().buffer),
		});
		chooseFile(
			document.querySelector<HTMLInputElement>('[aria-label="choose customer download ZIP"]')!,
			file,
		);
		await tick();
		const version = input("version (optional)")!;
		version.value = "1.0.0";
		version.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("upload file")?.disabled).toBe(false);
		const productName = input("product name")!;
		const originalName = productName.value;
		productName.value = `${originalName} revised`;
		productName.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(version.disabled).toBe(true);
		expect(button("upload file")?.disabled).toBe(true);
		productName.value = originalName;
		productName.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(version.disabled).toBe(false);
		expect(button("upload file")?.disabled).toBe(false);
		button("upload file")?.click();
		await vi.waitFor(() => expect(document.body.textContent, `${document.body.textContent}\nfetches:${fetchMock.mock.calls.length}`).toContain("attached to this draft"));
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"/api/admin/catalog/private-upload/prepare",
			"https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source",
			"/api/admin/catalog/private-upload/complete",
		]);
		const prepareSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;
		const putSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit).signal;
		const completionSignal = (fetchMock.mock.calls[2]?.[1] as RequestInit).signal;
		expect(prepareSignal).toBeInstanceOf(AbortSignal);
		expect(putSignal).toBe(prepareSignal);
		expect(completionSignal).toBeInstanceOf(AbortSignal);
		expect(completionSignal).not.toBe(prepareSignal);
		expect(document.body.textContent).not.toContain("verified and ready to use");
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saveCall = mocks.mutation.mock.calls.find(([ref]) => ref === mocks.refs.saveDraft);
		expect(saveCall?.[1].draft.paidFile).toEqual({
			key: `download-${relationUuid}`,
			assetId: "paid-file-new",
			version: "1.0.0",
		});
	});

	it("accepts a delayed own-save query echo without replacing the next local edit", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		mocks.mutation
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-2",
			})
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-3",
			});
		await mountDetail();

		const name = input("product name");
		name!.value = "First saved title";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		name!.value = "A later local edit";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		await updateDetailQuery({
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: {
				...revision,
				revisionId: "revision-2",
				title: "First saved title",
				createdAt: 2,
			},
			published: null,
			updatedAt: 2,
			publishedAt: null,
		});

		expect(input("product name")?.value).toBe("A later local edit");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCalls = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCalls).toHaveLength(2);
		expect(saveCalls[1][1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "revision-2",
				draft: expect.objectContaining({ title: "A later local edit" }),
			}),
		);
	});

	it("surfaces save conflicts without replacing local work", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		mocks.mutation.mockRejectedValueOnce(
			new Error("Catalog draft conflict: reload before saving"),
		);
		await mountDetail();
		const name = input("product name");
		name!.value = "Unsaved local title";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Reload this product before continuing.",
		);
		expect(input("product name")?.value).toBe("Unsaved local title");
		expect(button("save draft")?.disabled).toBe(true);
	});

	it("accepts USD prices and blocks values beyond two decimal places", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();
		const name = input("product name");
		name!.value = "Lake print revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("retail price (USD)");
		price!.value = "12.501";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(price?.getAttribute("aria-invalid")).toBe("true");
		expect(button("save draft")?.disabled).toBe(true);
		expect(mocks.mutation).not.toHaveBeenCalled();

		price!.value = "0";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(price?.getAttribute("aria-invalid")).toBe("true");
		expect(button("save draft")?.disabled).toBe(true);
		price!.value = "12.50";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1].draft.variants[0].retailPriceCents).toBe(1250);
	});

	it("does not let a hidden invalid frame multiplier block an otherwise valid save", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();

		const name = input("product name");
		name!.value = "Lake print revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const frames = segmentedChoice("frame options", "offer frames");
		frames!.click();
		await tick();
		const multiplier = input("frame price multiplier");
		multiplier!.value = "12.34567";
		multiplier!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);

		segmentedChoice("frame options", "no frames")!.click();
		await tick();
		expect(input("frame price multiplier")).toBeFalsy();
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1].draft).toEqual(
			expect.objectContaining({
				frameOptionsEnabled: false,
				framePriceMultiplierBasisPoints: 10_000,
			}),
		);
	});

	it("keeps the active draft when discard confirmation is cancelled", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
		await mountDetail();

		button("discard draft")?.click();
		await tick();

		expect(confirm).toHaveBeenCalledOnce();
		expect(mocks.mutation).not.toHaveBeenCalled();
		expect(button("save draft")).toBeUndefined();
		expect(document.querySelector("#discarded-product-heading")).toBeNull();
	});

	it("preserves a restarted draft edit across delayed discard and restart query echoes", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: revision,
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		vi.spyOn(globalThis, "confirm").mockReturnValue(true);
		mocks.mutation
			.mockResolvedValueOnce({ productId: "product-1", draftRevisionId: null })
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-restarted",
			})
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-after-edit",
			});
		await mountDetail();

		button("discard draft")?.click();
		await tick();
		await Promise.resolve();
		expect(button("start a new draft")).toBeDefined();

		button("start a new draft")?.click();
		await tick();
		await Promise.resolve();
		const name = input("product name");
		name!.value = "Edit after restarting";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		await updateDetailQuery({
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: null,
			draft: null,
			published: null,
			updatedAt: 2,
			publishedAt: null,
		});
		expect(input("product name")?.value).toBe("Edit after restarting");
		expect(document.querySelector('[role="alert"]')).toBeNull();

		await updateDetailQuery({
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: null,
			draft: {
				...revision,
				revisionId: "revision-restarted",
				title: null,
				slug: null,
				description: null,
				saleAvailability: "unavailable",
				frameOptionsEnabled: false,
				framePriceMultiplierBasisPoints: 10_000,
				variantCount: 0,
				variants: [],
				createdAt: 3,
			},
			published: null,
			updatedAt: 3,
			publishedAt: null,
		});

		expect(input("product name")?.value).toBe("Edit after restarting");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const saveCalls = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCalls).toHaveLength(2);
		expect(saveCalls[1][1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "revision-restarted",
				draft: expect.objectContaining({ title: "Edit after restarting" }),
			}),
		);
	});

	it("renders the product-list query error instead of an empty state", async () => {
		mocks.listError = new Error("list failed");
		await mountList();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not load product drafts",
		);
		expect(document.body.textContent).not.toContain("No product drafts yet.");
	});

	it("renders the product-detail query error instead of loading forever", async () => {
		mocks.detailError = new Error("detail failed");
		await mountDetail();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not load this product draft",
		);
		expect(document.querySelector('[role="status"]')).toBeNull();
	});

	it("disables additions and explains the 100-variant UI limit", async () => {
		const variants = Array.from({ length: 100 }, (_, index) => ({
			key: `variant-${index}`,
			order: index,
			materialOptionKey: null,
			sizeOptionKey: null,
			retailPriceCents: null,
			status: "enabled",
		}));
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: "lake-print",
			draft: { ...revision, variantCount: variants.length, variants },
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		await mountDetail();

		expect(button("add variant")?.disabled).toBe(true);
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			"reached the 100-variant limit",
		);
		expect(document.querySelectorAll("ol > li")).toHaveLength(100);
	});

	it("shows a truthful discarded state and can start a replacement draft", async () => {
		mocks.detailData = {
			productId: "product-1",
			productKey: "print-one",
			productKind: "print",
			slug: null,
			draft: null,
			published: null,
			updatedAt: 2,
			publishedAt: null,
		};
		await mountDetail();
		expect(
			document.querySelector("#discarded-product-heading")?.textContent,
		).toBe("no active draft");
		expect(document.body.textContent).toContain(
			"No product details are currently staged.",
		);
		button("start a new draft")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledWith(
			mocks.refs.saveDraft,
			expect.objectContaining({ productId: "product-1" }),
		);
		expect(button("save draft")).toBeUndefined();
	});
});
