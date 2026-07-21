import { describe, expect, it, vi } from "vitest";
import {
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
	moveCatalogProductSetMember,
	newCatalogProductKey,
	newCatalogProductVariant,
	parseCatalogBasisPoints,
	parseCatalogPriceCents,
	removeCatalogProductVariant,
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
					{ key: "member-a-media", order: 1, role: "set_member", assetId: "media-a" },
					{ key: "member-b-media", order: 2, role: "set_member", assetId: "media-b" },
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
				webMedia: graphRevision.draft?.webMedia,
				printSources: graphRevision.draft?.printSources,
				printOptions: expect.objectContaining({ borderOptionsEnabled: true }),
			}),
		);
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

	it("labels active and discarded private products", () => {
		expect(catalogProductLabel(summary())).toBe("Moonrise");
		expect(catalogProductStatus(summary())).toBe("draft");
		expect(catalogProductLabel(summary({ draft: null, slug: null }))).toBe(
			"untitled print",
		);
		expect(catalogProductStatus(summary({ draft: null }))).toBe("discarded");
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
