import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config.js";
import { CMS_MEDIA_UPLOAD_CONTENT_TYPES, CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES } from "../../cmsMediaUpload.js";
import { getAuthenticatedConvex } from "../convexClient.js";
import { handleServerError } from "../handleError.js";
import { requireAdmin } from "../requireAdmin.js";

const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DERIVATIVE_NAMES = ["thumb", "card", "display-1280", "display-2048", "display-2560"] as const;

function requireCmsMediaConfig() {
	const config = getServerConfig();
	if (!config.cmsMediaWorkerUrl || !config.cmsMediaTenantSecret) {
		throw error(500, "CMS media worker not configured");
	}
	if (
		!config.api.mediaAssets?.registerReadyWebAsset
		&& !config.api.portfolioEditor?.registerReadyWebAsset
	) {
		throw error(500, "CMS media registry not configured");
	}
	return config;
}

function cmsMediaRegistry(config: ReturnType<typeof getServerConfig>) {
	return config.api.mediaAssets?.registerReadyWebAsset
		?? config.api.portfolioEditor!.registerReadyWebAsset;
}

function workerHeaders(secret: string) {
	return {
		Authorization: `Bearer ${secret}`,
		"Content-Type": "application/json",
	};
}

async function workerJson(response: Response) {
	if (!response.ok) throw error(response.status, (await response.text()).trim() || "CMS media request failed");
	try {
		return await response.json() as Record<string, unknown>;
	} catch {
		throw error(502, "CMS media worker returned an invalid response");
	}
}

async function acceptFinalizedSourceOrProcessedRetry(response: Response) {
	if (response.status === 404) {
		const message = (await response.text()).trim();
		if (message === "Uploaded object not found") return;
		throw error(response.status, message || "CMS media request failed");
	}
	await workerJson(response);
}

function validFilename(value: unknown): value is string {
	return typeof value === "string"
		&& value.length > 0
		&& value.length <= 255
		&& value === value.trim()
		&& !/[\u0000-\u001f\u007f/\\]/.test(value);
}

function validSize(value: unknown): value is number {
	return typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value > 0
		&& value <= CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES;
}

function parsePrivateKey(value: unknown, siteUrl: string) {
	if (typeof value !== "string") return null;
	const [root, keySite, intent, assetId, filename, ...extra] = value.split("/");
	if (
		extra.length > 0
		|| root !== "sites"
		|| keySite !== siteUrl
		|| intent !== "web"
		|| !ASSET_ID_PATTERN.test(assetId ?? "")
		|| !["source.jpg", "source.png", "source.webp"].includes(filename ?? "")
	) return null;
	return { key: value, assetId, filename };
}

function numberField(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw error(502, `CMS media worker returned an invalid ${field}`);
	}
	return value;
}

function stringField(value: unknown, field: string): string {
	if (typeof value !== "string" || !value) {
		throw error(502, `CMS media worker returned an invalid ${field}`);
	}
	return value;
}

function filenameField(value: unknown): string {
	if (!validFilename(value)) {
		throw error(502, "CMS media worker returned an invalid original filename");
	}
	return value;
}

function readyAssetFromWorker(
	result: Record<string, unknown>,
	siteUrl: string,
	expectedAssetId: string,
) {
	const assetId = stringField(result.assetId, "asset ID");
	if (assetId !== expectedAssetId) throw error(502, "CMS media worker returned an invalid asset ID");
	const prefix = `sites/${siteUrl}/web/${assetId}/`;
	const source = result.source as Record<string, unknown> | undefined;
	const master = result.master as Record<string, unknown> | undefined;
	const derivatives = Array.isArray(result.derivatives) ? result.derivatives : [];
	if (!source || !master || derivatives.length !== DERIVATIVE_NAMES.length) {
		throw error(502, "CMS media worker returned an incomplete asset");
	}
	if (result.privateMasterKey !== `${prefix}master.webp` || master.contentType !== "image/webp") {
		throw error(502, "CMS media worker returned an invalid master");
	}
	const contentType = source.contentType;
	if (!CMS_MEDIA_UPLOAD_CONTENT_TYPES.includes(contentType as never)) {
		throw error(502, "CMS media worker returned an invalid source type");
	}
	const byPreset = new Map(derivatives.map((item) => {
		const derivative = item as Record<string, unknown>;
		return [derivative.preset, derivative];
	}));
	const derivative = (preset: typeof DERIVATIVE_NAMES[number], filename: string) => {
		const value = byPreset.get(preset);
		if (!value || value.contentType !== "image/webp" || value.key !== `${prefix}${filename}`) {
			throw error(502, `CMS media worker returned an invalid ${preset} derivative`);
		}
		return {
			key: value.key,
			contentType: "image/webp" as const,
			width: numberField(value.width, `${preset} width`),
			height: numberField(value.height, `${preset} height`),
		};
	};
	return {
		assetId,
		originalFilename: filenameField(source.originalFilename),
		source: {
			contentType,
			sizeBytes: numberField(source.sizeBytes, "source size"),
			width: numberField(source.width, "source width"),
			height: numberField(source.height, "source height"),
		},
		master: {
			key: stringField(result.privateMasterKey, "master key"),
			contentType: "image/webp" as const,
			sizeBytes: numberField(master.sizeBytes, "master size"),
			width: numberField(master.width, "master width"),
			height: numberField(master.height, "master height"),
		},
		derivatives: {
			thumb: derivative("thumb", "thumb.webp"),
			card: derivative("card", "card.webp"),
			display1280: derivative("display-1280", "display-1280.webp"),
			display2048: derivative("display-2048", "display-2048.webp"),
			display2560: derivative("display-2560", "display-2560.webp"),
		},
	};
}

export function createCmsMediaCapabilityHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireCmsMediaConfig();
		await requireAdmin(request);
		const input = await request.json() as Record<string, unknown>;
		if (
			!validFilename(input.filename)
			|| !CMS_MEDIA_UPLOAD_CONTENT_TYPES.includes(input.contentType as never)
			|| !validSize(input.sizeBytes)
		) throw error(400, "Invalid CMS media upload request");
		try {
			const workerBase = config.cmsMediaWorkerUrl!.replace(/\/+$/, "");
			const result = await workerJson(await fetch(`${workerBase}/v1/uploads/capabilities`, {
				method: "POST",
				headers: workerHeaders(config.cmsMediaTenantSecret!),
				body: JSON.stringify({
					siteUrl: config.siteUrl,
					intent: "web",
					filename: input.filename,
					contentType: input.contentType,
					sizeBytes: input.sizeBytes,
				}),
			}));
			const assetId = stringField(result.assetId, "asset ID");
			const privateObjectKey = result.privateObjectKey;
			const uploadPath = stringField(result.uploadUrl, "upload URL");
			const parsedKey = parsePrivateKey(privateObjectKey, config.siteUrl);
			if (!ASSET_ID_PATTERN.test(assetId) || parsedKey?.assetId !== assetId) {
				throw error(502, "CMS media worker returned an invalid capability");
			}
			const uploadUrl = new URL(uploadPath, `${workerBase}/`);
			if (uploadUrl.origin !== new URL(workerBase).origin || uploadUrl.pathname !== "/v1/uploads/source") {
				throw error(502, "CMS media worker returned an invalid upload URL");
			}
			return json({
				assetId,
				privateObjectKey,
				uploadUrl: uploadUrl.toString(),
				uploadToken: stringField(result.uploadToken, "upload token"),
				expiresAt: stringField(result.expiresAt, "expiry"),
			});
		} catch (err) {
			handleServerError(err, "Failed to prepare CMS media upload");
		}
	};
}

export function createCmsMediaProcessHandler() {
	return async ({ request }: { request: Request }) => {
		const config = requireCmsMediaConfig();
		await requireAdmin(request);
		const input = await request.json() as Record<string, unknown>;
		const privateKey = parsePrivateKey(input.privateObjectKey, config.siteUrl);
		if (!privateKey) {
			throw error(400, "Invalid private CMS media key");
		}
		try {
			const workerBase = config.cmsMediaWorkerUrl!.replace(/\/+$/, "");
			const headers = workerHeaders(config.cmsMediaTenantSecret!);
			await acceptFinalizedSourceOrProcessedRetry(await fetch(`${workerBase}/v1/uploads/finalize`, {
				method: "POST",
				headers,
				body: JSON.stringify({ privateObjectKey: input.privateObjectKey }),
			}));
			const ready = readyAssetFromWorker(await workerJson(await fetch(`${workerBase}/v1/uploads/process`, {
				method: "POST",
				headers,
				body: JSON.stringify({ privateObjectKey: input.privateObjectKey }),
			})), config.siteUrl, privateKey.assetId);
			const client = await getAuthenticatedConvex(request);
			const registered = await client.mutation(cmsMediaRegistry(config), {
				siteUrl: config.siteUrl,
				asset: ready,
			}) as { id: string; status: "ready" };
			return json({
				asset: {
					_id: registered.id,
					assetId: ready.assetId,
					originalFilename: ready.originalFilename,
					status: registered.status,
					source: ready.source,
					derivatives: {
						thumb: ready.derivatives.thumb,
						card: ready.derivatives.card,
					},
					createdAt: Date.now(),
				},
			});
		} catch (err) {
			handleServerError(err, "Failed to process CMS media upload");
		}
	};
}
