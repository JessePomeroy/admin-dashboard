const galleries = [
	{ galleryId: "gallery-1", slug: "editorial-portraits", portfolioOrder: 0, isPublished: false, draft: { revisionId: "g1", title: "Editorial portraits", description: null, slug: "editorial-portraits", placementCount: 3, checksum: "a", createdAt: 1 }, published: null, updatedAt: Date.UTC(2026, 7, 24) },
	{ galleryId: "gallery-2", slug: "quiet-landscapes", portfolioOrder: 1, isPublished: false, draft: { revisionId: "g2", title: "Quiet landscapes", description: null, slug: "quiet-landscapes", placementCount: 8, checksum: "b", createdAt: 1 }, published: null, updatedAt: Date.UTC(2026, 7, 20) },
	{ galleryId: "gallery-3", slug: "studio-studies", portfolioOrder: 2, isPublished: false, draft: { revisionId: "g3", title: "Studio studies", description: null, slug: "studio-studies", placementCount: 5, checksum: "c", createdAt: 1 }, published: null, updatedAt: Date.UTC(2026, 7, 18) },
];

const products = [
	["product-print", "sanity.catalog.print", "print", "Avant Alien 2.2", "avant-alien-2-2", 5],
	["product-set", "sanity.catalog.print-set", "print_set", "The Nocturnal Set", "nocturnal-set", 3],
	["product-card", "sanity.catalog.postcard", "postcard", "Lake Notes", "lake-notes", 2],
	["product-shirt", "sanity.catalog.merch", "merchandise", "Field Study Tee", "field-study-tee", 4],
	["product-tapestry", "sanity.catalog.tapestry", "tapestry", "Soft Portal", "soft-portal", 1],
	["product-digital", "sanity.catalog.digital", "digital_download", "Winter Light Files", "winter-light-files", 1],
].map(([productId, productKey, productKind, title, slug, variantCount], index) => ({
	productId, productKey, productKind, slug,
	draft: { revisionId: `revision-${index}`, title, variantCount, createdAt: 1 },
	published: null, createdAt: 1, updatedAt: index + 1, publishedAt: null,
}));

const reflectingPool = () => new URLSearchParams(location.search).get("host") === "rp";

const portfolioRevision = {
	revisionId: "gallery-revision-1",
	title: "Editorial portraits",
	description: "A quiet portrait study shaped by window light and direct collaboration.",
	slug: "editorial-portraits",
	placements: [
		{ key: "portrait-window", assetId: "media-portrait-window", order: 0, altText: "Portrait by a tall studio window.", caption: "Window study I" },
		{ key: "portrait-shadow", assetId: "media-portrait-shadow", order: 1, altText: "Profile portrait against a deep blue wall.", caption: "Shadow study" },
		{ key: "portrait-field", assetId: "media-portrait-field", order: 2, altText: "Portrait outdoors in late afternoon light.", caption: "Field study" },
	],
};

const mediaAssets = [
	["media-portrait-window", "window-study.jpg", "portrait-window.svg", 1200, 1500],
	["media-portrait-shadow", "shadow-study.jpg", "portrait-shadow.svg", 1200, 1500],
	["media-portrait-field", "field-study.jpg", "portrait-field.svg", 1200, 1500],
].map(([assetId, originalFilename, key, width, height], index) => ({
	_id: assetId,
	assetId,
	originalFilename,
	status: "ready",
	source: { contentType: "image/jpeg", sizeBytes: 1_200_000 + index, width, height },
	derivatives: {
		thumb: { key, width: 480, height: 600 },
		card: { key, width: 960, height: 1200 },
	},
	createdAt: Date.UTC(2026, 7, 20 + index),
}));

const productGraphRevision = {
	revisionId: "product-revision-1",
	schemaVersion: 2,
	productKind: "print",
	createdAt: 1,
	draft: {
		schemaVersion: 2,
		productKind: "print",
		title: "Avant Alien 2.2",
		slug: "avant-alien-2-2",
		description: "A limited archival print drawn from the nocturnal landscape series.",
		seoDescription: "Avant Alien archival art print.",
		currency: "usd",
		fulfillmentMode: "production_partner",
		saleAvailability: "available",
		shopPlacement: { featured: true, orderRank: "a0" },
		printOptions: { borderOptionsEnabled: true, frameOptionsEnabled: false, framePriceMultiplierBasisPoints: 10000 },
		variants: [{ key: "variant-1", order: 0, materialOptionKey: "fine-art-paper", sizeOptionKey: "8x10", retailPriceCents: 2500, status: "enabled" }],
		webMedia: [],
		printSources: [{ key: "print-source", order: 0, assetId: "source-1" }],
	},
	webMediaAssets: [],
	printSourceAssets: [{ relationKey: "print-source", asset: { assetId: "source-1", status: "ready", originalFilename: "avant-alien.tif" } }],
	paidFileAsset: null,
};

function result(ref: { name?: string }, args: unknown) {
	const state = new URLSearchParams(location.search).get("state");
	if (ref.name === "portfolio:listForEditor") {
		if (state === "loading") return { data: undefined, isLoading: true, error: undefined };
		if (state === "error") return { data: undefined, isLoading: false, error: new Error("private provider detail") };
		return { data: galleries, isLoading: false, error: undefined };
	}
	if (ref.name === "portfolio:getEditorState") {
		return { data: { galleryId: "gallery-1", slug: "editorial-portraits", isPublished: reflectingPool(), draft: portfolioRevision, published: reflectingPool() ? { ...portfolioRevision, revisionId: "gallery-published-1" } : null }, isLoading: false, error: undefined };
	}
	if (ref.name === "catalog:listForEditor") {
		if (state === "loading") return { data: undefined, isLoading: true, error: undefined };
		if (state === "error") return { data: undefined, isLoading: false, error: new Error("private provider detail") };
		const resolved = typeof args === "function" ? (args as () => unknown)() : args;
		if (resolved === "skip") return { data: undefined, isLoading: false, error: undefined };
		const kind = typeof resolved === "object" && resolved !== null && "productKind" in resolved
			? (resolved as { productKind?: string }).productKind
			: undefined;
		const availableProducts = reflectingPool()
			? products.filter((product) => ["print", "print_set", "postcard"].includes(String(product.productKind)))
			: products;
		return { data: kind ? availableProducts.filter((product) => product.productKind === kind) : availableProducts, isLoading: false, error: undefined };
	}
	if (ref.name === "catalog:getEditorState") {
		return { data: { productId: "product-print", productKey: "sanity.catalog.print", productKind: "print", graphVersion: 2, slug: "avant-alien-2-2", draft: productGraphRevision, published: null, updatedAt: 1, publishedAt: null }, isLoading: false, error: undefined };
	}
	if (ref.name === "media:listForEditor") return { data: { page: mediaAssets, isDone: true, continueCursor: null }, isLoading: false, error: undefined };
	if (ref.name === "media:getManyForEditor") return { data: mediaAssets, isLoading: false, error: undefined };
	if (ref.name === "catalog:listDraftPrivateAssetCandidates") return { data: [], isLoading: false, error: undefined };
	return { data: [], isLoading: false, error: undefined };
}

export function useQuery(ref: { name?: string }, args?: unknown) {
	return {
		get data() { return result(ref, args).data; },
		get isLoading() { return result(ref, args).isLoading; },
		get error() { return result(ref, args).error; },
	};
}
