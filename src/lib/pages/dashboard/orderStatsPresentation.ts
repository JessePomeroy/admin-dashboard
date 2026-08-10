export interface OrderStatsCompleteness {
	totalOrders: number;
	isTruncated?: boolean;
	scanLimit?: number;
	currencyGroupedTotalsAvailable?: boolean;
	unknownCurrencyOrderCount?: number;
	invalidGrossAmountOrderCount?: number;
}

export interface OrderStatsPresentation {
	scopeLabel: string;
	orderCountLabel: string;
	completenessNote: string | null;
}

export function getOrderStatsPresentation(
	stats: OrderStatsCompleteness,
): OrderStatsPresentation {
	const notes: string[] = [];
	if (stats.currencyGroupedTotalsAvailable === false) {
		notes.push("Currency-grouped gross payment metrics are unavailable.");
	}
	if ((stats.unknownCurrencyOrderCount ?? 0) > 0) {
		const count = stats.unknownCurrencyOrderCount!;
		notes.push(
			`${formatCount(count)} ${count === 1 ? "order is" : "orders are"} excluded from monetary totals because payment currency is unavailable.`,
		);
	}
	if ((stats.invalidGrossAmountOrderCount ?? 0) > 0) {
		const count = stats.invalidGrossAmountOrderCount!;
		notes.push(
			`${formatCount(count)} ${count === 1 ? "order is" : "orders are"} excluded from monetary totals because ${count === 1 ? "its" : "their"} gross amount is invalid.`,
		);
	}
	if (stats.isTruncated !== true) {
		return {
			scopeLabel: "all time",
			orderCountLabel: `${formatCount(stats.totalOrders)} orders`,
			completenessNote: notes.length > 0 ? notes.join(" ") : null,
		};
	}

	const scanLimit = positiveInteger(stats.scanLimit) ?? stats.totalOrders;
	notes.unshift(
		`Gross payment metrics are based on the latest ${formatCount(scanLimit)} orders.`,
	);
	return {
		scopeLabel: `latest ${formatCount(scanLimit)} orders`,
		orderCountLabel: `${formatCount(stats.totalOrders)} orders · partial total`,
		completenessNote: notes.join(" "),
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
