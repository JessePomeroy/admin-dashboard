
export const CUSTOMER_CHECKOUT_COOKIE = "ar_checkout_sid";
const sessionIdPattern = /^cs_(?:test_|live_)?[a-zA-Z0-9]{1,240}$/;
type Cookies = { get(name: string): string | undefined; set(name: string, value: string, options: { path: string; httpOnly: boolean; sameSite: "lax"; secure: boolean; maxAge: number }): void };
export function bindCustomerCheckout(cookies: Cookies, sessionId: string, secure = true) {
 if (!sessionIdPattern.test(sessionId)) throw new Error("Invalid checkout session");
 cookies.set(CUSTOMER_CHECKOUT_COOKIE, sessionId, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 3600 });
}
export function ownsCustomerCheckout(cookies: Pick<Cookies, "get">, sessionId: string | null | undefined) {
 return Boolean(sessionId && sessionIdPattern.test(sessionId) && cookies.get(CUSTOMER_CHECKOUT_COOKIE) === sessionId);
}
export function customerServiceUrl(hubOrigin: string, siteUrl: string, path: "/orders" | "/checkout/success") {
 const hub = new URL(hubOrigin);
 if (hub.protocol !== "https:" || hub.username || hub.password || hub.port || hub.pathname !== "/" || hub.search || hub.hash || !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(siteUrl)) throw new Error("Invalid customer service configuration");
 const url = new URL(path, hub.origin); url.searchParams.set("site", siteUrl); return url;
}
export type CheckoutConfirmation = { paymentStatus: "paid" | "unpaid"; amountTotal: number; currency: string; items: { description: string; quantity: number; amount: number }[] };
export function readCheckoutConfirmation(value: unknown): CheckoutConfirmation {
 if (!value || typeof value !== "object" || !("paymentStatus" in value) || !("amountTotal" in value) || !("currency" in value) || !("items" in value) || !Array.isArray(value.items) || value.items.length > 200 || !["paid", "unpaid"].includes(String(value.paymentStatus)) || typeof value.amountTotal !== "number" || !Number.isSafeInteger(value.amountTotal) || value.amountTotal < 0 || typeof value.currency !== "string" || !/^[a-z]{3}$/.test(value.currency)) throw new Error("Invalid checkout confirmation");
 const items = value.items.map((item: unknown) => {
  if (!item || typeof item !== "object" || !("description" in item) || !("quantity" in item) || !("amount" in item) || typeof item.description !== "string" || item.description.length > 1000 || typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || typeof item.amount !== "number" || !Number.isSafeInteger(item.amount) || item.amount < 0) throw new Error("Invalid checkout item");
  return { description: item.description, quantity: item.quantity, amount: item.amount };
 });
 return { paymentStatus: value.paymentStatus === "paid" ? "paid" : "unpaid", amountTotal: value.amountTotal, currency: value.currency, items };
}
/** A browser return URL is never payment proof. Only the bound buyer can request this hub read. */
export async function loadCustomerCheckoutConfirmation(options: { cookies: Pick<Cookies, "get">; sessionId: string | null; hubOrigin: string; siteUrl: string; secret: string; fetch: typeof fetch; now?: number }): Promise<CheckoutConfirmation | null> {
 if (!ownsCustomerCheckout(options.cookies, options.sessionId)) return null;
 const url = customerServiceUrl(options.hubOrigin, options.siteUrl, "/checkout/success");
 const body = JSON.stringify({ siteUrl: options.siteUrl, sessionId: options.sessionId });
 const timestamp = options.now ?? Date.now();
 if (options.secret.length < 32 || options.secret.length > 512) throw new Error("Checkout confirmation credentials unavailable");
 const encoder = new TextEncoder();
 const key = await crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
 const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
 const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
 const response = await options.fetch(new URL("/api/tenant-checkout/confirmation", url.origin), { method: "POST", headers: { "content-type": "application/json", "x-checkout-bridge-timestamp": String(timestamp), "x-checkout-bridge-signature": signature }, body, redirect: "error", signal: AbortSignal.timeout(15_000) });
 if (!response.ok) throw new Error("Checkout confirmation unavailable");
 const reader = response.body?.getReader(); if (!reader) throw new Error("Missing checkout confirmation");
 const chunks: Uint8Array[] = []; let size = 0;
 for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 128_000) { await reader.cancel(); throw new Error("Checkout confirmation too large"); } chunks.push(value); }
 const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 return readCheckoutConfirmation(JSON.parse(new TextDecoder().decode(bytes)));
}
