import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";
import { handleServerError } from "../handleError";
import { requireAdmin } from "../requireAdmin";
import { validateFilename } from "../validation";

/** Validate gallery worker config, throw 500 if missing. */
function requireWorkerConfig() {
	const config = getServerConfig();
	if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
		throw error(500, "Gallery worker not configured");
	}
	return config;
}

/** Standard headers for gallery worker requests. */
function workerHeaders(secret: string, contentType = "application/json") {
	return {
		"Content-Type": contentType,
		Authorization: `Bearer ${secret}`,
	};
}

export function createGalleryPresignHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		let data;
		try {
			data = await request.json();
		} catch {
			throw error(400, "Invalid JSON body");
		}

		if (!data.siteUrl || !data.galleryId || !data.filename || !data.contentType) {
			throw error(400, "siteUrl, galleryId, filename, and contentType are required");
		}

		try {
			data.filename = validateFilename(data.filename);
		} catch (err) {
			throw error(400, (err as Error).message);
		}

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/presign`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify(data),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await res.json());
		} catch (err) {
			handleServerError(err, "Failed to generate upload URL");
		}
	};
}

export function createGalleryUploadHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		const url = new URL(request.url);
		const key = url.searchParams.get("key");
		if (!key) throw error(400, "Missing key parameter");

		try {
			const res = await fetch(
				`${config.galleryWorkerUrl}/upload/put?key=${encodeURIComponent(key)}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": request.headers.get("Content-Type") ?? "application/octet-stream",
						Authorization: `Bearer ${config.galleryAdminSecret}`,
					},
					body: request.body,
					// @ts-expect-error — duplex is required for streaming request bodies but missing from TypeScript's RequestInit
					duplex: "half",
				},
			);

			if (!res.ok) throw error(res.status, await res.text());
			return json(await res.json());
		} catch (err) {
			handleServerError(err, "Failed to upload file");
		}
	};
}

export function createGalleryProcessHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		const data = await request.json();

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/process`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify(data),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await res.json());
		} catch (err) {
			handleServerError(err, "Failed to process image");
		}
	};
}

export function createGalleryDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);
		const config = requireWorkerConfig();

		const { r2Key } = await request.json();
		if (!r2Key) throw error(400, "r2Key is required");

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/delete`, {
				method: "POST",
				headers: workerHeaders(config.galleryAdminSecret!),
				body: JSON.stringify({ r2Key }),
			});

			if (!res.ok) throw error(res.status, await res.text());
			return json(await res.json());
		} catch (err) {
			handleServerError(err, "Failed to delete image");
		}
	};
}
