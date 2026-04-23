# @jessepomeroy/admin

A pre-built admin dashboard for SvelteKit + Convex applications. Provides 12 page-level components, auth scaffolding, feature-tier gating, and server-side handlers for email, gallery uploads, and client portals.

## Install

```bash
pnpm add @jessepomeroy/admin
```

Published to GitHub Packages. Your `.npmrc` needs:

```
@jessepomeroy:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

### Peer dependencies

```
@mmailaender/convex-svelte  ^0.18.0
@sveltejs/kit               ^2.0.0
convex                      ^1.30.0
isomorphic-dompurify        ^3.0.0
resend                      ^6.0.0
svelte                      ^5.0.0
svelte-dnd-action           ^0.9.0
```

## Quick start

### 1. Create your admin config

```ts
// src/lib/config/admin.ts
import type { AdminConfig } from "@jessepomeroy/admin";
import { api } from "$convex/api";

export const adminConfig: AdminConfig = {
  siteUrl: "mysite.com",
  siteName: "My Site",
  fromEmail: "My Site <noreply@mysite.com>",
  isCreator: false, // true = platform owner, false = client tenant
  api,
};
```

### 2. Create the server config

```ts
// src/lib/config/admin.server.ts
import type { AdminServerConfig } from "@jessepomeroy/admin";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { adminConfig } from "./admin";

export const adminServerConfig: AdminServerConfig = {
  ...adminConfig,
  convexUrl: publicEnv.PUBLIC_CONVEX_URL ?? "",
  resendApiKey: privateEnv.RESEND_API_KEY ?? "",
  // Optional — only needed if using gallery delivery:
  // galleryAdminSecret: privateEnv.GALLERY_ADMIN_SECRET ?? "",
};
```

### 3. Wire up the admin layout

```svelte
<!-- src/routes/admin/+layout.svelte -->
<script lang="ts">
  import { AdminLayout, AuthGuard, setAdminConfig } from "@jessepomeroy/admin";
  import { adminConfig } from "$lib/config/admin";

  // If using Better Auth:
  // import type { AdminAuthClient } from "@jessepomeroy/admin";
  // setAdminConfig({ ...adminConfig, authClient: yourAuthClient as AdminAuthClient });

  setAdminConfig(adminConfig);

  let { children } = $props();
</script>

<AuthGuard>
  <AdminLayout>
    {@render children()}
  </AdminLayout>
</AuthGuard>
```

```ts
// src/routes/admin/+layout.ts
export const ssr = false; // Required — avoids DOMPurify ESM issues on Vercel
```

### 4. Add page routes

Each admin page is a thin wrapper:

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
  import { DashboardPage } from "@jessepomeroy/admin";
</script>

<DashboardPage />
```

```svelte
<!-- src/routes/admin/orders/+page.svelte -->
<script lang="ts">
  import { OrdersPage } from "@jessepomeroy/admin";
</script>

<OrdersPage />
```

## Pages

| Page | Route | Tier | Description |
|------|-------|------|-------------|
| `DashboardPage` | `/admin` | basic | Revenue, orders, invoices, quotes overview |
| `OrdersPage` | `/admin/orders` | basic | Print order tracking and fulfillment |
| `InquiriesPage` | `/admin/inquiries` | basic | Contact form submissions |
| `GalleriesPage` | `/admin/galleries` | basic | Photo gallery management |
| `CrmPage` | `/admin/crm` | full | Client database with tags and activity |
| `BoardPage` | `/admin/board` | full | Kanban board for project management |
| `InvoicingPage` | `/admin/invoicing` | full | Invoice creation, tracking, payments |
| `QuotesPage` | `/admin/quotes` | full | Quote generation with preset packages |
| `ContractsPage` | `/admin/contracts` | full | Contract templates and e-signatures |
| `EmailsPage` | `/admin/emails` | full | Email template management |
| `MessagesPage` | `/admin/messages` | full | Client messaging threads |
| `PlatformPage` | `/admin/platform` | full | Multi-tenant client management |

## Feature tiers

Pages are gated by subscription tier. The `FeatureGate` component and `hasFeature()` function control access:

- **basic** — dashboard, orders, inquiries, galleries
- **full** — everything above plus CRM, board, invoicing, quotes, contracts, emails, messages, gallery delivery

