import type { Order, OrderStatus } from "../../types";

export interface AdminOrder {
	_id: string;
	orderNumber: string;
	createdAt: string;
	customerEmail: string;
	customerName: string;
	total: number;
	stripeFees?: number;
	stripeFeeCaptureStatus?: Order["stripeFeeCaptureStatus"];
	stripeFeeCaptureAttempts?: number;
	stripeFeeCaptureLastAttemptAt?: number;
	stripeFeeCaptureNextAttemptAt?: number;
	stripeFeeCaptureError?: Order["stripeFeeCaptureError"];
	status: OrderStatus;
	currency: string;
	items: Order["items"];
	shippingAddress: NonNullable<Order["shippingAddress"]> | null;
	notes: string;
}

export type StripeFeeCaptureTone =
	| "pending"
	| "captured"
	| "failed"
	| "legacy";

export interface StripeFeeCapturePresentation {
	tone: StripeFeeCaptureTone;
	label: string;
	detail: string;
	feeCents: number | null;
	netRevenueCents: number | null;
	nextAttemptAt: number | null;
	lastAttemptAt: number | null;
}

const ERROR_DETAILS: Record<
	NonNullable<Order["stripeFeeCaptureError"]>,
	string
> = {
	balance_transaction_not_ready: "Stripe's balance transaction was not ready.",
	stripe_api_error: "Stripe could not be reached or returned an error.",
	stripe_secret_key_missing: "The Stripe secret key is not configured.",
	payment_intent_missing: "The order has no Stripe payment intent.",
};

function knownAmount(value: number | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function attemptLabel(attempts = 0): string {
	return `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`;
}

export function getStripeFeeCapturePresentation(
	order: Pick<
		AdminOrder,
		| "total"
		| "stripeFees"
		| "stripeFeeCaptureStatus"
		| "stripeFeeCaptureAttempts"
		| "stripeFeeCaptureLastAttemptAt"
		| "stripeFeeCaptureNextAttemptAt"
		| "stripeFeeCaptureError"
	>,
): StripeFeeCapturePresentation {
	const feeCents = knownAmount(order.stripeFees) ? order.stripeFees : null;
	const netRevenueCents = feeCents === null ? null : order.total - feeCents;
	const lastAttemptAt = order.stripeFeeCaptureLastAttemptAt ?? null;
	const nextAttemptAt = order.stripeFeeCaptureNextAttemptAt ?? null;

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
				feeCents: null,
				netRevenueCents: null,
				nextAttemptAt,
				lastAttemptAt,
			};
		}
		case "captured":
			return {
				tone: "captured",
				label: "captured",
				detail:
					feeCents === null
						? "Stripe marked fee capture complete, but no fee amount is available."
						: (order.stripeFeeCaptureAttempts ?? 0) > 0
							? `Stripe fee captured after ${attemptLabel(order.stripeFeeCaptureAttempts)}.`
							: "Stripe fee capture completed.",
				feeCents,
				netRevenueCents,
				nextAttemptAt: null,
				lastAttemptAt,
			};
		case "failed":
			return {
				tone: "failed",
				label: "failed",
				detail: `${order.stripeFeeCaptureError ? ERROR_DETAILS[order.stripeFeeCaptureError] : "Stripe fee capture failed."}${(order.stripeFeeCaptureAttempts ?? 0) > 0 ? ` ${attemptLabel(order.stripeFeeCaptureAttempts)} recorded.` : ""}`,
				feeCents: null,
				netRevenueCents: null,
				nextAttemptAt: null,
				lastAttemptAt,
			};
		default:
			if (feeCents !== null) {
				return {
					tone: "legacy",
					label: "captured (legacy)",
					detail: "This fee amount predates durable capture checkpoints.",
					feeCents,
					netRevenueCents,
					nextAttemptAt: null,
					lastAttemptAt: null,
				};
			}

			return {
				tone: "legacy",
				label: "not tracked (legacy)",
				detail: "This order predates durable Stripe fee capture state.",
				feeCents: null,
				netRevenueCents: null,
				nextAttemptAt: null,
				lastAttemptAt: null,
			};
	}
}

const CSV_HEADERS = [
	"Order Number",
	"Date",
	"Customer Name",
	"Customer Email",
	"Items",
	"Gross Revenue",
	"Stripe Fee Capture",
	"Stripe Fees",
	"Net Revenue",
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
			((order.total || 0) / 100).toFixed(2),
			fees.label,
			fees.feeCents === null ? "" : (fees.feeCents / 100).toFixed(2),
			fees.netRevenueCents === null
				? ""
				: (fees.netRevenueCents / 100).toFixed(2),
			order.status || "",
			order.notes || "",
		];
	});

	return [
		CSV_HEADERS.join(","),
		...rows.map((row) => row.map(escapeCsvCell).join(",")),
	].join("\n");
}
