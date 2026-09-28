import { expect, it } from "vitest";
import {
	ContentExportLimitError,
	createContentExportPackage,
	exportFingerprint,
	exportSha256,
	prepareContentExport,
	readContentExportInventory,
} from "../src/lib/server/contentExportCore";
it("retains Post references and V2 print-set/digital relationships in one portable package", async () => {
	const snapshot = await readContentExportInventory("tenant.example", async (family) => ({
		siteUrl: "tenant.example",
		tenantId: "tenant",
		continueCursor: "",
		isDone: true,
		page:
			family === "content"
				? [
						{
							id: "category",
							kind: "category",
							revisions: [
								{ id: "category-rev", states: ["published"], payload: { title: "Field work" } },
							],
						},
						{
							id: "post",
							kind: "post",
							revisions: [
								{
									id: "post-draft",
									states: ["draft"],
									payload: { credits: "Photograph by the artist" },
									blocks: [{ order: 0, block: { type: "image", placementKey: "hero" } }],
									media: [
										{
											placementKey: "hero",
											assetId: "web",
											altText: "A tree",
											caption: "In the field",
										},
									],
									references: [{ field: "category", toDocumentId: "category" }],
									technical: [{ field: "equipment", label: "Camera", details: "35 mm" }],
								},
							],
						},
					]
				: family === "products"
					? [
							{
								id: "product",
								graphVersion: 2,
								revisions: [
									{
										id: "product-rev",
										states: ["published", "draft"],
										productKind: "print_set",
										currency: "usd",
										variants: [{ variantKey: "small", retailPriceCents: 5000 }],
										media: [{ placementKey: "cover", assetId: "web" }],
										printSources: [{ relationKey: "original", assetId: "print" }],
										digitalFiles: [{ relationKey: "download", assetId: "digital", version: "v1" }],
										setMembers: [
											{
												memberKey: "member",
												mediaPlacementKey: "cover",
												printSourceKey: "original",
											},
										],
									},
								],
							},
						]
					: family === "web"
						? [
								{
									id: "web",
									kind: "web",
									assetKey: "123e4567-e89b-42d3-a456-426614174000",
									status: "ready",
									mimeType: "image/webp",
									originalFilename: "photo.jpg",
									sizeBytes: 4,
								},
							]
						: family === "print"
							? [
									{
										id: "print",
										kind: "print_source",
										assetKey: "art",
										status: "ready",
										mimeType: "image/jpeg",
										originalFilename: "photo.jpg",
										sizeBytes: 4,
										sha256: "a".repeat(64),
									},
								]
							: family === "digital"
								? [
										{
											id: "digital",
											kind: "paid_digital_file",
											assetKey: "download",
											status: "ready",
											mimeType: "application/zip",
											originalFilename: "photo.zip",
											sizeBytes: 4,
											sha256: "b".repeat(64),
										},
									]
								: [],
	}));
	const plan = prepareContentExport(snapshot);
	const completed = Object.fromEntries(
		plan.files.map((file) => [
			file.path,
			{ sizeBytes: file.sizeBytes, sha256: file.sha256 ?? "c".repeat(64) },
		]),
	);
	const result = await createContentExportPackage(
		snapshot,
		plan,
		completed,
		"2026-09-28T00:00:00.000Z",
	);
	expect(result.manifest.fingerprint).toBe(await exportFingerprint(snapshot));
	expect(result.metadata["content/products.json"]).toContain("media/print/art/original.jpg");
	expect(result.metadata["content/products.json"]).toContain("media/digital/download/original.zip");
	expect(result.metadata["content/products.json"]).toContain('"retailPriceCents": 5000');
	expect(result.metadata["content/content.json"]).toContain("Photograph by the artist");
	for (const [path, text] of Object.entries(result.metadata))
		expect(result.entries.find((entry) => entry.path === path)?.sha256).toBe(
			await exportSha256(new TextEncoder().encode(text)),
		);
});
it("flags too-large inventory separately from corrupt source data", async () => {
	await expect(
		readContentExportInventory(
			"tenant.example",
			async () => ({
				siteUrl: "tenant.example",
				tenantId: null,
				page: [{ id: "one" }, { id: "two" }],
				isDone: true,
				continueCursor: "",
			}),
			{ records: 1, metadataBytes: 1000 },
		),
	).rejects.toBeInstanceOf(ContentExportLimitError);
});
