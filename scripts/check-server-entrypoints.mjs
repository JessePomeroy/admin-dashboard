import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, nextResolve) {
		assert.ok(
			specifier !== "resend" && !specifier.startsWith("resend/"),
			"Granular server imports must not load the email SDK",
		);
		return nextResolve(specifier, context);
	},
});

const auth = await import("@jessepomeroy/admin/server/auth");
const preview = await import("@jessepomeroy/admin/server/draft-preview");
const proof = await import("@jessepomeroy/admin/server/gallery-proof");
assert.equal(typeof auth.createAdminAuthValidator, "function");
assert.equal(typeof auth.createAdminTokenHandler, "function");
assert.equal(typeof preview.createDraftPreviewHandler, "function");
assert.equal(typeof proof.sendGalleryProofNotification, "function");

const target = { kind: "about", revisionId: "synthetic-revision", path: "/about" };
const path = await preview.issueDraftPreview(target, "fixture.example", "synthetic-session");
const url = new URL(path, "https://fixture.example");
assert.deepEqual(await preview.readDraftPreview(url, "fixture.example", "synthetic-session"), {
	...target,
	resourceId: undefined,
});
await assert.rejects(preview.readDraftPreview(url, "fixture.example", "another-session"));
console.log("Granular auth, preview and proof exports load without the email SDK; preview grants verify.");
