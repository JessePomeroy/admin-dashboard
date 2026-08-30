import { describe, expect, it, vi } from "vitest";
import { getCatalogProductEditorCapability } from "../src/lib/catalogProductCapability";
import type { AdminConfig } from "../src/lib/config";
import {
	addCatalogProductWebMedia,
	alignCatalogProductWebMediaWithSetMembers,
	CATALOG_PRODUCT_WEB_MEDIA_LIMIT,
	addCatalogProductVariant,
	CATALOG_PRODUCT_VARIANT_LIMIT,
	catalogProductGraphDraftFromForm,
	catalogProductGraphDraftFromRevision,
	catalogProductDraftFromRevision,
	catalogProductLabel,
	catalogProductStatus,
	copyCatalogProductDraft,
	emptyCatalogProductDraft,
	moveCatalogProductVariant,
	moveCatalogProductWebMedia,
	moveCatalogProductSetMember,
	newCatalogProductGraphDraft,
	newCatalogProductKey,
	newCatalogProductVariant,
	parseCatalogBasisPoints,
	parseCatalogPriceCents,
	removeCatalogProductVariant,
	removeCatalogProductWebMedia,
	serializeCatalogProductDraft,
	slugifyCatalogOptionKey,
	slugifyCatalogProductTitle,
	type CatalogProductEditorRevision,
	type CatalogProductEditorSummary,
} from "../src/lib/catalogProductEditor";

function revision(
	overrides: Partial<CatalogProductEditorRevision> = {},
): CatalogProductEditorRevision {
	return {
		revisionId: "revision-1",
		schemaVersion: 1,
		productKind: "print",
		currency: "usd",
		title: "Moonrise",
		slug: "moonrise",
		description: null,
		fulfillmentMode: "production_partner",
		saleAvailability: "available",
		borderOptionsEnabled: false,
		frameOptionsEnabled: true,
		framePriceMultiplierBasisPoints: 0,
		variantCount: 1,
		checksum: "checksum",
		source: "admin",
		createdAt: 1,
		variants: [
			{
				key: "variant-opaque",
				order: 0,
				materialOptionKey: null,
				sizeOptionKey: "8x10",
				retailPriceCents: 0,
				status: "enabled",
			},
		],
		...overrides,
	};
}

function summary(
	overrides: Partial<CatalogProductEditorSummary> = {},
): CatalogProductEditorSummary {
	return {
		productId: "product-1",
		productKey: "print-opaque",
		productKind: "print",
		slug: "moonrise",
		draft: {
			revisionId: "revision-1",
			title: "Moonrise",
			saleAvailability: "available",
			variantCount: 1,
			createdAt: 1,
		},
		published: null,
		createdAt: 1,
		updatedAt: 1,
		publishedAt: null,
		...overrides,
	};
}

