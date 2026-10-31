import { useQuery } from "convex-svelte";
import { useAdminClient } from "../../adminClient";
import { getAdminConfig } from "../../config";
import type { GalleryUploadPolicy } from "../../galleryUploadPolicy";
import { logger } from "../../logger";
import { toId } from "../../utils";
import { readGalleryImageDimensions } from "./galleryImageDimensions";
import { createGalleryStoragePort } from "./galleryStoragePort";
import {
	createGalleryUploadController,
	type GalleryUploadSnapshot,
} from "./galleryUploadController";

/** Call during component initialization; created queues retain one gallery identity. */
export function useGalleryUploadFactory() {
	const config = getAdminConfig();
	const client = useAdminClient();
	const api = config.api.galleryDelivery!;
	const policyQuery = api.getUploadPolicy
		? useQuery(api.getUploadPolicy, () => ({ siteUrl: config.siteUrl }))
		: undefined;
	const policy: GalleryUploadPolicy = $derived(
		policyQuery?.data === "all-files" ? "all-files" : "media",
	);
	const storage = createGalleryStoragePort({ fetch, galleryWorkerUrl: config.galleryWorkerUrl });
	return {
		get policy() {
			return policy;
		},
		recoverable: Boolean(config.api.deliveryUploads),
		create(
			galleryId: string,
			callbacks: {
				onchange?: (snapshot: GalleryUploadSnapshot) => void;
				onupload?: () => void;
			} = {},
		) {
			return createGalleryUploadController({
				storage,
				siteUrl: config.siteUrl,
				galleryId,
				uploadPolicy: () => policy,
				...(config.api.deliveryUploads
					? {
							checkpoint: {
								begin: (input: {
									r2Key: string;
									filename: string;
									sizeBytes: number;
									width: number;
									height: number;
								}) =>
									client.mutation(config.api.deliveryUploads!.begin, {
										...input,
										siteUrl: config.siteUrl,
										galleryId,
									}),
								markDeleting: (id: string) =>
									client.mutation(config.api.deliveryUploads!.markDeleting, {
										id,
										siteUrl: config.siteUrl,
									}),
								finishDelete: async (id: string) => {
									await client.mutation(config.api.deliveryUploads!.finishDelete, {
										id,
										siteUrl: config.siteUrl,
									});
								},
							},
						}
					: {}),
				getImageDimensions: readGalleryImageDimensions,
				addImage: async (input) => {
					const id = await client.mutation(api.addImage, {
						...input,
						galleryId: toId(input.galleryId),
					});
					if (typeof id !== "string")
						throw new Error("File registration returned an invalid identity");
					return id;
				},
				removeImage: async (id) => {
					await client.mutation(api.removeImage, { id: toId(id), siteUrl: config.siteUrl });
				},
				...callbacks,
				logger,
			});
		},
	};
}
