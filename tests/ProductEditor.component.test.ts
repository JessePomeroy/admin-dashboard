import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductPage from "../src/lib/pages/editor/ProductPage.svelte";
import ProductsPage from "../src/lib/pages/editor/ProductsPage.svelte";

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
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
	mediaEnabled: false,
	mediaRegisterEnabled: true,
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
				if (ref.name === "catalog:listForEditor") return mocks.listData;
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
function chooseFile(input: HTMLInputElement, file: File) {
	Object.defineProperty(input, "files", {
		configurable: true,
		value: Object.assign([file], {
			item: (index: number) => index === 0 ? file : null,
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
	["A print needs one verified print source before publishing", "verified print source"],
	["A non-empty print set is required before publishing", "print-set member"],
	["A digital download needs a verified paid file before publishing", "paid file"],
	["Catalog print needs required display media before publishing", "display media and alternative text"],
] as const;

describe("draft-only product editor", () => {
	beforeEach(() => {
		mocks.upload.mockReset();
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
		mocks.mediaEnabled = false;
		mocks.mediaRegisterEnabled = true;
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
		expect(document.body.textContent).toContain(
			"Nothing in this workspace is published to the shop yet.",
		);
		expect(
			Array.from(
				document.querySelectorAll(".status"),
				(item) => item.textContent,
			),
		).toEqual(["draft", "discarded"]);
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
		expect(document.body.textContent).toContain(
			"Public Shop authority is configured separately",
		);
		expect(document.body.textContent).not.toContain("publish");
		button("add variant")?.click();
		await tick();
		(
			document.querySelector(
				'[aria-label="Move variant 2 earlier"]',
			) as HTMLButtonElement | null
		)?.click();
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
		expect(document.body.textContent).toContain(
			"Public Shop authority is configured separately",
		);
		expect(document.querySelector(".publication")).toBeNull();
		expect(document.querySelector(".publication-evidence")).toBeNull();
		expect(button("publish")).toBeUndefined();
		expect(document.body.textContent).not.toContain("discard draft");

		const name = input("product name");
		name!.value = "Avant Alien 2.2 revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const availability = Array.from(document.querySelectorAll("label"))
			.find((item) => item.textContent?.includes("sale availability"))
			?.querySelector("select") as HTMLSelectElement | null;
		availability!.value = "unavailable";
		availability!.dispatchEvent(new Event("change", { bubbles: true }));
		button("add variant")?.click();
		await tick();
		(
			document.querySelector(
				'[aria-label="Move variant 2 earlier"]',
			) as HTMLButtonElement | null
		)?.click();
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

	it("shows exact publication evidence from the current query without a Shop authority claim", async () => {
		enablePublication();
		mocks.detailData = graphDetail(graphRevision, null, 1_750_000_000_000);
		await mountDetail();
		const status = () => document.querySelector(".publication-status")?.textContent;
		const evidence = () => document.querySelector(".publication-evidence")!;
		expect(status()).toBe("unpublished");
		expect(evidence().tagName).toBe("DL");
		expect(Array.from(evidence().querySelectorAll("code"), (node) => node.textContent)).toEqual([
			"graph-revision-1", "none — not published", "1750000000000",
		]);
		expect(evidence().querySelector("time")?.getAttribute("datetime")).toBe("2025-06-15T15:06:40.000Z");
		expect(evidence().textContent).toContain("not published");
		expect(document.body.textContent).toContain("Convex publication is separate; public Shop authority is configured separately.");
		expect(document.body.textContent).not.toMatch(/Sanity-backed public Shop|cut over|still not connected|public Shop is unchanged/i);
		expect(button("publish")?.textContent).toBe("publish to Convex CMS");

		await updateDetailQuery(graphDetail(graphRevision, graphRevision, 1_750_000_000_001));
		expect(status()).toBe("published — current draft");
		expect(Array.from(evidence().querySelectorAll("code"), (node) => node.textContent)).toEqual([
			"graph-revision-1", "graph-revision-1", "1750000000001", "1750000000001",
		]);
		expect(Array.from(evidence().querySelectorAll("time"), (node) => node.getAttribute("datetime"))).toEqual([
			"2025-06-15T15:06:40.001Z", "2025-06-15T15:06:40.001Z",
		]);
		const newerDraft = { ...graphRevision, revisionId: "graph-revision-2", createdAt: 12 };
		await updateDetailQuery(graphDetail(newerDraft, graphRevision, 1_750_000_000_002));
		expect(status()).toBe("published — newer draft available");
	});

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
		expect(button("publish")?.disabled).toBe(true);
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
		expect(button("publish")?.disabled).toBe(true);
		button("save draft")?.click();
		await tick();
		expect(button("publish")?.disabled).toBe(true);
		finishSave?.({ revisionId: "graph-revision-2" });
		await Promise.resolve();
		await tick();
		expect(button("publish")?.disabled).toBe(true);

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
		expect(button("unpublish")?.disabled).toBe(true);
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
		expect(document.body.textContent).toContain(
			"Edit this private imported tapestry draft",
		);
		expect(document.body.textContent).not.toContain("fulfillment");
		expect(document.body.textContent).not.toContain("offer frame options");
		expect(button("add variant")).toBeUndefined();
		expect(input("material key")).toBeUndefined();
		expect(input("size key")).toBeUndefined();

		const name = input("product name");
		name!.value = "Soft Portal revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("retail price (cents)");
		price!.value = "9000";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
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
			}),
		]);
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
		expect(mediaSection.textContent).toContain("first.jpg");
		expect(mediaSection.textContent).toContain("second.jpg");
		expect(mediaSection.textContent).not.toContain("hidden-share.jpg");
		expect(mediaSection.querySelectorAll("li")).toHaveLength(2);
		expect(mediaSection.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true);

		(mediaSection.querySelector(
			'[aria-label="Move image 2 earlier"]',
		) as HTMLButtonElement).click();
		await tick();
		const firstAlt = mediaSection.querySelectorAll<HTMLInputElement>('input[maxlength="1000"]')[0];
		firstAlt.value = "Second image revised";
		firstAlt.dispatchEvent(new Event("input", { bubbles: true }));
		button("choose from media")?.click();
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
		expect(document.body.textContent).toContain(
			"Edit this private imported print set draft",
		);
		expect(document.body.textContent).toContain("set members");

		const name = input("product name");
		name!.value = "Twin Moons revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		(
			document.querySelector(
				'[aria-label="Move set member 2 earlier"]',
			) as HTMLButtonElement | null
		)?.click();
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
		expect(document.body.textContent).toContain(
			"Edit this private imported digital download draft",
		);
		expect(document.body.textContent).toContain("time-aware-theme-v1.0.0.zip");
		expect(document.body.textContent).toContain("verified");
		expect(document.body.textContent).toContain("application/zip");
		expect(document.body.textContent).toContain("1.5 MB");
		expect(document.body.textContent).toContain("1.0.0");
		expect(document.body.textContent).not.toContain("fulfillment");
		expect(document.body.textContent).not.toContain("offer border options");
		expect(document.body.textContent).not.toContain("offer frame options");
		expect(document.body.textContent).not.toContain("set members");
		expect(button("add variant")).toBeUndefined();
		expect(input("material key")).toBeUndefined();
		expect(input("size key")).toBeUndefined();

		const name = input("product name");
		name!.value = "Time-aware theme revised";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		const price = input("retail price (cents)");
		price!.value = "";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);
		expect(document.body.textContent).toContain(
			"Retail price cents must be at least 1.",
		);
		price!.value = "0";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);
		price!.value = "1500";
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

	it("stages one paid upload unattached, then uses the existing confirmed CAS replacement", async () => {
		vi.useFakeTimers();
		enablePublication();
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
		const replacement = {
			...digitalDownloadGraphRevision.paidFileAsset.asset,
			assetId: "paid-file-2",
			originalFilename: "time-aware-theme-v2.zip",
			version: "2.0.0",
			createdAt: 1_760_000_000_000,
		};
		mocks.candidateData = {
			draftRevisionId: "graph-revision-download",
			relation: {
				kind: "paid_digital_file",
				relationKey: "download",
				currentAsset: digitalDownloadGraphRevision.paidFileAsset.asset,
			},
			page: [digitalDownloadGraphRevision.paidFileAsset.asset],
		};
		const pendingCompletion = () => Response.json(
			{ status: "pending_inspection" },
			{ status: 202, headers: { "Retry-After": "1" } },
		);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(Response.json({
				status: "upload_required",
				uploadHandle: "123e4567-e89b-42d3-a456-426614174000",
				uploadUrl: "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source",
				uploadToken: "opaque-token",
				uploadExpiresAt: "2026-01-01T00:00:00.000Z",
			}))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(pendingCompletion())
			.mockResolvedValueOnce(pendingCompletion())
			.mockResolvedValueOnce(pendingCompletion())
			.mockResolvedValueOnce(pendingCompletion())
			.mockResolvedValueOnce(Response.json({ status: "verified", asset: replacement }));
		vi.stubGlobal("fetch", fetchMock);
		const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
		vi.spyOn(globalThis, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

		await mountDetail();
		expect(button("publish")?.disabled).toBe(false);
		button("choose replacement")?.click();
		await tick();
		expect(mocks.candidateArgs).toEqual({
			productId: "product-1",
			expectedDraftRevisionId: "graph-revision-download",
			relation: { kind: "paid_digital_file", relationKey: "download" },
			paginationOpts: { numItems: 25, cursor: null },
		});
		const file = new File(["zip"], "time-aware-theme-v2.zip", { type: "application/zip" });
		Object.defineProperty(file, "arrayBuffer", {
			value: vi.fn(async () => new TextEncoder().encode("zip").buffer),
		});
		chooseFile(document.querySelector<HTMLInputElement>('.private-upload input[type="file"]')!, file);
		const version = input("version (optional)");
		version!.value = " 2.0.0 ";
		version!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		const stageUpload = button("stage verified asset");
		expect(stageUpload, document.body.textContent ?? "").toBeDefined();
		expect(stageUpload?.disabled, document.body.textContent ?? "").toBe(false);
		stageUpload?.click();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		await tick();
		expect(document.body.textContent).toContain("It will be checked automatically.");
		expect(button("publish")?.disabled).toBe(true);
		const completionCalls = () => fetchMock.mock.calls.filter(
			([input]) => input === "/api/admin/catalog/private-upload/complete",
		);
		const putCalls = () => fetchMock.mock.calls.filter(([, init]) =>
			(init as RequestInit).method === "PUT");
		for (let automaticCheck = 0; automaticCheck < 3; automaticCheck += 1) {
			expect(completionCalls()).toHaveLength(automaticCheck + 1);
			expect(button("check again")).toBeUndefined();
			await vi.advanceTimersByTimeAsync(65_000);
			await tick();
		}
		expect(completionCalls()).toHaveLength(4);
		expect(new Set(completionCalls().map(([, init]) => (init as RequestInit).body)).size).toBe(1);
		expect(fetchMock.mock.calls.filter(
			([input]) => input === "/api/admin/catalog/private-upload/prepare",
		)).toHaveLength(1);
		expect(putCalls()).toHaveLength(1);
		expect(button("check again")?.disabled).toBe(true);
		await vi.advanceTimersByTimeAsync(1_000);
		await tick();
		expect(button("check again")?.disabled).toBe(false);
		button("check again")?.click();
		await vi.waitFor(() => expect(document.body.textContent).toContain("verified, staged unattached, and selected"));
		expect(document.body.textContent).toContain("verified, staged unattached, and selected");
		expect(randomUUID).toHaveBeenCalledOnce();
		expect(button("stage verified asset")?.disabled).toBe(true);
		button("stage verified asset")?.click();
		await tick();
		expect(putCalls()).toHaveLength(1);
		const select = document.querySelector<HTMLSelectElement>(
			'select[aria-label="Replacement for paid download"]',
		)!;
		expect(select.value).toBe(replacement.assetId);
		expect(mocks.mutation).not.toHaveBeenCalled();

		button("replace asset")?.click();
		await tick();
		expect(mocks.mutation).not.toHaveBeenCalled();
		mocks.mutation.mockResolvedValueOnce({ revisionId: "graph-revision-download-2" });
		button("replace asset")?.click();
		await tick();
		await Promise.resolve();
		expect(mocks.mutation).toHaveBeenCalledWith(mocks.refs.replaceDraftPrivateAsset, {
			productId: "product-1",
			expectedDraftRevisionId: "graph-revision-download",
			relation: {
				kind: "paid_digital_file",
				relationKey: "download",
				assetId: "paid-file-2",
			},
		});
		expect(document.querySelector(".save-state")?.textContent).toBe("replacing");
		expect(input("product name")?.disabled).toBe(true);

		await updateDetailQuery({
			...mocks.detailData as object,
			draft: {
				...digitalDownloadGraphRevision,
				revisionId: "graph-revision-download-2",
				paidFileAsset: { relationKey: "download", asset: replacement },
			},
			updatedAt: 2,
		});
		expect(document.querySelector(".save-state")?.textContent).toBe("saved");
		expect(input("product name")?.disabled).toBe(false);
		expect(button("publish")?.disabled).toBe(false);
	});

	it("starts a distinct upload after the first replacement echo and cleans up pending checks", async () => {
		vi.useFakeTimers();
		mocks.graphApiEnabled = true;
		mocks.privateAssetEnabled = true;
		mocks.enabledKinds = ["print", "print_set"];
		const firstCurrent = privatePrintAsset("source-a", "member-a.png");
		const secondCurrent = privatePrintAsset("source-b", "member-b.png");
		const firstStaged = privatePrintAsset("source-a-2", "member-a-2.png");
		const detail = {
			productId: "product-1",
			productKey: "sanity.catalog.printSet",
			productKind: "print_set",
			graphVersion: 2,
			slug: "twin-moons",
			draft: {
				...printSetGraphRevision,
				printSourceAssets: [
					{ relationKey: "member-a-source", asset: firstCurrent },
					{ relationKey: "member-b-source", asset: secondCurrent },
				],
			},
			published: null,
			updatedAt: 1,
			publishedAt: null,
		};
		mocks.detailData = detail;
		mocks.candidateData = {
			draftRevisionId: "graph-revision-set",
			relation: {
				kind: "print_source",
				relationKey: "member-a-source",
				currentAsset: firstCurrent,
			},
			page: [firstCurrent],
		};
		const handles = [
			"123e4567-e89b-42d3-a456-426614174000",
			"123e4567-e89b-42d3-a456-426614174001",
		] as const;
		const prepared = (uploadHandle: string, uploadToken: string) => Response.json({
			status: "upload_required",
			uploadHandle,
			uploadUrl: "https://cms-media-worker.thinkingofview.workers.dev/v1/catalog-assets/editor-uploads/source",
			uploadToken,
			uploadExpiresAt: "2026-01-01T00:00:00.000Z",
		});
		const pendingCompletion = () => Response.json(
			{ status: "pending_inspection" },
			{ status: 202, headers: { "Retry-After": "1" } },
		);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(prepared(handles[0], "first-token"))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(pendingCompletion())
			.mockResolvedValueOnce(Response.json({ status: "verified", asset: firstStaged }))
			.mockResolvedValueOnce(prepared(handles[1], "second-token"))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(pendingCompletion());
		vi.stubGlobal("fetch", fetchMock);
		const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce(handles[0])
			.mockReturnValueOnce(handles[1]);
		vi.spyOn(globalThis, "confirm").mockReturnValue(true);
		mocks.mutation.mockResolvedValueOnce({ revisionId: "graph-revision-set-2" });

		await mountDetail();
		button("choose replacement")?.click();
		await tick();
		chooseFile(
			document.querySelector<HTMLInputElement>('.private-upload input[type="file"]')!,
			new File([encodedPng()], "member-a-2.png", { type: "image/png" }),
		);
		await tick();
		button("stage verified asset")?.click();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		await tick();
		vi.setSystemTime(Date.now() + 306_000);
		await vi.advanceTimersByTimeAsync(65_000);
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(button("check again")?.disabled).toBe(false);
		button("check again")?.click();
		await vi.waitFor(() => expect(document.body.textContent).toContain("member-a-2.png is verified"));
		const putCalls = () => fetchMock.mock.calls.filter(([, init]) =>
			(init as RequestInit).method === "PUT");
		expect(putCalls()).toHaveLength(1);
		button("stage verified asset")?.click();
		await tick();
		expect(putCalls()).toHaveLength(1);

		button("replace asset")?.click();
		await vi.waitFor(() => expect(mocks.mutation).toHaveBeenCalledOnce());
		expect(randomUUID).toHaveBeenCalledOnce();
		expect(input("product name")?.disabled).toBe(true);
		await updateDetailQuery({
			...detail,
			draft: {
				...detail.draft,
				revisionId: "graph-revision-set-2",
				printSourceAssets: [
					{ relationKey: "member-a-source", asset: firstStaged },
					{ relationKey: "member-b-source", asset: secondCurrent },
				],
			},
			updatedAt: 2,
		});

		mocks.candidateData = {
			draftRevisionId: "graph-revision-set-2",
			relation: {
				kind: "print_source",
				relationKey: "member-b-source",
				currentAsset: secondCurrent,
			},
			page: [secondCurrent],
		};
		const secondRelation = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((item) => item.textContent?.trim() === "choose replacement"
				&& item.closest("li")?.textContent?.includes("member 2"));
		secondRelation?.click();
		await tick();
		chooseFile(
			document.querySelector<HTMLInputElement>('.private-upload input[type="file"]')!,
			new File([encodedPng()], "member-b-2.png", { type: "image/png" }),
		);
		await tick();
		button("stage verified asset")?.click();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
		await tick();
		expect(randomUUID).toHaveBeenCalledTimes(2);
		expect(putCalls()).toHaveLength(2);
		unmount(components.pop()!);
		await vi.advanceTimersByTimeAsync(65_000);
		expect(fetchMock).toHaveBeenCalledTimes(7);
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

	it("blocks stale-price saves until whole cents are valid", async () => {
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
		const price = input("retail price (cents)");
		price!.value = "12.50";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(price?.getAttribute("aria-invalid")).toBe("true");
		expect(button("save draft")?.disabled).toBe(true);
		expect(mocks.mutation).not.toHaveBeenCalled();

		price!.value = "0";
		price!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();
		const saveCall = mocks.mutation.mock.calls.find(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCall?.[1].draft.variants[0].retailPriceCents).toBe(0);
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
		const frames = checkbox("offer frame options");
		frames!.click();
		await tick();
		const multiplier = input("frame price multiplier");
		multiplier!.value = "12.5";
		multiplier!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(button("save draft")?.disabled).toBe(true);

		frames!.click();
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
		expect(button("save draft")).toBeDefined();
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
		expect(button("save draft")).toBeDefined();
	});
});
