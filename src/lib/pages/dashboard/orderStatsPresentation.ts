export interface OrderStatsCompleteness {
	totalOrders: number;
	isTruncated?: boolean;
	scanLimit?: number;
}

export interface OrderStatsPresentation {
	scopeLabel: string;
	orderCountLabel: string;
	completenessNote: string | null;
}

export function getOrderStatsPresentation(
	stats: OrderStatsCompleteness,
): OrderStatsPresentation {
	if (stats.isTruncated !== true) {
		return {
			scopeLabel: "all time",
			orderCountLabel: `${formatCount(stats.totalOrders)} orders`,
			completenessNote: null,
		};
	}

	const scanLimit = positiveInteger(stats.scanLimit) ?? stats.totalOrders;
	return {
		scopeLabel: `latest ${formatCount(scanLimit)} orders`,
		orderCountLabel: `${formatCount(stats.totalOrders)} orders · partial total`,
		completenessNote: `Revenue metrics are based on the latest ${formatCount(scanLimit)} orders.`,
	};
}

function positiveInteger(value: number | undefined): number | null {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: null;
}

function formatCount(value: number): string {
	return value.toLocaleString("en-US");
}
