import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import { logger } from "../../logger";
import { toId } from "../../utils";
import type { GalleryUploadPolicy } from "../../galleryUploadPolicy";
import { createGalleryStoragePort } from "./galleryStoragePort";
import { createGalleryUploadController, type GalleryUploadSnapshot } from "./galleryUploadController";
import { readGalleryImageDimensions } from "./galleryImageDimensions";

/** Call during component initialization; created queues retain one gallery identity. */
export function useGalleryUploadFactory() {
	const config = getAdminConfig();
	const client = useAdminClient();
	const api = config.api.galleryDelivery!;
	const policyQuery = api.getUploadPolicy ? useQuery(api.getUploadPolicy, () => ({ siteUrl: config.siteUrl })) : undefined;
	const policy: GalleryUploadPolicy = $derived(policyQuery?.data === "all-files" ? "all-files" : "media");
	const storage = createGalleryStoragePort({ fetch, galleryWorkerUrl: config.galleryWorkerUrl });
	return {
		get policy() { return policy; },
		create(galleryId: string, callbacks: { onchange?: (snapshot: GalleryUploadSnapshot) => void; onupload?: () => void } = {}) {
			return createGalleryUploadController({
				storage, siteUrl: config.siteUrl, galleryId, uploadPolicy: () => policy,
				getImageDimensions: readGalleryImageDimensions,
				addImage: async (input) => {
					const id = await client.mutation(api.addImage, { ...input, galleryId: toId(input.galleryId) });
					if (typeof id !== "string") throw new Error("File registration returned an invalid identity");
					return id;
				},
				removeImage: async (id) => { await client.mutation(api.removeImage, { id: toId(id), siteUrl: config.siteUrl }); },
				...callbacks, logger,
			});
		},
	};
}
