import type { Order, OrderStatus } from "../../types";

export interface AdminOrder {
	_id: string;
	orderNumber: string;
	createdAt: string;
	customerEmail: string;
	customerName: string;
	total: number;
	stripeFees?: number;
	stripeFeeCurrency?: string;
	stripeFeeChargeId?: string;
	stripeFeeBalanceTransactionId?: string;
	stripeFeeCapturedAt?: number;
	stripeFeeProvenanceVersion?: number;
	stripeFeeProvenance?: Order["stripeFeeProvenance"];
	stripeFeeCaptureStatus?: Order["stripeFeeCaptureStatus"];
	stripeFeeCaptureAttempts?: number;
	stripeFeeCaptureLastAttemptAt?: number;
	stripeFeeCaptureNextAttemptAt?: number;
	stripeFeeCaptureError?: Order["stripeFeeCaptureError"];
	status: OrderStatus;
	currency: string | null;
	items: Order["items"];
	shippingAddress: NonNullable<Order["shippingAddress"]> | null;
	notes: string;
}

export type StripeFeeCaptureTone =
	| "unknown"
	| "pending"
	| "captured"
	| "failed"
	| "canceled"
	| "legacy";

export interface StripeFeeCapturePresentation {
	tone: StripeFeeCaptureTone;
	label: string;
	detail: string;
	actualFeeMinorUnits: number | null;
	unverifiedRecordedFeeMinorUnits: number | null;
	feeCurrency: string | null;
	grossLessActualFeeMinorUnits: number | null;
	nextAttemptAt: number | null;
	lastAttemptAt: number | null;
}

const ERROR_DETAILS: Record<
	NonNullable<Order["stripeFeeCaptureError"]>,
	string
> = {
	authority_configuration_invalid:
		"Fee verification authority is not configured safely.",
	balance_transaction_not_ready: "Stripe's balance transaction was not ready.",
	fee_breakdown_not_ready: "Stripe's processing-fee breakdown was not ready.",
	stripe_api_error: "Stripe could not be reached or returned an error.",
	stripe_secret_key_missing: "The Stripe secret key is not configured.",
	payment_intent_missing: "The order has no Stripe payment intent.",
	payment_not_ready: "Stripe's payment is still pending.",
	payment_projection_invalid:
		"Stripe's payment record did not match the signed order projection.",
	provider_object_mismatch:
		"Stripe's charge and balance-transaction records did not form the expected chain.",
};

function knownMinorUnits(value: number | undefined): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function knownCurrency(value: unknown): value is string {
	return typeof value === "string" && /^[a-z]{3}$/.test(value);
}

// Stripe charge API exceptions. ISK and UGX retain two-decimal API amounts for
// backwards compatibility; HUF and TWD charges also accept two-decimal amounts.
// Intl supplies the ISO exponent for other currencies, including three-decimal
// currencies, while this set preserves Stripe's charge-specific representation.
const STRIPE_TWO_DECIMAL_CHARGE_CURRENCIES = new Set([
	"huf", "isk", "twd", "ugx",
]);

const STRIPE_ZERO_DECIMAL_CHARGE_CURRENCIES = new Set([
	"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
	"pyg", "rwf", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function stripeChargeMinorUnitExponent(currency: string): number | null {
	if (STRIPE_TWO_DECIMAL_CHARGE_CURRENCIES.has(currency)) return 2;
	if (STRIPE_ZERO_DECIMAL_CHARGE_CURRENCIES.has(currency)) return 0;
	try {
		const exponent = new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
		}).resolvedOptions().maximumFractionDigits;
		return typeof exponent === "number"
			&& Number.isInteger(exponent)
			&& exponent >= 0
			&& exponent <= 20
			? exponent
			: null;
	} catch {
		return null;
	}
}

export function normalizeStripeCurrency(value: unknown): string | null {
	return knownCurrency(value) ? value : null;
}

export function formatStripeMinorUnits(amount: number, currency: string | null): string {
	if (!knownMinorUnits(amount) || currency === null || !knownCurrency(currency)) {
		return `${String(amount)} minor units (currency unavailable)`;
	}
	const exponent = stripeChargeMinorUnitExponent(currency);
	if (exponent === null) return `${String(amount)} minor units (${currency.toUpperCase()})`;
	try {
		const formatted = new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
		}).format(amount / 10 ** exponent);
		return `${formatted} ${currency.toUpperCase()}`;
	} catch {
		return `${String(amount)} minor units (${currency.toUpperCase()})`;
	}
}

export interface GrossPaymentGroup {
	currency: string;
	totalMinorUnits: number;
	orderCount: number;
}

