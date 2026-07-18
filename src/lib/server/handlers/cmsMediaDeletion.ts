import { error, json } from "@sveltejs/kit";
import { ConvexHttpClient } from "convex/browser";
import { getServerConfig } from "../../config.js";
import { handleServerError } from "../handleError.js";
import { requireAdmin } from "../requireAdmin.js";

const ASSET_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_FILENAMES = [
	"thumb.webp",
	"card.webp",
	"display-1280.webp",
	"display-2048.webp",
	"display-2560.webp",
] as const;

function requireCmsMediaDeletionConfig() {
	const config = getServerConfig();
	if (!config.cmsMediaWorkerUrl || !config.cmsMediaTenantSecret) {
		throw error(500, "CMS media worker not configured");
	}
	if (!config.api.portfolioEditor?.requestDeletion) {
		throw error(500, "CMS media deletion registry not configured");
	}
	if (!config.cmsMediaConvexSiteUrl || !config.cmsMediaDeletionCompletionSecret) {
		throw error(500, "CMS media deletion completion not configured");
	}
	if (!config.getConvexToken) {
		throw error(500, "Authenticated Convex access not configured");
	}
	return config;
}

function bearerHeaders(secret: string) {
	return {
		Authorization: `Bearer ${secret}`,
		"Content-Type": "application/json",
	};
}

async function readInput(request: Request) {
	if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim() !== "application/json") {
		throw error(400, "Invalid CMS media deletion request");
	}
	let value: unknown;
	try {
		value = await request.json();
	} catch {
		throw error(400, "Invalid CMS media deletion request");
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw error(400, "Invalid CMS media deletion request");
	}
	const input = value as Record<string, unknown>;
	const keys = Object.keys(input);
	if (
		keys.length !== 1
		|| keys[0] !== "id"
		|| typeof input.id !== "string"
		|| input.id.length < 1
		|| input.id.length > 128
		|| input.id !== input.id.trim()
	) throw error(400, "Invalid CMS media deletion request");
	return { id: input.id };
}

function deletionManifest(siteUrl: string, assetId: string) {
	const prefix = `sites/${siteUrl}/web/${assetId}/`;
	return {
		privateKeys: [`${prefix}master.webp`],
		publicKeys: PUBLIC_FILENAMES.map((filename) => `${prefix}${filename}`),
	};
}

function hasExactKeys(value: unknown, expected: readonly string[]) {
	if (!Array.isArray(value) || value.length !== expected.length) return false;
	if (value.some((key) => typeof key !== "string")) return false;
	const unique = new Set(value as string[]);
	return unique.size === expected.length && expected.every((key) => unique.has(key));
}

function parseDeletionRequestResult(value: unknown, expectedSiteUrl: string) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw error(502, "CMS media registry returned an invalid deletion request");
	}
	const result = value as Record<string, unknown>;
	if (
		(result.status !== "deleting" && result.status !== "deleted")
		|| result.siteUrl !== expectedSiteUrl
		|| typeof result.assetId !== "string"
		|| !ASSET_ID_PATTERN.test(result.assetId)
	) throw error(502, "CMS media registry returned an invalid deletion request");
	const manifest = deletionManifest(expectedSiteUrl, result.assetId);
	if (
		!hasExactKeys(result.privateKeys, manifest.privateKeys)
		|| !hasExactKeys(result.publicKeys, manifest.publicKeys)
	) throw error(502, "CMS media registry returned an invalid deletion manifest");
	return {
		status: result.status,
		assetId: result.assetId,
		...manifest,
	};
}

async function externalJson(response: Response, message: string) {
	if (!response.ok) throw error(response.status, message);
	try {
		const value = await response.json() as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
		return value as Record<string, unknown>;
	} catch {
		throw error(502, `${message}: invalid response`);
	}
}

function endpoint(
	baseUrl: string,
	path: string,
	label: string,
	requiredHostnameSuffix?: string,
) {
	try {
		const base = new URL(baseUrl);
		if (
			base.protocol !== "https:"
			|| base.username !== ""
			|| base.password !== ""
			|| (requiredHostnameSuffix && !base.hostname.endsWith(requiredHostnameSuffix))
		) throw new Error();
		base.pathname = path;
		base.search = "";
		base.hash = "";
		return base.toString();
	} catch {
		throw error(500, `${label} not configured`);
	}
}

/**
 * Delete one unreferenced CMS media asset through the authenticated Convex
 * registry, tenant-scoped storage Worker, and server-authorized completion
 * action. The browser may supply only the Convex media document ID.
 */
export function createCmsMediaDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireCmsMediaDeletionConfig();
		const { id } = await readInput(request);

		try {
			const token = await config.getConvexToken!(request);
			if (!token) throw error(401, "Unauthorized");
			const client = new ConvexHttpClient(config.convexUrl);
			client.setAuth(token);
			const deletion = parseDeletionRequestResult(
				await client.mutation(config.api.portfolioEditor!.requestDeletion, {
					siteUrl: config.siteUrl,
					id,
				}),
				config.siteUrl,
			);

			// A retained Convex tombstone makes an already-completed retry a safe
			// success without repeating either external side effect.
			if (deletion.status === "deleted") return json({ deleted: true, id });

			const workerResult = await externalJson(await fetch(
				endpoint(config.cmsMediaWorkerUrl!, "/v1/assets/delete", "CMS media worker"),
				{
					method: "POST",
					redirect: "error",
					headers: bearerHeaders(config.cmsMediaTenantSecret!),
					body: JSON.stringify({
						siteUrl: config.siteUrl,
						assetId: deletion.assetId,
						privateKeys: deletion.privateKeys,
						publicKeys: deletion.publicKeys,
					}),
				},
			), "CMS media storage deletion failed");
			if (
				workerResult.deleted !== true
				|| workerResult.siteUrl !== config.siteUrl
				|| workerResult.assetId !== deletion.assetId
			) throw error(502, "CMS media storage deletion returned an invalid response");

			const completionResult = await externalJson(await fetch(
				endpoint(
					config.cmsMediaConvexSiteUrl!,
					"/cms-media/complete-deletion",
					"CMS media deletion completion",
					".convex.site",
				),
				{
					method: "POST",
					redirect: "error",
					headers: bearerHeaders(config.cmsMediaDeletionCompletionSecret!),
					body: JSON.stringify({ siteUrl: config.siteUrl, id, assetId: deletion.assetId }),
				},
			), "CMS media deletion could not be completed");
			if (completionResult.deleted !== true || completionResult.id !== id) {
				throw error(502, "CMS media deletion completion returned an invalid response");
			}

			return json({ deleted: true, id });
		} catch (err) {
			handleServerError(err, "Failed to delete CMS media asset");
		}
	};
}