The `AdminLayout` sidebar automatically hides pages the current tier can't access. Use `UpgradeBanner` to prompt upgrades.

## AdminConfig reference

```ts
interface AdminConfig {
  siteUrl: string;           // Domain identifier (e.g. "mysite.com")
  siteName: string;          // Display name
  fromEmail: string;         // Sender for emails (e.g. "Name <noreply@...>")
  isCreator: boolean;        // true = platform owner sees everything
  api: AdminAPI;             // Convex function references (see below)
  sanityStudioUrl?: string;  // Link to Sanity studio
  authClient?: AdminAuthClient; // Better Auth client for login/signup
  galleryWorkerUrl?: string; // Cloudflare Worker URL for gallery uploads
  theme?: {
    dark?: AdminTheme;
    light?: AdminTheme;
  };
}

interface AdminServerConfig extends AdminConfig {
  convexUrl: string;         // Convex deployment URL
  resendApiKey: string;      // Resend API key for sending emails
  galleryAdminSecret?: string; // Bearer token for gallery worker
  verifyAdmin?: (request: Request) => Promise<boolean>; // Auth check for handlers
}
```

## AdminAPI

The `api` field maps your Convex function references to the admin package. Pass your Convex `api` object directly — it must export the expected module namespaces.

**Required modules:** `activityLog`, `contracts`, `crm`, `emailLog`, `emailTemplates`, `invoices`, `kanban`, `messages`, `orders`, `platform`, `portal`, `quotes`, `tags`

**Optional modules:** `adminAuth`, `galleryDelivery`, `notifications`

If your Convex module names differ from the expected keys (e.g. `galleries` instead of `galleryDelivery`), use a Proxy wrapper:

```ts
const apiWithAlias = new Proxy(api, {
  get(target, prop, receiver) {
    if (prop === "galleryDelivery") return target.galleries;
    return Reflect.get(target, prop, receiver);
  },
});
```

> **Warning:** Never spread `api` with `{ ...api }` — Convex's `anyApi` is a Proxy with no own enumerable properties. Spreading it silently drops every namespace.

## Theming

The admin dashboard supports light and dark modes with CSS custom properties. Override any token in your theme config:

```ts
const adminConfig: AdminConfig = {
  // ...
  theme: {
    dark: {
      "admin-bg": "#0a0a0f",
      "admin-accent": "#8b7cf7",
    },
    light: {
      "admin-bg": "#fafafa",
      "admin-accent": "#6b5ce7",
    },
  },
};
```

Available tokens: `admin-bg`, `admin-surface`, `admin-surface-raised`, `admin-border`, `admin-border-strong`, `admin-heading`, `admin-text`, `admin-text-muted`, `admin-text-subtle`, `admin-accent`, `admin-accent-hover`, `admin-active`, `status-slate`, `status-amber`, `status-lavender`, `status-peach`, `status-sage`, `status-rose`.

## Server handlers

The package exports factory functions for common server-side operations. Wire them into your SvelteKit `+server.ts` routes:

```ts
// src/routes/api/admin/send-invoice/+server.ts
import { createInvoiceSendHandler, setServerConfig } from "@jessepomeroy/admin";
import { adminServerConfig } from "$lib/config/admin.server";

setServerConfig(adminServerConfig);

export const POST = createInvoiceSendHandler();
```

**Available handlers:**

| Handler | Method | Description |
|---------|--------|-------------|
| `createInvoiceSendHandler()` | POST | Send invoice email to client |
| `createContractSendHandler()` | POST | Send contract for e-signature |
| `createQuoteSendHandler()` | POST | Send quote email to client |
| `createPortalTokenHandler()` | POST | Generate client portal access token |
| `createGalleryPresignHandler()` | POST | Get presigned URL for gallery upload |
| `createGalleryUploadHandler()` | PUT | Stream file to gallery worker |
| `createGalleryProcessHandler()` | POST | Trigger image processing (preview/thumb) |
| `createGalleryDeleteHandler()` | POST | Delete image and all size variants |

### Authentication

All server handlers call `verifyAdmin(request)` before processing. To enable this, provide a `verifyAdmin` callback in your server config:

