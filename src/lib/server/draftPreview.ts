import { json, type Cookies, type RequestEvent } from "@sveltejs/kit";

export type DraftPreviewKind = "settings" | "about" | "contact" | "portfolio" | "product";
export interface DraftPreviewTarget {
	kind: DraftPreviewKind;
	revisionId: string;
	resourceId?: string;
	path: string;
}
interface DraftPreviewGrant extends DraftPreviewTarget { siteUrl: string; expiresAt: number }
const LIFETIME_MS = 5 * 60 * 1000;
const KINDS: readonly string[] = ["settings", "about", "contact", "portfolio", "product"];
export const DRAFT_PREVIEW_QUERY = "draftPreview";
export interface DraftPreviewInput { draftRevisionId: string; galleryId?: string; productId?: string }

export function createDraftPreviewHandler(options: {
	siteUrl: string;
	requireSiteAdmin: (cookies: Cookies) => Promise<string>;
	resolve: (kind: DraftPreviewKind, input: DraftPreviewInput, sessionToken: string) => Promise<DraftPreviewTarget>;
}) {
	return async ({ request, cookies, params, url }: Pick<RequestEvent, "request" | "cookies" | "params" | "url">) => {
		if (request.method !== "POST") return json({ error: "Use POST." }, { status: 405 });
		if (request.headers.get("origin") !== url.origin) return json({ error: "Invalid preview origin." }, { status: 403 });
		const kind = params.kind;
		if (!isKind(kind)) return json({ error: "Unknown preview type." }, { status: 404 });
		const token = await options.requireSiteAdmin(cookies);
		try {
			const raw = await readPreviewBody(request);
			const input: unknown = JSON.parse(raw);
			if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid preview request");
			const fields = Object.entries(input);
			const allowed = ["draftRevisionId", ...(kind === "portfolio" ? ["galleryId"] : kind === "product" ? ["productId"] : [])];
			if (fields.some(([key, value]) => !allowed.includes(key) || typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value))
				|| !("draftRevisionId" in input) || typeof input.draftRevisionId !== "string"
				|| (kind === "portfolio" && !("galleryId" in input)) || (kind === "product" && !("productId" in input))) throw new Error("Invalid preview request");
			const parsed: DraftPreviewInput = { draftRevisionId: input.draftRevisionId,
				...("galleryId" in input && typeof input.galleryId === "string" ? { galleryId: input.galleryId } : {}),
				...("productId" in input && typeof input.productId === "string" ? { productId: input.productId } : {}) };
			const target = await options.resolve(kind, parsed, token);
			const resourceId = kind === "portfolio" ? parsed.galleryId : kind === "product" ? parsed.productId : undefined;
			if (target.kind !== kind || target.revisionId !== input.draftRevisionId || target.resourceId !== resourceId) throw new Error("Preview scope mismatch");
			return json({ previewUrl: await issueDraftPreview(target, options.siteUrl, token) }, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });
		} catch {
			return json({ error: "Could not preview this draft. Complete its required fields, save, and try again." }, { status: 409, headers: { "cache-control": "private, no-store" } });
		}
	};
}

function validateTarget(value: unknown): value is DraftPreviewTarget {
	if (!value || typeof value !== "object") return false;
	const target = value as Record<string, unknown>;
	return typeof target.kind === "string" && KINDS.includes(target.kind)
		&& typeof target.revisionId === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(target.revisionId)
		&& (target.resourceId === undefined || (typeof target.resourceId === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(target.resourceId)))
		&& typeof target.path === "string" && /^\/(?:[a-z0-9-]+\/?)*$/.test(target.path);
}

/** The grant is tied to a currently authenticated session, never a public bearer preview. */
export async function issueDraftPreview(target: DraftPreviewTarget, siteUrl: string, sessionToken: string, now = Date.now()) {
	if (!validateTarget(target) || !siteUrl || !sessionToken) throw new Error("Invalid draft preview target");
	const grant: DraftPreviewGrant = { ...target, siteUrl, expiresAt: now + LIFETIME_MS };
	const payload = encode(new TextEncoder().encode(JSON.stringify(grant)));
	const key = await signingKey(sessionToken);
	const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, signingInput(payload))));
	return `${target.path}?${DRAFT_PREVIEW_QUERY}=${payload}.${signature}`;
}

/** Hosts must verify current stored site membership before calling this reader. */
export async function readDraftPreview(url: URL, siteUrl: string, sessionToken: string, now = Date.now()): Promise<DraftPreviewTarget> {
	const encoded = url.searchParams.get(DRAFT_PREVIEW_QUERY);
	if (!encoded || encoded.length > 2048 || !sessionToken) throw new Error("Invalid draft preview");
	const parts = encoded.split(".");
	if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new Error("Invalid draft preview");
	const key = await signingKey(sessionToken);
	if (!(await crypto.subtle.verify("HMAC", key, decode(parts[1]), signingInput(parts[0])))) throw new Error("Draft preview session changed. Open a new preview.");
	const grant: unknown = JSON.parse(new TextDecoder().decode(decode(parts[0])));
	if (!validateTarget(grant) || !("siteUrl" in grant) || grant.siteUrl !== siteUrl || grant.path !== url.pathname
		|| !("expiresAt" in grant) || typeof grant.expiresAt !== "number" || !Number.isFinite(grant.expiresAt)
		|| grant.expiresAt <= now || grant.expiresAt > now + LIFETIME_MS) throw new Error("Draft preview expired or invalid. Open a new preview.");
	return { kind: grant.kind, revisionId: grant.revisionId, resourceId: grant.resourceId, path: grant.path };
}

function encode(value: Uint8Array) { return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0)); }
function signingInput(payload: string) { return new TextEncoder().encode(`admin-draft-preview-v1.${payload}`); }
function signingKey(token: string) { return crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }

function isKind(value: unknown): value is DraftPreviewKind { return typeof value === "string" && KINDS.includes(value); }
async function readPreviewBody(request: Request) {
 if (!request.body) throw new Error("Missing preview body");
 const reader = request.body.getReader();
 const decoder = new TextDecoder();
 let size = 0;
 let text = "";
 try {
  for (;;) {
   const chunk = await reader.read();
   if (chunk.done) break;
   size += chunk.value.length;
   if (size > 4096) throw new Error("Preview request is too large");
   text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
 } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
 finally { reader.releaseLock(); }
}
