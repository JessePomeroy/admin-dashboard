import {
	completeCatalogPrivateEditorUpload,
	declareCatalogPrivateEditorUpload,
	newCatalogPrivateEditorUploadHandle,
	prepareCatalogPrivateEditorUpload,
	putCatalogPrivateEditorUpload,
	type CatalogPrivateEditorUploadCompletion,
	type CatalogPrivateEditorUploadPrepareRequest,
	type CatalogPrivateEditorUploadPrintAsset,
} from "./catalogPrivateEditorUpload";
import {
	CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES,
	uploadCmsMediaFile,
	type CmsMediaUploadStatus,
} from "./cmsMediaUpload";
import type { CatalogProductKind } from "./catalogProductEditor";
import type { PortfolioMediaAsset } from "./portfolioEditor";

const DISPLAY_EDGE_MAX = 4_096;
const RETRY_FLOOR_MS = 65_000;
const VERIFICATION_CHECK_LIMIT = 4;

export type CatalogProductArtworkStatus =
	| "preparing"
	| "uploading"
	| "processing"
	| "ready";

export interface CatalogProductArtworkCheckpoint {
	declaration: CatalogPrivateEditorUploadPrepareRequest & {
		productKind: "print" | "print_set";
		widthPixels: number;
		heightPixels: number;
	};
	displayFile: File;
	putIssued: boolean;
	privateAsset?: CatalogPrivateEditorUploadPrintAsset;
	displayAsset?: PortfolioMediaAsset;
}

export interface CatalogProductArtworkResult {
	displayAsset: PortfolioMediaAsset;
	privateAsset: CatalogPrivateEditorUploadPrintAsset;
}

type DisplayDimensions = { widthPixels: number; heightPixels: number };

type PrivateUploadClient = {
	newHandle: () => string;
	declare: typeof declareCatalogPrivateEditorUpload;
	prepare: typeof prepareCatalogPrivateEditorUpload;
	put: typeof putCatalogPrivateEditorUpload;
	complete: (
		endpoint: string,
		uploadHandle: string,
		signal?: AbortSignal,
	) => Promise<CatalogPrivateEditorUploadCompletion>;
};

export function catalogProductDisplayDimensions(dimensions: DisplayDimensions, edgeMax = DISPLAY_EDGE_MAX) {
	if (
		!Number.isSafeInteger(dimensions.widthPixels)
		|| !Number.isSafeInteger(dimensions.heightPixels)
		|| dimensions.widthPixels <= 0
		|| dimensions.heightPixels <= 0
		|| !Number.isSafeInteger(edgeMax)
		|| edgeMax <= 0
	) throw new TypeError("The image dimensions are invalid");
	const scale = Math.min(1, edgeMax / dimensions.widthPixels, edgeMax / dimensions.heightPixels);
	return {
		width: Math.max(1, Math.round(dimensions.widthPixels * scale)),
		height: Math.max(1, Math.round(dimensions.heightPixels * scale)),
	};
}

function abortIfRequested(signal?: AbortSignal) {
	if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

function displayFilename(filename: string) {
	const stem = filename.replace(/\.(?:jpe?g|png)$/i, "").slice(0, 230).trim() || "product";
	return `${stem}-display.webp`;
}

async function canvasBlob(
	bitmap: ImageBitmap,
	width: number,
	height: number,
	quality: number,
) {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new TypeError("This browser cannot prepare the display image");
		context.drawImage(bitmap, 0, 0, width, height);
		return await canvas.convertToBlob({ type: "image/webp", quality });
	}
	if (typeof document === "undefined") {
		throw new TypeError("This browser cannot prepare the display image");
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new TypeError("This browser cannot prepare the display image");
	context.drawImage(bitmap, 0, 0, width, height);
	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => blob ? resolve(blob) : reject(new TypeError("The display image could not be encoded")),
			"image/webp",
			quality,
		);
	});
}

export async function createCatalogProductDisplayFile(
	file: File,
	dimensions: DisplayDimensions,
	options: {
		signal?: AbortSignal;
		render?: (file: File, dimensions: { width: number; height: number }, signal?: AbortSignal) => Promise<File>;
	} = {},
) {
	abortIfRequested(options.signal);
	if (file.size <= CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES) return file;
	const target = catalogProductDisplayDimensions(dimensions);
	if (options.render) {
		const rendered = await options.render(file, target, options.signal);
		abortIfRequested(options.signal);
		if (
			rendered.type !== "image/webp"
			|| rendered.size <= 0
			|| rendered.size > CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES
		) throw new TypeError("The display image could not be prepared within the 20 MB site limit");
		return rendered;
	}
	if (typeof createImageBitmap !== "function") {
		throw new TypeError("This browser cannot prepare a large image for the site");
	}
	const bitmap = await createImageBitmap(file, {
		resizeWidth: target.width,
		resizeHeight: target.height,
		resizeQuality: "high",
	});
	try {
		for (const edge of [DISPLAY_EDGE_MAX, 3_072, 2_560]) {
			const output = catalogProductDisplayDimensions(dimensions, edge);
			for (const quality of [0.9, 0.82, 0.72]) {
				abortIfRequested(options.signal);
				const blob = await canvasBlob(bitmap, output.width, output.height, quality);
				if (
					blob.type === "image/webp"
					&& blob.size > 0
					&& blob.size <= CMS_MEDIA_UPLOAD_MAX_SIZE_BYTES
				) {
					return new File([blob], displayFilename(file.name), {
						type: "image/webp",
						lastModified: file.lastModified,
					});
				}
			}
		}
		throw new TypeError("The display image could not be prepared within the 20 MB site limit");
	} finally {
		bitmap.close();
	}
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
	abortIfRequested(signal);
	return new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(done, Math.max(RETRY_FLOOR_MS, delayMs));
		function done() {
			signal?.removeEventListener("abort", aborted);
			resolve();
		}
		function aborted() {
			clearTimeout(timeout);
			reject(new DOMException("The operation was aborted", "AbortError"));
		}
		signal?.addEventListener("abort", aborted, { once: true });
	});
}

