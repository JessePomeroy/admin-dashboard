import { useQuery } from "convex-svelte";
import type { FunctionReference } from "convex/server";
import { mergePortfolioMediaAssets, type PortfolioMediaAsset, type PortfolioMediaPage } from "./portfolioEditor";

/** Owns web-media reads and temporary uploads for one editor instance. */
export function createEditorMedia(options: {
	siteUrl: string;
	list: FunctionReference<"query"> | undefined;
	placed: FunctionReference<"query"> | undefined;
	references: () => string[];
	pickerIncludesAttachments?: boolean;
}) {
	const libraryQuery = options.list ? useQuery(options.list, {
		siteUrl: options.siteUrl,
		paginationOpts: { numItems: 100, cursor: null },
	}) : null;
	const placedQuery = options.placed ? useQuery(options.placed, () => ({
		siteUrl: options.siteUrl,
		ids: [...new Set(options.references())],
	})) : null;
	let uploads = $state<PortfolioMediaAsset[]>([]);
	const page = $derived(libraryQuery?.data as PortfolioMediaPage | undefined);
	const placed = $derived((placedQuery?.data ?? []) as PortfolioMediaAsset[]);
	const byId = $derived(mergePortfolioMediaAssets([...(page?.page ?? []), ...uploads], placed));
	const ready = $derived((options.pickerIncludesAttachments
		? [...new Map([...uploads, ...(page?.page ?? []), ...placed].map(asset => [asset._id, asset])).values()]
		: page?.page ?? []).filter(asset => asset.status === "ready"));
	return {
		get byId() { return byId; },
		get ready() { return ready; },
		get hasMore() { return page ? !page.isDone : false; },
		get error() { return libraryQuery?.error ?? placedQuery?.error; },
		addUpload(asset: PortfolioMediaAsset) { uploads = [asset, ...uploads.filter(item => item._id !== asset._id)]; },
		resetUploads() { uploads = []; },
	};
}
