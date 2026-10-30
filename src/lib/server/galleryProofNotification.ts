import { escapeHtml } from "./html.js";

export type GalleryProofNotification = {
	id: string;
	siteUrl: string;
	selectedCount: number;
	notes: string;
	submittedAt: number;
};

export type GalleryProofNotificationResult = "accepted" | "unconfirmed" | "expired";

/**
 * Call only after the host authorizes the gallery token/password and reads its
 * persisted proof. Browser-supplied notification facts must never reach this helper.
 */
export async function sendGalleryProofNotification({
	proof,
	siteUrl,
	from,
	to,
	adminOrigin,
	apiKey,
	now = Date.now(),
	fetch: request = fetch,
}: {
	proof: GalleryProofNotification;
	siteUrl: string;
	from: string;
	to: string;
	adminOrigin: string;
	apiKey: string;
	now?: number;
	fetch?: typeof fetch;
}): Promise<GalleryProofNotificationResult> {
	if (
		proof.siteUrl !== siteUrl ||
		!/^[A-Za-z0-9_-]{1,160}$/.test(proof.id) ||
		!Number.isSafeInteger(proof.selectedCount) ||
		proof.selectedCount < 1 ||
		proof.selectedCount > 2000 ||
		!Number.isSafeInteger(proof.submittedAt) ||
		proof.notes.length > 5000
	)
		throw new Error("Invalid gallery proof notification");
	const age = now - proof.submittedAt;
	if (age < -5 * 60_000) return "unconfirmed";
	// Resend retains keys for 24 hours. Never replay after this shorter window.
	if (age >= 23 * 60 * 60_000) return "expired";
	if (!apiKey || !from.trim() || /[\r\n]/.test(from) || !/^[^\s@<>]+@[^\s@<>]+$/.test(to))
		return "unconfirmed";
	const origin = new URL(adminOrigin);
	if (
		origin.protocol !== "https:" ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		origin.hash
	)
		throw new Error("Invalid gallery proof admin origin");
	const adminUrl = new URL("/admin/galleries", origin).href;
	const submittedAt = new Date(proof.submittedAt).toISOString();
	const summary = `${proof.selectedCount} ${proof.selectedCount === 1 ? "favorite was" : "favorites were"} submitted at ${submittedAt}.`;
	// Use immutable proof fields only: gallery names and current favorites may change.
	const text = `Gallery selection submitted\n\n${summary}\n\n${proof.notes}\n\nReview the submitted selection: ${adminUrl}`;
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gallery selection submitted</title></head><body style="overflow-wrap:anywhere"><h1>Gallery selection submitted</h1><p>${escapeHtml(summary)}</p>${proof.notes ? `<h2>Client notes</h2><p style="white-space:pre-wrap">${escapeHtml(proof.notes)}</p>` : ""}<p><a href="${escapeHtml(adminUrl)}">Review the submitted selection</a></p></body></html>`;
	try {
		const response = await request("https://api.resend.com/emails", {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(8_000),
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				"idempotency-key": `gallery-proof-${proof.id}`,
			},
			body: JSON.stringify({ from, to: [to], subject: "Gallery selection submitted", text, html }),
		});
		if (!response.ok) return "unconfirmed";
		const result: unknown = await response.json();
		return result !== null &&
			typeof result === "object" &&
			!("error" in result) &&
			"id" in result &&
			typeof result.id === "string" &&
			result.id.length > 0
			? "accepted"
			: "unconfirmed";
	} catch {
		// An uncertain provider response must not turn a persisted proof into a failure.
		return "unconfirmed";
	}
}