describe("catalog product editor helpers", () => {
	it("keeps legacy print-source projections source compatible", () => {
		const projected: CatalogProductEditorRevision = {
			revisionId: "legacy-revision",
			schemaVersion: 2,
			productKind: "print",
			createdAt: 1,
			printSourceAssets: [{ relationKey: "source", asset: { assetId: "legacy-asset" } }],
		};
		expect(projected.printSourceAssets?.[0].asset.assetId).toBe("legacy-asset");
	});

	it("keeps proxy-backed private-asset refs disabled without host opt-in", () => {
		const proxyApi = new Proxy({}, {
			get: (_, property) => ({ name: String(property) }),
		});
		const capability = getCatalogProductEditorCapability({
			editor: { products: { enabledKinds: ["digital_download"] } },
			api: { catalogProductGraphs: proxyApi },
		} as unknown as AdminConfig);
		expect(capability?.privateAssets).toBeNull();
	});

	it("requires explicit publication opt-in and explicitly registered refs", () => {
		const proxyApi = new Proxy({}, {
			get: (_, property) => ({ name: String(property) }),
		});
		const capability = (catalogProductGraphs: object, publicationEnabled?: boolean) =>
			getCatalogProductEditorCapability({
				editor: { products: { enabledKinds: ["print"], publicationEnabled } },
				api: { catalogProductGraphs },
			} as unknown as AdminConfig);
		expect(capability(proxyApi, true)?.publication).toBeNull();
		const explicitApi = {
			listForEditor: { name: "list" },
			getEditorState: { name: "get" },
			createDraft: { name: "create" },
			saveDraft: { name: "save" },
			discardDraft: { name: "discard" },
			publishDraft: { name: "publish" },
			unpublish: { name: "unpublish" },
		};
		expect(capability(explicitApi)?.publication).toBeNull();
		expect(capability(explicitApi, true)?.publication).toEqual({
			publishDraft: explicitApi.publishDraft,
			unpublish: explicitApi.unpublish,
		});
		expect(getCatalogProductEditorCapability({
			editor: {
				products: {
					enabledKinds: ["print"],
					publicationEnabled: true,
					publicShopEnabled: true,
				},
			},
			api: { catalogProductGraphs: explicitApi },
		} as unknown as AdminConfig)?.publishesToShop).toBe(true);
		expect(capability({ ...explicitApi, unpublish: undefined }, true)?.publication).toBeNull();
	});

	it("projects both private upload routes only behind replacement refs and rooted queryless endpoints", () => {
		const graphApi = new Proxy({}, {
			get: (_, property) => ({ name: String(property) }),
		});
		const configured = (privateAssetUpload: { prepareEndpoint: string; completeEndpoint: string }) =>
			getCatalogProductEditorCapability({
				editor: {
					products: {
						enabledKinds: ["digital_download"],
						privateAssetReplacementEnabled: true,
						privateAssetUpload,
					},
				},
				api: { catalogProductGraphs: graphApi },
			} as unknown as AdminConfig);
		expect(configured({
			prepareEndpoint: "/api/private/prepare",
			completeEndpoint: "/api/private/complete",
		})?.privateAssets?.upload).toEqual({
			prepareEndpoint: "/api/private/prepare",
			completeEndpoint: "/api/private/complete",
		});
		expect(configured({
			prepareEndpoint: "/api/private/prepare",
			completeEndpoint: "/api/private/complete?retry=1",
		})?.privateAssets?.upload).toBeNull();
	});

	it("converts nullable projections, preserves zero, and strips order", () => {
		const projected = revision();
		const draft = catalogProductDraftFromRevision(projected);
		expect(draft).toEqual({
			productKind: "print",
			title: "Moonrise",
			slug: "moonrise",
			description: undefined,
			fulfillmentMode: "production_partner",
			saleAvailability: "available",
			borderOptionsEnabled: false,
			frameOptionsEnabled: true,
			framePriceMultiplierBasisPoints: 0,
			variants: [
				{
					key: "variant-opaque",
					materialOptionKey: undefined,
					sizeOptionKey: "8x10",
					retailPriceCents: 0,
					status: "enabled",
				},
			],
			setMembers: [],
		});
		expect(draft.variants[0]).not.toHaveProperty("order");
		expect(projected.variants[0]).toHaveProperty("order", 0);
	});

	it("uses an unavailable physical-print draft when no revision exists", () => {
		expect(catalogProductDraftFromRevision(null)).toEqual(
			emptyCatalogProductDraft(),
		);
		expect(emptyCatalogProductDraft()).toEqual({
			productKind: "print",
			fulfillmentMode: "production_partner",
			saleAvailability: "unavailable",
			borderOptionsEnabled: false,
			frameOptionsEnabled: false,
			framePriceMultiplierBasisPoints: 10_000,
			variants: [],
			setMembers: [],
		});
	});

	it("fails closed for non-print fulfillment and inconsistent projections", () => {
		expect(() =>
			catalogProductDraftFromRevision({
				...revision(),
				fulfillmentMode: "digital_delivery",
			} as unknown as CatalogProductEditorRevision),
		).toThrow(/physical fulfillment/i);
		expect(() =>
			catalogProductDraftFromRevision(revision({ variantCount: 2 })),
		).toThrow(/variant count/i);
	});

	it("copies and serializes drafts without retaining variant references", () => {
		const original = catalogProductDraftFromRevision(revision());
		const copy = copyCatalogProductDraft(original);
		copy.variants[0].sizeOptionKey = "11x14";
		expect(original.variants[0].sizeOptionKey).toBe("8x10");
		expect(serializeCatalogProductDraft(original)).toContain(
			'"retailPriceCents":0',
		);
		expect(serializeCatalogProductDraft(original)).not.toContain('"order":');
	});

	it("edits fixed-price graph products without dropping imported relations", () => {
		const graphRevision: CatalogProductEditorRevision = {
			revisionId: "revision-2",
			schemaVersion: 2,
			productKind: "tapestry",
			createdAt: 1,
			draft: {
				schemaVersion: 2,
				productKind: "tapestry",
				title: "Soft Portal",
				slug: "soft-portal",
				description: "Imported tapestry.",
				seoDescription: "Imported search copy.",
				currency: "usd",
				fulfillmentMode: "merchant_fulfilled",
				saleAvailability: "available",
				shopPlacement: { featured: true, orderRank: "b0" },
				variants: [
					{
						key: "default",
						order: 0,
						retailPriceCents: 8000,
						status: "enabled",
					},
				],
				webMedia: [
					{ key: "web-primary", order: 0, role: "gallery", assetId: "media-1" },
				],
			},
		};
		const form = catalogProductGraphDraftFromRevision(graphRevision);
		expect(form.productKind).toBe("tapestry");
		expect(form.variants.map(({ key }) => key)).toEqual(["default"]);
		const draft = catalogProductGraphDraftFromForm(graphRevision, {
			...form,
			title: "Soft Portal revised",
			saleAvailability: "unavailable",
		});
		expect(draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "tapestry",
				title: "Soft Portal revised",
				saleAvailability: "unavailable",
				seoDescription: "Imported search copy.",
				shopPlacement: { featured: true, orderRank: "b0" },
				webMedia: graphRevision.draft?.webMedia,
			}),
		);
		expect(draft).not.toHaveProperty("printOptions");
		expect(draft.variants).toEqual([
			expect.objectContaining({ key: "default", order: 0 }),
		]);
	});

	it("edits print-set graph products without dropping member or asset relations", () => {
		const graphRevision: CatalogProductEditorRevision = {
			revisionId: "revision-set",
			schemaVersion: 2,
			productKind: "print_set",
			createdAt: 1,
			draft: {
				schemaVersion: 2,
				productKind: "print_set",
				title: "Twin Moons",
				slug: "twin-moons",
				description: "Imported set.",
				seoDescription: "Imported set search copy.",
				currency: "usd",
				fulfillmentMode: "merchant_fulfilled",
				saleAvailability: "available",
				shopPlacement: { featured: true, orderRank: "a0" },
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
					{ key: "cover", order: 0, role: "cover", assetId: "media-cover" },
					{ key: "member-a-media", order: 0, role: "set_member", assetId: "media-a" },
					{ key: "member-b-media", order: 1, role: "set_member", assetId: "media-b" },
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
		};
		const form = catalogProductGraphDraftFromRevision(graphRevision);
		expect(form.productKind).toBe("print_set");
		expect(form.fulfillmentMode).toBe("merchant_fulfilled");
		const draft = catalogProductGraphDraftFromForm(graphRevision, {
			...form,
			title: "Twin Moons revised",
			setMembers: [...moveCatalogProductSetMember(form.setMembers, 1, -1)],
		});
		expect(draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "print_set",
				title: "Twin Moons revised",
				seoDescription: "Imported set search copy.",
				shopPlacement: { featured: true, orderRank: "a0" },
				printOptions: expect.objectContaining({ borderOptionsEnabled: true }),
			}),
		);
		expect(draft.webMedia).toEqual([
			expect.objectContaining({ key: "cover", role: "cover", order: 0 }),
			expect.objectContaining({ key: "member-b-media", role: "set_member", order: 0 }),
			expect.objectContaining({ key: "member-a-media", role: "set_member", order: 1 }),
		]);
		expect(draft.printSources).toEqual([
			expect.objectContaining({ key: "member-b-source", order: 0 }),
			expect.objectContaining({ key: "member-a-source", order: 1 }),
		]);
		expect(draft.setMembers).toEqual([
			expect.objectContaining({ key: "member-b", order: 0 }),
			expect.objectContaining({ key: "member-a", order: 1 }),
		]);
		expect(draft.fulfillmentMode).toBe("merchant_fulfilled");
	});

	it("edits digital-download graph products without dropping the paid file or imported relations", () => {
		const graphRevision: CatalogProductEditorRevision = {
			revisionId: "revision-download",
			schemaVersion: 2,
			productKind: "digital_download",
			createdAt: 1,
			draft: {
				schemaVersion: 2,
				productKind: "digital_download",
				title: "Time-aware theme",
				slug: "time-aware-theme",
				description: "Imported digital download.",
				seoDescription: "Imported download search copy.",
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
					{ key: "web-primary", order: 0, role: "gallery", assetId: "media-download" },
				],
				paidFile: {
					key: "download",
					assetId: "paid-file-1",
					version: "1.0.0",
				},
			},
		};
		const form = catalogProductGraphDraftFromRevision(graphRevision);
		expect(form.productKind).toBe("digital_download");
		expect(form.variants[0]?.retailPriceCents).toBe(1200);
		const draft = catalogProductGraphDraftFromForm(graphRevision, {
			...form,
			title: "Time-aware theme revised",
			saleAvailability: "unavailable",
			variants: [{ ...form.variants[0]!, retailPriceCents: 1500 }],
		});
		expect(draft).toEqual(
			expect.objectContaining({
				schemaVersion: 2,
				productKind: "digital_download",
				title: "Time-aware theme revised",
				fulfillmentMode: "digital_delivery",
				saleAvailability: "unavailable",
				seoDescription: "Imported download search copy.",
				shopPlacement: { featured: false, orderRank: "e0" },
				webMedia: graphRevision.draft?.webMedia,
				paidFile: graphRevision.draft?.paidFile,
			}),
		);
		expect(draft.variants).toEqual([
			{
				key: "default",
				order: 0,
				retailPriceCents: 1500,
				status: "enabled",
			},
		]);
		expect(draft).not.toHaveProperty("printOptions");
		expect(draft).not.toHaveProperty("printSources");
		expect(draft).not.toHaveProperty("setMembers");
	});

	it("labels unpublished, published, changed, and discarded products", () => {
		expect(catalogProductLabel(summary())).toBe("Moonrise");
		expect(catalogProductStatus(summary())).toBe("unpublished");
		expect(catalogProductStatus(summary({
			published: summary().draft,
		}))).toBe("published");
		expect(catalogProductStatus(summary({
			published: { ...summary().draft!, revisionId: "published-revision" },
		}))).toBe("changes");
		expect(catalogProductLabel(summary({ draft: null, slug: null }))).toBe(
			"untitled print",
		);
		expect(catalogProductStatus(summary({ draft: null }))).toBe("discarded");
	});

	it("creates valid unavailable graph drafts for every product kind", () => {
		const kinds = ["print", "print_set", "postcard", "merchandise", "tapestry", "digital_download"] as const;
		for (const kind of kinds) {
			const draft = newCatalogProductGraphDraft(kind, {
				title: "New product",
				slug: "new-product",
				...(["postcard", "merchandise", "tapestry", "digital_download"].includes(kind)
					? { retailPriceCents: 2500 }
					: {}),
			});
			expect(draft).toEqual(expect.objectContaining({
				schemaVersion: 2,
				productKind: kind,
				saleAvailability: "unavailable",
				title: "New product",
				slug: "new-product",
			}));
			expect(draft.variants).toHaveLength(1);
			expect(draft.variants?.[0]?.status).toBe("disabled");
		}
		expect(() => newCatalogProductGraphDraft("digital_download", {
			title: "Download",
			slug: "download",
		})).toThrow(/starting retail price/i);
	});

	it("saves newly attached private files and complete print-set members", () => {
		const printSetDraft = newCatalogProductGraphDraft("print_set", {
			title: "New set",
			slug: "new-set",
		});
		const revision: CatalogProductEditorRevision = {
			revisionId: "new-set-revision",
			schemaVersion: 2,
			productKind: "print_set",
			createdAt: 1,
			draft: printSetDraft,
		};
		const form = catalogProductGraphDraftFromRevision(revision);
		form.printSources = [{ key: "source-new", order: 0, assetId: "verified-source" }];
		form.webMedia = [{
			key: "member-media",
			role: "set_member",
			assetId: "ready-media",
			altText: "Moonlit print",
		}];
		form.setMembers = [{
			key: "member-new",
			mediaPlacementKey: "member-media",
			printSourceKey: "source-new",
		}];
		expect(catalogProductGraphDraftFromForm(revision, form)).toEqual(
			expect.objectContaining({
				printSources: [{ key: "source-new", order: 0, assetId: "verified-source" }],
				setMembers: [{
					key: "member-new",
					order: 0,
					mediaPlacementKey: "member-media",
					printSourceKey: "source-new",
				}],
				webMedia: [{
					key: "member-media",
					order: 0,
					role: "set_member",
					assetId: "ready-media",
					altText: "Moonlit print",
				}],
			}),
		);
	});

	it("creates slugs independently from opaque identity", () => {
		expect(slugifyCatalogProductTitle("  Café Moonrise & Water  ")).toBe(
			"cafe-moonrise-water",
		);
		expect(slugifyCatalogProductTitle("---")).toBe("");
		expect(slugifyCatalogProductTitle(`${"a".repeat(95)} b`)).toHaveLength(95);
		expect(slugifyCatalogOptionKey(" Fine Art / Rag  ")).toBe("fine-art-rag");
	});

	it("creates opaque product and variant keys with separate namespaces", () => {
		const randomUUID = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
			.mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
		expect(newCatalogProductKey("print")).toBe(
			"print-11111111-1111-4111-8111-111111111111",
		);
		expect(newCatalogProductVariant()).toEqual({
			key: "variant-22222222-2222-4222-8222-222222222222",
			status: "enabled",
		});
		randomUUID.mockRestore();
	});

	it("adds, removes, and reorders variants immutably", () => {
		const variants = [
			{ key: "variant-a", status: "enabled" as const },
			{ key: "variant-b", status: "disabled" as const },
		];
		const added = addCatalogProductVariant(variants, {
			key: "variant-c",
			status: "enabled",
		});
		expect(added.map(({ key }) => key)).toEqual([
			"variant-a",
			"variant-b",
			"variant-c",
		]);
		expect(() => addCatalogProductVariant(variants, variants[0])).toThrow(
			/unique/i,
		);
		const moved = moveCatalogProductVariant(added, 2, -1);
		expect(moved.map(({ key }) => key)).toEqual([
			"variant-a",
			"variant-c",
			"variant-b",
		]);
		expect(added.map(({ key }) => key)).toEqual([
			"variant-a",
			"variant-b",
			"variant-c",
		]);
		expect(moveCatalogProductVariant(added, 0, -1)).toBe(added);
		expect(
			removeCatalogProductVariant(moved, "variant-c").map(({ key }) => key),
		).toEqual(["variant-a", "variant-b"]);
		expect(removeCatalogProductVariant(moved, "missing")).toBe(moved);
		expect(() =>
			addCatalogProductVariant(
				Array.from({ length: CATALOG_PRODUCT_VARIANT_LIMIT }, (_, index) => ({
					key: `variant-${index}`,
					status: "enabled" as const,
				})),
				{ key: "variant-overflow", status: "enabled" },
			),
		).toThrow(/cannot exceed 100 variants/i);
	});

	it("adds display media in role order while preserving hidden share metadata", () => {
		const share = {
			key: "imported-share",
			role: "social_share" as const,
			assetId: "hidden-share",
			altText: "Imported share image",
		};
		const primary = addCatalogProductWebMedia([share], {
			_id: "media-primary",
			assetId: "11111111-1111-4111-8111-111111111111",
		}, "print");
		expect(primary.map(({ role }) => role)).toEqual(["primary", "social_share"]);
		expect(primary[0]).toMatchObject({
			key: "media-primary-11111111-1111-4111-8111-111111111111",
			assetId: "media-primary",
		});

		const gallery = addCatalogProductWebMedia(primary, {
			_id: "media-gallery",
			assetId: "22222222-2222-4222-8222-222222222222",
		}, "print");
		expect(gallery.map(({ role }) => role)).toEqual([
			"primary",
			"gallery",
			"social_share",
		]);
		expect(gallery.at(-1)).toEqual(share);
		expect(() => addCatalogProductWebMedia(gallery, {
			_id: "media-gallery",
			assetId: "33333333-3333-4333-8333-333333333333",
		}, "print")).toThrow(/already attached/i);

		const shareReuse = addCatalogProductWebMedia([share], {
			_id: "hidden-share",
			assetId: "44444444-4444-4444-8444-444444444444",
		}, "tapestry");
		expect(shareReuse.map(({ role }) => role)).toEqual(["gallery", "social_share"]);
	});

	it("reuses a set-member asset once as the missing print-set cover", () => {
		const memberPlacements = [
			{
				key: "member-a-media",
				role: "set_member" as const,
				assetId: "member-media",
				altText: "First member",
			},
			{
				key: "member-b-media",
				role: "set_member" as const,
				assetId: "member-media",
				altText: "Second member",
			},
		];
		const withCover = addCatalogProductWebMedia(
			memberPlacements,
			{
				_id: "member-media",
				assetId: "55555555-5555-4555-8555-555555555555",
			},
			"print_set",
		);

		expect(withCover.filter(({ role }) => role === "cover")).toEqual([
			expect.objectContaining({
				key: "media-cover-55555555-5555-4555-8555-555555555555",
				assetId: "member-media",
			}),
		]);
		expect(withCover[0]?.key).not.toBe(memberPlacements[0]?.key);
		expect(withCover.slice(1)).toEqual(memberPlacements);
		expect(memberPlacements).toEqual([
			expect.objectContaining({ key: "member-a-media", role: "set_member" }),
			expect.objectContaining({ key: "member-b-media", role: "set_member" }),
		]);
		expect(() => addCatalogProductWebMedia(
			withCover,
			{
				_id: "another-media",
				assetId: "66666666-6666-4666-8666-666666666666",
			},
			"print_set",
		)).toThrow(/already has a cover/i);
	});

	it("rejects set-member asset duplicates outside the missing print-set cover case", () => {
		const memberPlacement = {
			key: "member-media",
			role: "set_member" as const,
			assetId: "member-asset",
		};
		const asset = {
			_id: "member-asset",
			assetId: "77777777-7777-4777-8777-777777777777",
		};

		expect(() => addCatalogProductWebMedia(
			[memberPlacement],
			asset,
			"print",
		)).toThrow(/already attached/i);
		expect(() => addCatalogProductWebMedia(
			[
				memberPlacement,
				{ key: "gallery", role: "gallery", assetId: "member-asset" },
			],
			asset,
			"print_set",
		)).toThrow(/already attached/i);
	});

	it("keeps same-role gallery order, alt text, and detach operations immutable", () => {
		const placements = [
			{ key: "gallery-z", role: "gallery" as const, assetId: "media-z", altText: "Z image" },
			{ key: "gallery-a", role: "gallery" as const, assetId: "media-a", altText: "A image" },
		];
		const moved = moveCatalogProductWebMedia(placements, "gallery-a", -1);
		expect(moved.map(({ key }) => key)).toEqual(["gallery-a", "gallery-z"]);
		expect(moved[0]?.altText).toBe("A image");
		expect(placements.map(({ key }) => key)).toEqual(["gallery-z", "gallery-a"]);

		const removed = removeCatalogProductWebMedia(moved, "gallery-z");
		expect(removed.map(({ key }) => key)).toEqual(["gallery-a"]);
		expect(moved).toHaveLength(2);
		expect(() => removeCatalogProductWebMedia(
			placements,
			"gallery-z",
			[{ key: "member", mediaPlacementKey: "gallery-z", printSourceKey: "source" }],
		)).toThrow(/belongs to a print-set member/i);
	});

	it("aligns print-set media to member order and rejects the placement limit", () => {
		const placements = [
			{ key: "cover", role: "cover" as const, assetId: "cover-media" },
			{ key: "member-z", role: "set_member" as const, assetId: "media-z" },
			{ key: "member-a", role: "set_member" as const, assetId: "media-a" },
		];
		const members = [
			{ key: "second", mediaPlacementKey: "member-a", printSourceKey: "source-a" },
			{ key: "first", mediaPlacementKey: "member-z", printSourceKey: "source-z" },
		];
		expect(
			alignCatalogProductWebMediaWithSetMembers(placements, members).map(({ key }) => key),
		).toEqual(["cover", "member-a", "member-z"]);
		expect(() => addCatalogProductWebMedia(
			Array.from({ length: CATALOG_PRODUCT_WEB_MEDIA_LIMIT }, (_, index) => ({
				key: `gallery-${index}`,
				role: "gallery" as const,
				assetId: `media-${index}`,
			})),
			{ _id: "overflow", assetId: "55555555-5555-4555-8555-555555555555" },
			"tapestry",
		)).toThrow(/cannot exceed 50 web images/i);
	});

	it("accepts only strict bounded integer cents and literal basis points", () => {
		expect(parseCatalogPriceCents(0)).toBe(0);
		expect(parseCatalogPriceCents("0")).toBe(0);
		expect(parseCatalogPriceCents("")).toBeUndefined();
		expect(parseCatalogPriceCents(null)).toBeUndefined();
		expect(() => parseCatalogPriceCents("12.50")).toThrow(/whole number/i);
		expect(() => parseCatalogPriceCents("01")).toThrow(/whole number/i);
		expect(() => parseCatalogPriceCents(-1)).toThrow(/between 0/i);
		expect(() => parseCatalogPriceCents(100_000_001)).toThrow(/between 0/i);
		expect(parseCatalogBasisPoints(0)).toBe(0);
		expect(parseCatalogBasisPoints("10000")).toBe(10_000);
		expect(() => parseCatalogBasisPoints("")).toThrow(/required/i);
		expect(() => parseCatalogBasisPoints(1.5)).toThrow(/whole number/i);
	});
});
