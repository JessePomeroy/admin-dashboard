import { useQuery } from "convex-svelte";
import type { FunctionReference } from "convex/server";
import { mergePortfolioMediaAssets, type PortfolioMediaAsset, type PortfolioMediaPage } from "./portfolioEditor";

type EditorMediaPage = PortfolioMediaPage & {
	pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};

/** Owns web-media reads and temporary uploads for one editor instance. */
export function createEditorMedia(options: {
	siteUrl: string;
	list: FunctionReference<"query"> | undefined;
	placed: FunctionReference<"query"> | undefined;
	references: () => string[];
	pickerIncludesAttachments?: boolean;
}) {
	// Retain cursor history, not old asset pages or additional subscriptions.
	let cursors = $state<(string | null)[]>([null]);
	let requestId = $state(0);
	let switchingPage = $state(false);
	const cursor = $derived(cursors[cursors.length - 1]);
	const libraryQuery = options.list ? useQuery(options.list, () => ({
		siteUrl: options.siteUrl,
		paginationOpts: { numItems: 100, maximumRowsRead: 100, cursor, id: requestId },
	}), { keepPreviousData: false }) : null;
	const placedQuery = options.placed ? useQuery(options.placed, () => ({
		siteUrl: options.siteUrl,
		ids: [...new Set(options.references())],
	})) : null;
	let uploads = $state<PortfolioMediaAsset[]>([]);
	const result = $derived(libraryQuery?.data as EditorMediaPage | undefined);
	const splitError = new Error("This media page changed. Retry to reload it.");
	const pageError = $derived(result?.pageStatus === "SplitRequired" ? splitError : libraryQuery?.error);
	// An incomplete page's continuation can skip unread assets. Retry the same
	// start cursor as a fresh query instead of adopting its rows or continuation.
	const page = $derived(pageError ? undefined : result);
	const loading = $derived(switchingPage || Boolean(libraryQuery?.isLoading));
	const hasNext = $derived(Boolean(page && !page.isDone && page.continueCursor && page.continueCursor !== cursor));
	$effect(() => {
		if (result || libraryQuery?.error) switchingPage = false;
	});
	const placed = $derived((placedQuery?.data ?? []) as PortfolioMediaAsset[]);
	const byId = $derived(mergePortfolioMediaAssets([...(page?.page ?? []), ...uploads], placed));
	const ready = $derived((options.pickerIncludesAttachments
		? [...new Map([...uploads, ...(page?.page ?? []), ...placed].map(asset => [asset._id, asset])).values()]
		: page?.page ?? []).filter(asset => asset.status === "ready"));
	return {
		get byId() { return byId; },
		get ready() { return ready; },
		get error() { return pageError ?? placedQuery?.error; },
		pagination: libraryQuery ? {
			get pageNumber() { return cursors.length; },
			get hasPrevious() { return cursors.length > 1; },
			get hasNext() { return hasNext; },
			get loading() { return loading; },
			get error() { return pageError; },
			next() {
				if (loading || !hasNext || !page) return;
				switchingPage = true;
				cursors = [...cursors, page.continueCursor];
			},
			previous() {
				if (loading || cursors.length === 1) return;
				switchingPage = true;
				cursors = cursors.slice(0, -1);
			},
			retry() {
				if (loading) return;
				switchingPage = true;
				requestId += 1;
			},
		} : undefined,
		addUpload(asset: PortfolioMediaAsset) { uploads = [asset, ...uploads.filter(item => item._id !== asset._id)]; },
		resetUploads() { uploads = []; },
	};
}

export type EditorMediaPagination = NonNullable<ReturnType<typeof createEditorMedia>["pagination"]>;
