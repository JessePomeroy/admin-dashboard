/** Portable content contract shared by the operator CLI and authenticated dashboard adapter. */
export type ExportJson =
	| null
	| boolean
	| number
	| string
	| ExportJson[]
	| { [key: string]: ExportJson };
type JsonObject = { [key: string]: ExportJson };
type ExportRow = JsonObject & { id: string };
export const EXPORT_FAMILIES = [
	"content",
	"portfolio",
	"products",
	"web",
	"print",
	"digital",
	"uploads",
] as const;
export type ExportFamily = (typeof EXPORT_FAMILIES)[number];
export interface ExportSnapshot {
	schemaVersion: 1;
	siteUrl: string;
	tenantId: string | null;
	records: Record<ExportFamily, ExportRow[]>;
}
export interface ExportMediaFile {
	id: string;
	kind: "web" | "print_source" | "paid_digital_file";
	assetKey: string;
	originalFilename: string;
	mimeType: string;
	sizeBytes: number;
	sha256?: string;
	path: string;
}
export interface ExportFileDigest {
	sizeBytes: number;
	sha256: string;
}
export interface ExportPlan {
	content: Record<string, ExportJson[]>;
	files: ExportMediaFile[];
	exceptions: JsonObject[];
	totalBytes: number;
}
export interface ExportEntry extends ExportFileDigest {
	path: string;
	id?: string;
	kind?: string;
	mimeType?: string;
	originalFilename?: string;
}
export class ContentExportError extends Error {}
export class ContentExportLimitError extends ContentExportError {}
function exportLimit(condition: unknown, message: string): asserts condition {
	if (!condition) throw new ContentExportLimitError(message);
}
export function exportInvariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new ContentExportError(message);
}
export const exportJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const encoder = new TextEncoder();
export const exportByteLength = (value: string) => encoder.encode(value).byteLength;
function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function jsonValue(value: unknown): value is ExportJson {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(jsonValue);
	return (
		object(value) &&
		Object.entries(value).every(
			([key, child]) =>
				!["__proto__", "constructor", "prototype"].includes(key) && jsonValue(child),
		)
	);
}
function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (object(value))
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, stable(value[key])]),
		);
	return value;
}
export async function exportSha256(bytes: Uint8Array): Promise<string> {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
export const exportFingerprint = (value: unknown) =>
	exportSha256(encoder.encode(JSON.stringify(stable(value))));
export const exportCounts = (snapshot: ExportSnapshot) =>
	Object.fromEntries(EXPORT_FAMILIES.map((family) => [family, snapshot.records[family].length]));

export async function readContentExportInventory(
	siteUrl: string,
	queryPage: (family: ExportFamily, cursor: string | null) => Promise<unknown>,
	limits = { records: 20000, metadataBytes: 64 * 1024 * 1024 },
): Promise<ExportSnapshot> {
	exportInvariant(/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(siteUrl), "Invalid canonical site hostname");
	const records: ExportSnapshot["records"] = {
		content: [],
		portfolio: [],
		products: [],
		web: [],
		print: [],
		digital: [],
		uploads: [],
	};
	let tenantId: string | null | undefined;
	let bytes = 0;
	let count = 0;
	for (const family of EXPORT_FAMILIES) {
		let cursor: string | null = null;
		const cursors = new Set<string>();
		const ids = new Set<string>();
		do {
			const result = await queryPage(family, cursor);
			exportInvariant(
				object(result) &&
					result.siteUrl === siteUrl &&
					Array.isArray(result.page) &&
					typeof result.isDone === "boolean" &&
					typeof result.continueCursor === "string" &&
					(result.tenantId === null || typeof result.tenantId === "string"),
				"Invalid export page or canonical tenant mismatch",
			);
			if (tenantId === undefined) tenantId = result.tenantId;
			exportInvariant(result.tenantId === tenantId, "Export tenant identity changed");
			for (const row of result.page) {
				exportInvariant(
					object(row) &&
						typeof row.id === "string" &&
						row.id.length > 0 &&
						!ids.has(row.id) &&
						jsonValue(row),
					"Duplicate or invalid export identity",
				);
				ids.add(row.id);
				bytes += exportByteLength(JSON.stringify(row));
				count++;
				exportLimit(
					count <= limits.records && bytes <= limits.metadataBytes,
					"Export metadata exceeds the supported limit; use the operator export",
				);
				records[family].push({ ...row, id: row.id });
			}
			if (result.isDone) break;
			cursor = result.continueCursor;
			exportInvariant(cursor && !cursors.has(cursor), "Export pagination did not advance");
			cursors.add(cursor);
			exportLimit(cursors.size <= limits.records, "Export pagination exceeds the supported limit");
		} while (cursor !== null);
		records[family].sort((a, b) => a.id.localeCompare(b.id));
	}
	return { schemaVersion: 1, siteUrl, tenantId: tenantId ?? null, records };
}
export function prepareContentExport(snapshot: ExportSnapshot): ExportPlan {
	const assets = new Map<string, string | null>();
	const paths = new Set<string>();
	const exceptions: JsonObject[] = [];
	const files: ExportMediaFile[] = [];
	let totalBytes = 0;
	for (const family of ["web", "print", "digital"] as const)
		for (const asset of snapshot.records[family]) {
			exportInvariant(!assets.has(asset.id), "Duplicate media identity");
			const kind = { web: "web", print: "print_source", digital: "paid_digital_file" }[
				family
			] as ExportMediaFile["kind"];
			exportInvariant(
				asset.kind === kind && typeof asset.status === "string",
				"Export media kind mismatch",
			);
			if (asset.status !== "ready") {
				assets.set(asset.id, null);
				exceptions.push({ id: asset.id, reason: asset.status, required: false });
				continue;
			}
			exportInvariant(
				typeof asset.assetKey === "string" &&
					asset.assetKey.length <= 160 &&
					/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/.test(asset.assetKey),
				"Unsafe asset identity",
			);
			exportInvariant(
				typeof asset.mimeType === "string" &&
					(family === "web"
						? asset.mimeType === "image/webp"
						: family === "print"
							? ["image/jpeg", "image/png"].includes(asset.mimeType)
							: asset.mimeType === "application/zip"),
				"Unsupported export media type",
			);
			exportInvariant(
				typeof asset.sizeBytes === "number" &&
					Number.isSafeInteger(asset.sizeBytes) &&
					asset.sizeBytes > 0 &&
					typeof asset.originalFilename === "string" &&
					(asset.sha256 === undefined ||
						(typeof asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(asset.sha256))),
				"Invalid asset integrity metadata",
			);
			const extension =
				asset.mimeType === "image/webp"
					? "webp"
					: asset.mimeType === "image/jpeg"
						? "jpg"
						: asset.mimeType === "image/png"
							? "png"
							: "zip";
			const path = `media/${family}/${encodeURIComponent(asset.assetKey)}/${family === "web" ? "master" : "original"}.${extension}`;
			exportInvariant(!paths.has(path.toLowerCase()), "Export media path collision");
			paths.add(path.toLowerCase());
			assets.set(asset.id, path);
			totalBytes += asset.sizeBytes;
			exportLimit(
				totalBytes <= 100 * 1024 * 1024 * 1024,
				"Export exceeds 100 GiB; split scope before exporting",
			);
			files.push({
				id: asset.id,
				kind,
				assetKey: asset.assetKey,
				originalFilename: asset.originalFilename,
				mimeType: asset.mimeType,
				sizeBytes: asset.sizeBytes,
				...(asset.sha256 ? { sha256: asset.sha256 } : {}),
				path,
			});
		}
	const documentIds = new Set(
		snapshot.records.content.filter((row) => !row.purgedAt).map((row) => row.id),
	);
	function normalize(value: ExportJson, location: string): ExportJson {
		if (Array.isArray(value))
			return value.map((child, index) => normalize(child, `${location}/${index}`));
		if (!object(value)) return value;
		const result: JsonObject = {};
		for (const [key, child] of Object.entries(value)) {
			result[key] = normalize(child, `${location}/${key}`);
			if ((key === "assetId" || key === "seoOgImageAssetId") && typeof child === "string") {
				const path = assets.get(child);
				exportInvariant(path, "An exported content reference has no retained ready media file");
				result[key === "assetId" ? "mediaPath" : "seoOgImagePath"] = path;
			}
			if (key === "toDocumentId")
				exportInvariant(
					typeof child === "string" && documentIds.has(child),
					"An exported content reference has no retained document",
				);
			if (typeof child === "string" && /^https?:\/\//.test(child))
				exceptions.push({
					location: `${location}/${key}`,
					reason: "external_link_not_downloaded",
					required: false,
				});
		}
		return result;
	}
	const content: ExportPlan["content"] = {};
	for (const family of ["content", "portfolio", "products"] as const)
		content[family] = snapshot.records[family].map((row, index) =>
			normalize(row, `${family}/${index}`),
		);
	for (const row of snapshot.records.uploads)
		if (row.lifecycle !== "verified")
			exceptions.push({
				id: row.id,
				reason: `upload_${row.lifecycle ?? "unresolved"}`,
				required: false,
			});
	return { content, files, exceptions, totalBytes };
}

export async function createContentExportPackage(
	snapshot: ExportSnapshot,
	plan: ExportPlan,
	completed: Record<string, ExportFileDigest>,
	createdAt: string,
) {
	const fingerprint = await exportFingerprint(snapshot);
	const metadata: Record<string, string> = {};
	for (const [family, rows] of Object.entries(plan.content))
		if (rows.length) metadata[`content/${family}.json`] = exportJson(rows);
	metadata["reports/exceptions.json"] = exportJson(plan.exceptions);
	const csv = (value: unknown) =>
		`"${String(value)
			.replace(/^[\t\r\n ]*[=+@-]/, "'$&")
			.replaceAll('"', '""')}"`;
	const entries: ExportEntry[] = plan.files.map((asset) => {
		const recorded = completed[asset.path];
		exportInvariant(
			recorded &&
				recorded.sizeBytes === asset.sizeBytes &&
				/^[a-f0-9]{64}$/.test(recorded.sha256) &&
				(!asset.sha256 || asset.sha256 === recorded.sha256),
			"Export media integrity is incomplete",
		);
		return {
			path: asset.path,
			id: asset.id,
			kind: asset.kind,
			mimeType: asset.mimeType,
			originalFilename: asset.originalFilename,
			sizeBytes: recorded.sizeBytes,
			sha256: recorded.sha256,
		};
	});
	metadata["reports/media-inventory.csv"] =
		`${["id,kind,path,originalFilename,sizeBytes,sha256", ...plan.files.map((asset) => [asset.id, asset.kind, asset.path, asset.originalFilename, asset.sizeBytes, completed[asset.path].sha256].map(csv).join(","))].join("\n")}\n`;
	metadata["README.md"] =
		`# ${snapshot.siteUrl} — website content export\n\nPublished revisions and current saved drafts are labeled by states. Archived and hidden content retain their labels. JSON preserves structured relationships; mediaPath values are relative to this package root.\n\nWeb files are normalized WebP masters, not camera originals. Print and digital files are the retained uploaded originals. All ready registered website-library assets are included, including unused assets. External links are retained but not downloaded. See reports/exceptions.json for exclusions and unfinished uploads. Unknown/unregistered storage objects, past revisions, CRM/customer delivery records, financial documents, credentials, platform code and hosting accounts are excluded.\n\nThis is content, not a runnable replacement website. Text, galleries, product variants, prices (integer cents and currency) and asset IDs remain available to your next developer.\n\nVerify SHA-256 and byte counts against manifest.json. Source fingerprint: ${fingerprint}. Delivery and destination migration are separate operator steps.\n`;
	for (const [path, text] of Object.entries(metadata))
		entries.push({
			path,
			sizeBytes: exportByteLength(text),
			sha256: await exportSha256(encoder.encode(text)),
		});
	const manifest = {
		schemaVersion: 1,
		siteUrl: snapshot.siteUrl,
		tenantId: snapshot.tenantId,
		fingerprint,
		createdAt,
		scope: "website-content-current",
		counts: exportCounts(snapshot),
		files: [...entries],
	};
	metadata["manifest.json"] = exportJson(manifest);
	entries.push({
		path: "manifest.json",
		sizeBytes: exportByteLength(metadata["manifest.json"]),
		sha256: await exportSha256(encoder.encode(metadata["manifest.json"])),
	});
	return { metadata, entries, manifest };
}
