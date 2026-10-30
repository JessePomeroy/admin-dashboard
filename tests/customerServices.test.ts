import { createHmac } from "node:crypto";
import { expect, test, vi } from "vitest";
import { bindCustomerCheckout, ownsCustomerCheckout, loadCustomerCheckoutConfirmation, readCheckoutConfirmation } from "../src/lib/server/customerServices";
const secret = "synthetic-checkout-bridge-credential-12345";
const sessionId = "cs_test_buyer123";
const receipt = { paymentStatus: "paid", amountTotal: 30000, currency: "usd", items: [{ description: "Print", quantity: 1, amount: 30000 }] };
test("binding is private and an unbound return cannot contact the hub", async () => {
 const set = vi.fn(); bindCustomerCheckout({ get: () => undefined, set }, sessionId);
 expect(set).toHaveBeenCalledWith("ar_checkout_sid", sessionId, expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" }));
 expect(ownsCustomerCheckout({ get: () => sessionId }, "cs_test_another")).toBe(false);
 const request = vi.fn(); expect(await loadCustomerCheckoutConfirmation({ cookies: { get: () => undefined }, sessionId, hubOrigin: "https://hub.example", siteUrl: "fixture.example", secret, fetch: request })).toBeNull(); expect(request).not.toHaveBeenCalled();
});
test("the bound buyer requests a signed, tenant-scoped confirmation and receives no arbitrary fields", async () => {
 const request = vi.fn(async (_url, options) => {
  const signature = createHmac("sha256", secret).update(`123.${options.body}`).digest("hex");
  expect(options.headers["x-checkout-bridge-signature"]).toBe(signature);
  expect(JSON.parse(options.body)).toEqual({ siteUrl: "fixture.example", sessionId });
  return Response.json({ ...receipt, customerEmail: "must-not-leak@example.test" });
 });
 expect(await loadCustomerCheckoutConfirmation({ cookies: { get: () => sessionId }, sessionId, hubOrigin: "https://hub.example", siteUrl: "fixture.example", secret, fetch: request, now: 123 })).toEqual(receipt);
});
test("malformed confirmation amounts fail closed", () => {
 expect(() => readCheckoutConfirmation({ ...receipt, amountTotal: -1 })).toThrow();
 expect(() => readCheckoutConfirmation({ ...receipt, items: [{ ...receipt.items[0], quantity: 0 }] })).toThrow();
});