export function groupGrossPayments(
	orders: readonly Pick<AdminOrder, "currency" | "total">[],
) {
	const grouped = new Map<string, { totalMinorUnits: number; orderCount: number }>();
	const invalidCurrencies = new Set<string>();
	let unknownCurrencyOrderCount = 0;
	let invalidAmountOrderCount = 0;

	for (const order of orders) {
		if (order.currency === null || !knownCurrency(order.currency)) {
			unknownCurrencyOrderCount += 1;
			continue;
		}
		if (!knownMinorUnits(order.total) || invalidCurrencies.has(order.currency)) {
			invalidAmountOrderCount += 1;
			continue;
		}
		const current = grouped.get(order.currency) ?? { totalMinorUnits: 0, orderCount: 0 };
		const totalMinorUnits = current.totalMinorUnits + order.total;
		if (!knownMinorUnits(totalMinorUnits)) {
			invalidAmountOrderCount += current.orderCount + 1;
			grouped.delete(order.currency);
			invalidCurrencies.add(order.currency);
			continue;
		}
		grouped.set(order.currency, {
			totalMinorUnits,
			orderCount: current.orderCount + 1,
		});
	}

	return {
		groups: [...grouped.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map<GrossPaymentGroup>(([currency, values]) => ({ currency, ...values })),
		unknownCurrencyOrderCount,
		invalidAmountOrderCount,
	};
}

function hasProviderProvenanceV1(
	order: Pick<
		AdminOrder,
		| "stripeFeeChargeId"
		| "stripeFeeBalanceTransactionId"
		| "stripeFeeCapturedAt"
		| "stripeFeeProvenanceVersion"
	>,
) {
	return order.stripeFeeProvenanceVersion === 1
		&& typeof order.stripeFeeChargeId === "string"
		&& order.stripeFeeChargeId.startsWith("ch_")
		&& typeof order.stripeFeeBalanceTransactionId === "string"
		&& order.stripeFeeBalanceTransactionId.startsWith("txn_")
		&& typeof order.stripeFeeCapturedAt === "number"
		&& Number.isSafeInteger(order.stripeFeeCapturedAt)
		&& order.stripeFeeCapturedAt >= 0;
}

function attemptLabel(attempts = 0): string {
	return `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`;
}

export function getStripeFeeCapturePresentation(
	order: Pick<
		AdminOrder,
		| "total"
		| "currency"
		| "stripeFees"
		| "stripeFeeCurrency"
		| "stripeFeeChargeId"
		| "stripeFeeBalanceTransactionId"
		| "stripeFeeCapturedAt"
		| "stripeFeeProvenanceVersion"
		| "stripeFeeProvenance"
		| "stripeFeeCaptureStatus"
		| "stripeFeeCaptureAttempts"
		| "stripeFeeCaptureLastAttemptAt"
		| "stripeFeeCaptureNextAttemptAt"
		| "stripeFeeCaptureError"
	>,
): StripeFeeCapturePresentation {
	const recordedFeeMinorUnits = knownMinorUnits(order.stripeFees) ? order.stripeFees : null;
	const feeCurrency = knownCurrency(order.stripeFeeCurrency)
		? order.stripeFeeCurrency
		: null;
	const lastAttemptAt = order.stripeFeeCaptureLastAttemptAt ?? null;
	const nextAttemptAt = order.stripeFeeCaptureNextAttemptAt ?? null;
	const unknownAmounts = {
		actualFeeMinorUnits: null,
		unverifiedRecordedFeeMinorUnits: null,
		feeCurrency: null,
		grossLessActualFeeMinorUnits: null,
	};

	switch (order.stripeFeeCaptureStatus) {
		case "pending": {
			const attempts = order.stripeFeeCaptureAttempts ?? 0;
			const latestIssue = order.stripeFeeCaptureError
				? ` Latest issue: ${ERROR_DETAILS[order.stripeFeeCaptureError]}`
				: "";
			return {
				tone: "pending",
				label: "pending",
				detail: `Stripe fee capture is pending (${attemptLabel(attempts)}).${latestIssue}`,
				...unknownAmounts,
				nextAttemptAt,
				lastAttemptAt,
			};
		}
		case "captured": {
			if (order.stripeFeeProvenance !== "provider_verified") {
				return legacyPresentation(
					recordedFeeMinorUnits,
					feeCurrency,
					lastAttemptAt,
					true,
				);
			}
			if (
				recordedFeeMinorUnits === null
				|| feeCurrency === null
				|| !hasProviderProvenanceV1(order)
			) {
				return {
					tone: "failed",
					label: "verification incomplete",
					detail:
						"Provider verification is marked complete, but its fee amount or currency is unavailable.",
					...unknownAmounts,
					nextAttemptAt: null,
					lastAttemptAt,
				};
			}
			const grossLessActualFeeMinorUnits = feeCurrency === order.currency
				&& knownMinorUnits(order.total)
				&& recordedFeeMinorUnits <= order.total
				? order.total - recordedFeeMinorUnits
				: null;
			return {
				tone: "captured",
				label: "provider verified",
				detail: `${(order.stripeFeeCaptureAttempts ?? 0) > 0
					? `Stripe's original-charge processing fee was verified after ${attemptLabel(order.stripeFeeCaptureAttempts)}.`
					: "Stripe's original-charge processing fee was provider verified."}${feeCurrency !== order.currency
					? " Gross payment and fee currencies differ, so no derived subtraction is shown."
					: grossLessActualFeeMinorUnits === null
						? " Gross payment and fee values cannot be safely subtracted."
						: ""}`,
				actualFeeMinorUnits: recordedFeeMinorUnits,
				unverifiedRecordedFeeMinorUnits: null,
				feeCurrency,
				grossLessActualFeeMinorUnits,
				nextAttemptAt: null,
				lastAttemptAt,
			};
		}
		case "failed":
			return {
				tone: "failed",
				label: "failed",
				detail: `${order.stripeFeeCaptureError ? ERROR_DETAILS[order.stripeFeeCaptureError] : "Stripe fee capture failed."}${(order.stripeFeeCaptureAttempts ?? 0) > 0 ? ` ${attemptLabel(order.stripeFeeCaptureAttempts)} recorded.` : ""}`,
				...unknownAmounts,
				nextAttemptAt: null,
				lastAttemptAt,
			};
		case "canceled":
			return {
				tone: "canceled",
				label: "canceled",
				detail:
					"Fee recording was canceled by the terminal manual-refund path. The actual Stripe processing fee is unavailable.",
				...unknownAmounts,
				nextAttemptAt: null,
				lastAttemptAt,
			};
		case "legacy_unverified":
			return legacyPresentation(recordedFeeMinorUnits, feeCurrency, lastAttemptAt, true);
		default:
			return recordedFeeMinorUnits === null
				? {
						tone: "unknown",
						label: "unknown",
						detail:
							"No provider-verified Stripe processing fee or fee lifecycle is available for this order.",
						...unknownAmounts,
						nextAttemptAt: null,
						lastAttemptAt,
					}
				: legacyPresentation(recordedFeeMinorUnits, feeCurrency, lastAttemptAt);
	}
}

function legacyPresentation(
	recordedFeeMinorUnits: number | null,
	feeCurrency: string | null,
	lastAttemptAt: number | null,
	explicitLegacyUnverified = false,
): StripeFeeCapturePresentation {
	return {
		tone: "legacy",
		label: recordedFeeMinorUnits === null
			? explicitLegacyUnverified ? "legacy unverified" : "not tracked (legacy)"
			: "recorded (unverified)",
		detail: recordedFeeMinorUnits === null
				? "No provider-verified Stripe processing fee is available for this legacy order."
				: "This recorded value is not provider-verified and is not used as an actual processing fee or in derived amounts.",
		actualFeeMinorUnits: null,
		unverifiedRecordedFeeMinorUnits: recordedFeeMinorUnits,
		feeCurrency,
		grossLessActualFeeMinorUnits: null,
		nextAttemptAt: null,
		lastAttemptAt,
	};
}

const CSV_HEADERS = [
	"Order Number",
	"Date",
	"Customer Name",
	"Customer Email",
	"Items",
	"Gross Payment (Minor Units)",
	"Payment Currency",
	"Stripe Fee Capture",
	"Actual Stripe Processing Fee (Minor Units)",
	"Fee Currency",
	"Unverified Recorded Fee (Minor Units)",
	"Gross Less Actual Stripe Fee (Minor Units)",
	"Status",
	"Notes",
];

function escapeCsvCell(cell: string | number): string {
	return `"${String(cell).replace(/"/g, '""')}"`;
}

export function buildOrdersCsv(orders: AdminOrder[]): string {
	const rows = orders.map((order) => {
		const fees = getStripeFeeCapturePresentation(order);
		return [
			order.orderNumber || "",
			new Date(order.createdAt).toLocaleDateString("en-US"),
			order.customerName || "",
			order.customerEmail || "",
			(order.items || [])
				.map((item) => `${item.productName} x${item.quantity}`)
				.join("; "),
			order.total,
			order.currency ?? "",
			fees.label,
			fees.actualFeeMinorUnits ?? "",
			fees.feeCurrency ?? "",
			fees.unverifiedRecordedFeeMinorUnits === null
				? ""
				: fees.unverifiedRecordedFeeMinorUnits,
			fees.grossLessActualFeeMinorUnits ?? "",
			order.status || "",
			order.notes || "",
		];
	});

	return [
		CSV_HEADERS.join(","),
		...rows.map((row) => row.map(escapeCsvCell).join(",")),
	].join("\n");
}