```ts
export const adminServerConfig: AdminServerConfig = {
  ...adminConfig,
  convexUrl: publicEnv.PUBLIC_CONVEX_URL ?? "",
  resendApiKey: privateEnv.RESEND_API_KEY ?? "",
  verifyAdmin: async (request) => {
    // Example: check a session cookie or Bearer token
    const session = await getSession(request);
    return !!session?.user;
  },
};
```

If `verifyAdmin` is not provided, handlers skip the auth check — your SvelteKit route middleware or layout guards are responsible for protecting admin endpoints.

The `authClient` field on `AdminConfig` powers the client-side login/signup UI. It expects a Better Auth-compatible client with `signIn`, `signUp`, `signOut`, `changePassword`, and `useSession` methods. If not provided:
- The login page won't render
- The sidebar won't show sign out, change password, or the user email
- The `AuthGuard` component will still render its children (no blocking)

For non-Better Auth setups, implement the `AdminAuthClient` interface with your own provider.

## Gallery delivery setup

Gallery delivery requires a Cloudflare Worker that handles image uploads to R2. The admin package communicates with this worker via `galleryWorkerUrl` and `galleryAdminSecret`.

### Worker endpoints

Your worker must implement these endpoints, all authenticated via `Authorization: Bearer <ADMIN_SECRET>`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload/presign` | POST | Generate a presigned upload URL |
| `/upload/put` | PUT | Stream a file to R2 |
| `/upload/process` | POST | Generate preview + thumbnail variants |
| `/upload/delete` | POST | Delete original + all variants |

### Configuration

```ts
// src/lib/config/admin.ts
export const adminConfig: AdminConfig = {
  // ...
  galleryWorkerUrl: "https://your-gallery-worker.workers.dev",
};

// src/lib/config/admin.server.ts
export const adminServerConfig: AdminServerConfig = {
  // ...
  galleryAdminSecret: privateEnv.GALLERY_ADMIN_SECRET ?? "",
};
```

### Server routes

Wire the gallery handlers into your SvelteKit routes:

```ts
// src/routes/api/admin/gallery/presign/+server.ts
import { createGalleryPresignHandler, setServerConfig } from "@jessepomeroy/admin";
import { adminServerConfig } from "$lib/config/admin.server";

setServerConfig(adminServerConfig);
export const POST = createGalleryPresignHandler();
```

Repeat for `createGalleryUploadHandler` (PUT), `createGalleryProcessHandler` (POST), and `createGalleryDeleteHandler` (POST).

If `galleryWorkerUrl` is not set in the config, the gallery delivery tab is hidden automatically — the portfolio tab still works.

### File validation

The presign handler validates uploaded filenames: max 255 characters, no path traversal (`..`, `/`, `\`), and image extensions only (jpg, jpeg, png, webp, tiff, tif). The allowlist mirrors `GalleryUploader`'s accepted MIME types.

## Shared components

Beyond page components, the package exports reusable UI primitives:

- `AdminModal` — Modal dialog
- `NotificationWidget` — Floating unread notification badge (auto-mounted in AdminLayout)
- `EmailPreview` — Side-by-side email template preview
- `FeatureGate` — Conditionally render content by tier
- `FilterBar` — Data table filtering controls
- `LoadingState` — Loading spinner
- `PageHeader` — Page title with optional breadcrumb
- `StatusDot` — Color-coded status indicator
- `UpgradeBanner` — Tier upgrade prompt
- `addToast()` — Trigger toast notifications

## Deep linking

All document pages support auto-opening a detail modal via the `?open=` query parameter:

```
/admin/invoicing?open=<invoiceId>
/admin/quotes?open=<quoteId>
/admin/contracts?open=<contractId>
/admin/orders?open=<orderId>
```

The dashboard activity feed and CRM activity timeline use this to navigate directly to a document's detail view when clicked.

## Convex schema

Your Convex backend needs to implement the functions referenced by `AdminAPI`. See the [reflecting-pool](https://github.com/JessePomeroy/reflecting-pool) repo for a minimal reference implementation, or [angelsrest](https://github.com/JessePomeroy/angelsrest) for a full-featured setup with gallery delivery, notifications, and admin auth.

## License

MIT