export async function uploadCatalogProductArtwork(
	file: File,
	options: {
		productKind: Extract<CatalogProductKind, "print" | "print_set">;
		privatePrepareEndpoint: string;
		privateCompleteEndpoint: string;
		mediaEndpoint: string;
		signal?: AbortSignal;
		checkpoint?: CatalogProductArtworkCheckpoint;
		onCheckpoint?: (checkpoint: CatalogProductArtworkCheckpoint) => void;
		onCheckpointInvalidated?: (checkpoint: CatalogProductArtworkCheckpoint) => void;
		onStatus?: (status: CatalogProductArtworkStatus) => void;
		wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
		createDisplayFile?: typeof createCatalogProductDisplayFile;
		uploadMedia?: typeof uploadCmsMediaFile;
		privateClient?: PrivateUploadClient;
		verificationCheckLimit?: number;
	},
): Promise<CatalogProductArtworkResult> {
	const createDisplay = options.createDisplayFile ?? createCatalogProductDisplayFile;
	const uploadMedia = options.uploadMedia ?? uploadCmsMediaFile;
	const wait = options.wait ?? waitForRetry;
	const privateClient = options.privateClient ?? {
		newHandle: newCatalogPrivateEditorUploadHandle,
		declare: declareCatalogPrivateEditorUpload,
		prepare: prepareCatalogPrivateEditorUpload,
		put: putCatalogPrivateEditorUpload,
		complete: completeCatalogPrivateEditorUpload,
	};
	let checkpoint = options.checkpoint;
	if (checkpoint && (
		checkpoint.declaration.productKind !== options.productKind
		|| checkpoint.declaration.originalFilename !== file.name
		|| checkpoint.declaration.contentType !== file.type
		|| checkpoint.declaration.sizeBytes !== file.size
	)) throw new TypeError("The artwork upload checkpoint does not match this image");
	let declaration = checkpoint?.declaration;

	if (!checkpoint) {
		options.onStatus?.("preparing");
		const uploadHandle = privateClient.newHandle();
		const declared = await privateClient.declare(
			file,
			options.productKind,
			uploadHandle,
			undefined,
			options.signal,
		);
		if (!("widthPixels" in declared)) throw new TypeError("A print image is required");
		declaration = declared;
		checkpoint = {
			declaration,
			displayFile: await createDisplay(file, declared, { signal: options.signal }),
			putIssued: false,
		};
		options.onCheckpoint?.(checkpoint);
	}

	let privateAsset = checkpoint.privateAsset;
	if (!privateAsset) {
		options.onStatus?.("uploading");
		if (!declaration) throw new TypeError("The artwork upload checkpoint is incomplete");
		if (!checkpoint.putIssued) {
			const prepared = await privateClient.prepare(
				options.privatePrepareEndpoint,
				declaration,
				options.signal,
			);
			checkpoint = { ...checkpoint, putIssued: true };
			options.onCheckpoint?.(checkpoint);
			try {
				await privateClient.put(prepared, file, declaration.contentType, options.signal);
			} catch {
				abortIfRequested(options.signal);
				// Completion owns reconciliation when the immutable PUT response is ambiguous.
			}
		}
		options.onStatus?.("processing");
		const verificationCheckLimit = options.verificationCheckLimit ?? VERIFICATION_CHECK_LIMIT;
		if (!Number.isSafeInteger(verificationCheckLimit) || verificationCheckLimit < 1) {
			throw new TypeError("The verification check limit is invalid");
		}
		let verificationChecks = 0;
		while (true) {
			abortIfRequested(options.signal);
			const completion = await privateClient.complete(
				options.privateCompleteEndpoint,
				declaration.uploadHandle,
				options.signal,
			);
			abortIfRequested(options.signal);
			verificationChecks += 1;
			if (completion.status === "failed") {
				options.onCheckpointInvalidated?.(checkpoint);
				throw new TypeError("The original image could not be verified");
			}
			if (completion.status === "verified") {
				if (completion.asset.kind !== "print_source") {
					options.onCheckpointInvalidated?.(checkpoint);
					throw new TypeError("The verified file was not a print image");
				}
				privateAsset = completion.asset;
				checkpoint = { ...checkpoint, privateAsset };
				options.onCheckpoint?.(checkpoint);
				break;
			}
			if (verificationChecks >= verificationCheckLimit) {
				throw new TypeError("The image is still processing. Try again in a moment.");
			}
			await wait(completion.retryAfterMs, options.signal);
		}
	}

	abortIfRequested(options.signal);
	let displayAsset = checkpoint.displayAsset;
	if (!displayAsset) {
		options.onStatus?.("processing");
		displayAsset = await uploadMedia(checkpoint.displayFile, {
			endpoint: options.mediaEndpoint,
			signal: options.signal,
			onStatus: (status: CmsMediaUploadStatus) => {
				if (status === "processing") options.onStatus?.("processing");
			},
		});
		checkpoint = { ...checkpoint, displayAsset };
		options.onCheckpoint?.(checkpoint);
	}
	options.onStatus?.("ready");
	return { displayAsset, privateAsset };
}
