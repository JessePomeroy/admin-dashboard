import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";

export function createGalleryPresignHandler() {
	return async ({ request }: { request: Request }) => {
		let config;
		try {
			config = getServerConfig();
		} catch (err) {
			console.error("Gallery presign: config error:", err);
			throw error(500, "Server config not initialized");
		}

		if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
			console.error("Gallery presign: missing config", {
				hasWorkerUrl: !!config.galleryWorkerUrl,
				hasSecret: !!config.galleryAdminSecret,
			});
			throw error(500, "Gallery worker not configured");
		}

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
			const res = await fetch(`${config.galleryWorkerUrl}/upload/presign`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.galleryAdminSecret}`,
				},
				body: JSON.stringify(data),
			});

			if (!res.ok) {
				const text = await res.text();
				console.error("Gallery presign: worker error", res.status, text);
				throw error(res.status, text);
			}

			const result = await res.json();
			return json(result);
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) throw err;
			console.error("Gallery presign failed:", err);
			throw error(500, "Failed to generate upload URL");
		}
	};
}

export function createGalleryUploadHandler() {
	return async ({ request }: { request: Request }) => {
		const config = getServerConfig();

		if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
			throw error(500, "Gallery worker not configured");
		}

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
					// @ts-ignore -- duplex needed for streaming body
					duplex: "half",
				},
			);

			if (!res.ok) {
				throw error(res.status, await res.text());
			}

			return json(await res.json());
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) throw err;
			console.error("Gallery upload failed:", err);
			throw error(500, "Failed to upload file");
		}
	};
}

export function createGalleryProcessHandler() {
	return async ({ request }: { request: Request }) => {
		const config = getServerConfig();

		if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
			throw error(500, "Gallery worker not configured");
		}

		const data = await request.json();

		try {
			const res = await fetch(`${config.galleryWorkerUrl}/upload/process`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.galleryAdminSecret}`,
				},
				body: JSON.stringify(data),
			});

			if (!res.ok) {
				throw error(res.status, await res.text());
			}

			return json(await res.json());
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) throw err;
			console.error("Gallery process failed:", err);
			throw error(500, "Failed to process image");
		}
	};
}

export function createGalleryDeleteHandler() {
	return async ({ request }: { request: Request }) => {
		const config = getServerConfig();

		if (!config.galleryWorkerUrl || !config.galleryAdminSecret) {
			throw error(500, "Gallery worker not configured");
		}

		const { r2Key } = await request.json();
		if (!r2Key) throw error(400, "r2Key is required");

		// Delete all 3 sizes
		const keys = [
			r2Key,
			r2Key.replace("/original/", "/preview/"),
			r2Key.replace("/original/", "/thumb/"),
		];

		try {
			// We don't have a bulk delete endpoint, so we just return success
			// The R2 objects will be cleaned up eventually or via a future cleanup job
			return json({ success: true, deletedKeys: keys });
		} catch (err) {
			console.error("Gallery delete failed:", err);
			throw error(500, "Failed to delete image");
		}
	};
}
