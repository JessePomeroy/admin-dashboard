import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductPage from "../src/lib/pages/editor/ProductPage.svelte";
import ProductsPage from "../src/lib/pages/editor/ProductsPage.svelte";

const mocks = vi.hoisted(() => ({
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
	notifyQuery: undefined as (() => void) | undefined,
	enabledKinds: ["print"] as string[],
	refs: {
		listForEditor: { name: "catalog:listForEditor" },
		getEditorState: { name: "catalog:getEditorState" },
		createDraft: { name: "catalog:createDraft" },
		saveDraft: { name: "catalog:saveDraft" },
		discardDraft: { name: "catalog:discardDraft" },
	},
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("convex-svelte", async () => {
	const { createSubscriber } = await import("svelte/reactivity");
	const subscribe = createSubscriber((update) => {
		mocks.notifyQuery = update;
		return () => {
			if (mocks.notifyQuery === update) mocks.notifyQuery = undefined;
		};
	});
	return {
		useQuery: (ref: { name?: string }) => ({
			get data() {
				subscribe();
				return ref.name === "catalog:listForEditor"
					? mocks.listData
					: mocks.detailData;
			},
			get error() {
				subscribe();
				return ref.name === "catalog:listForEditor"
					? mocks.listError
					: mocks.detailError;
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
		api: { catalogProducts: mocks.refs },
		editor: {
			products: {
				baseHref: "/admin/editor/products",
				enabledKinds: mocks.enabledKinds,
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
	webMediaAssets: [{ placementKey: "web-primary", asset: { assetId: "media-1" } }],
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
	webMediaAssets: [{ placementKey: "web-primary", asset: { assetId: "media-2" } }],
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
				order: 1,
				role: "set_member",
				assetId: "media-a",
				altText: "First print.",
			},
			{
				key: "member-b-media",
				order: 2,
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
		{ placementKey: "cover", asset: { assetId: "media-cover" } },
		{ placementKey: "member-a-media", asset: { assetId: "media-a" } },
		{ placementKey: "member-b-media", asset: { assetId: "media-b" } },
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
		{ placementKey: "web-primary", asset: { assetId: "media-download" } },
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
	return Array.from(document.querySelectorAll("button")).find(
		(item) => item.textContent?.trim() === label,
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
async function updateDetailQuery(value: unknown) {
	mocks.detailData = value;
	mocks.notifyQuery?.();
	await tick();
	await tick();
}

describe("draft-only product editor", () => {
	beforeEach(() => {
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
		mocks.enabledKinds = ["print"];
	});
	afterEach(() => {
		for (const component of components.splice(0)) unmount(component);
		document.body.innerHTML = "";
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
			"not connected to the public shop",
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
			"still not connected to the public shop",
		);
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
				webMedia: printSetGraphRevision.draft.webMedia,
				printSources: printSetGraphRevision.draft.printSources,
				printOptions: expect.objectContaining({ borderOptionsEnabled: true }),
			}),
		);
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
		expect(document.querySelector('input[type="file"]')).toBeNull();
		expect(button("replace file")).toBeUndefined();
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

	it("preserves ordered repeated discard and restart echoes across two cycles", async () => {
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
				revisionId: "revision-restarted-1",
			})
			.mockResolvedValueOnce({ productId: "product-1", draftRevisionId: null })
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-restarted-2",
			})
			.mockResolvedValueOnce({
				productId: "product-1",
				revisionId: "revision-after-two-cycles",
			});
		await mountDetail();

		for (let cycle = 0; cycle < 2; cycle += 1) {
			button("discard draft")?.click();
			await tick();
			await Promise.resolve();
			button("start a new draft")?.click();
			await tick();
			await Promise.resolve();
		}
		const name = input("product name");
		name!.value = "Edit after two restarts";
		name!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		const emptyRevision = (revisionId: string, createdAt: number) => ({
			...revision,
			revisionId,
			title: null,
			slug: null,
			description: null,
			saleAvailability: "unavailable",
			frameOptionsEnabled: false,
			framePriceMultiplierBasisPoints: 10_000,
			variantCount: 0,
			variants: [],
			createdAt,
		});
		const delayedEchoes = [
			{ draft: null, updatedAt: 2 },
			{ draft: emptyRevision("revision-restarted-1", 3), updatedAt: 3 },
			{ draft: null, updatedAt: 4 },
			{ draft: emptyRevision("revision-restarted-2", 5), updatedAt: 5 },
		];
		for (const echo of delayedEchoes) {
			await updateDetailQuery({
				productId: "product-1",
				productKey: "print-one",
				productKind: "print",
				slug: null,
				draft: echo.draft,
				published: null,
				updatedAt: echo.updatedAt,
				publishedAt: null,
			});
			expect(input("product name")?.value).toBe("Edit after two restarts");
			expect(document.querySelector('[role="alert"]')).toBeNull();
		}

		expect(button("save draft")?.disabled).toBe(false);
		button("save draft")?.click();
		await tick();
		await Promise.resolve();

		const discardCalls = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.discardDraft,
		);
		expect(discardCalls).toHaveLength(2);
		expect(discardCalls[1][1]).toEqual(
			expect.objectContaining({
				draftRevisionId: "revision-restarted-1",
			}),
		);
		const saveCalls = mocks.mutation.mock.calls.filter(
			([ref]) => ref === mocks.refs.saveDraft,
		);
		expect(saveCalls).toHaveLength(3);
		expect(saveCalls[2][1]).toEqual(
			expect.objectContaining({
				productId: "product-1",
				expectedDraftRevisionId: "revision-restarted-2",
				draft: expect.objectContaining({ title: "Edit after two restarts" }),
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
