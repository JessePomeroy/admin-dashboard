import { useQuery } from "convex-svelte";
import { onDestroy, untrack } from "svelte";
import { useAdminClient } from "../adminClient";
import { getAdminConfig } from "../config";

export type BusinessRecordKind = "orders" | "invoices" | "quotes" | "contracts";
type Filters = { status?: string; search?: string; from?: number; to?: number };
type Page<T> = { page: T[]; isDone: boolean; continueCursor: string; pageStatus?: string };

export function createBusinessRecords<T>(options: {
	kind: BusinessRecordKind;
	filters: () => Filters;
}) {
	const config = getAdminConfig();
	const api = config.api.businessRecords;
	const client = useAdminClient();
	let cursors = $state<(string | null)[]>([null]);
	let refreshId = $state(0);
	let exporting = $state(false);
	let exportCount = $state(0);
	let exportError = $state("");
	let deepLinkError = $state("");
	let lastFilters = "";
	let disposed = false;
	const filterKey = $derived(JSON.stringify(options.filters()));
	$effect(() => {
		const key = filterKey;
		if (key === lastFilters) return;
		lastFilters = key;
		untrack(() => {
			cursors = [null];
		});
	});
	const source = useQuery(
		api?.list ?? config.api[options.kind].list,
		() =>
			api
				? {
						siteUrl: config.siteUrl,
						kind: options.kind,
						...options.filters(),
						paginationOpts: { numItems: 50, cursor: cursors[cursors.length - 1], id: refreshId },
					}
				: { siteUrl: config.siteUrl },
		{ keepPreviousData: false },
	);
	const result = $derived(source.data as Page<T> | T[] | undefined);
	const page = $derived(result && !Array.isArray(result) ? result : null);
	const split = $derived(page?.pageStatus === "SplitRequired");
	onDestroy(() => {
		disposed = true;
	});
	return {
		enabled: Boolean(api),
		get data() {
			return split ? [] : Array.isArray(result) ? result : (page?.page ?? []);
		},
		get isLoading() {
			return source.isLoading;
		},
		get error() {
			return split ? new Error("This page changed. Refresh to reload it.") : source.error;
		},
		get pageNumber() {
			return cursors.length;
		},
		get hasNext() {
			return Boolean(
				page && !page.isDone && page.continueCursor && page.continueCursor !== cursors.at(-1),
			);
		},
		get hasPrevious() {
			return cursors.length > 1;
		},
		get exporting() {
			return exporting;
		},
		get exportCount() {
			return exportCount;
		},
		get exportError() {
			return exportError;
		},
		get deepLinkError() {
			return deepLinkError;
		},
		next() {
			if (page && !page.isDone && !source.isLoading) cursors = [...cursors, page.continueCursor];
		},
		previous() {
			if (cursors.length > 1 && !source.isLoading) cursors = cursors.slice(0, -1);
		},
		refresh() {
			refreshId += 1;
		},
		async open(id: string): Promise<T | null> {
			if (!api) return null;
			deepLinkError = "";
			try {
				const row = (await client.query(api.get, {
					siteUrl: config.siteUrl,
					kind: options.kind,
					id,
				})) as T | null;
				if (!row && !disposed)
					deepLinkError = "This record was not found or is unavailable to your account.";
				return disposed ? null : row;
			} catch {
				if (!disposed) deepLinkError = "Could not open this record. Reload this page to try again.";
				return null;
			}
		},
		async all(): Promise<T[] | null> {
			if (!api || exporting) return null;
			exporting = true;
			exportCount = 0;
			exportError = "";
			const filters = { ...options.filters() };
			const rows: T[] = [];
			const seen = new Set<string>();
			const seenIds = new Set<string>();
			const encoder = new TextEncoder();
			let bytes = 0;
			let cursor: string | null = null;
			try {
				while (!disposed) {
					const page = (await client.query(api.list, {
						siteUrl: config.siteUrl,
						kind: options.kind,
						...filters,
						paginationOpts: { numItems: 50, cursor },
					})) as Page<T>;
					if (disposed) return null;
					if (page.pageStatus === "SplitRequired")
						throw new Error("Records changed during export. Please retry.");
					for (const row of page.page) {
						if (row && typeof row === "object" && "_id" in row && typeof row._id === "string") {
							if (seenIds.has(row._id))
								throw new Error("Records changed during export. Please retry.");
							seenIds.add(row._id);
						}
						bytes += encoder.encode(JSON.stringify(row)).byteLength;
						if (bytes > 50_000_000)
							throw new Error("This export exceeds 50 MB. Narrow the filters and export again.");
						rows.push(row);
					}
					exportCount = rows.length;
					if (rows.length > 50_000)
						throw new Error(
							"This export exceeds 50,000 records. Narrow the filters and export again.",
						);
					if (page.isDone) return rows;
					if (!page.continueCursor || seen.has(page.continueCursor))
						throw new Error("The export could not reach the next page. Please retry.");
					seen.add(page.continueCursor);
					cursor = page.continueCursor;
				}
				return null;
			} catch (error) {
				if (!disposed)
					exportError =
						error instanceof Error ? error.message : "Export failed. No file was created.";
				return null;
			} finally {
				if (!disposed) exporting = false;
			}
		},
	};
}

export function downloadRecordsCsv<T extends object>(rows: T[], name: string) {
	const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	const cell = (value: unknown) => {
		const text =
			value === undefined || value === null
				? ""
				: typeof value === "object"
					? JSON.stringify(value)
					: String(value);
		return `"${(/^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
	};
	const csv = [
		keys.map(cell).join(","),
		...rows.map((row) => {
			const values = new Map(Object.entries(row));
			return keys.map((key) => cell(values.get(key))).join(",");
		}),
	].join("\r\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	if (blob.size > 50_000_000)
		throw new Error("This export is larger than 50 MB. Narrow the filters and try again.");
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
