# Shared Google-linking preview

This isolated fixture mounts the real Admin sidebar with a synthetic session.
It never contacts Convex or Google, changes credentials, or mounts a route in a host.
Its state links show an unlinked account, linked Google account, and failed status
read. Clicking Connect Google in the default preview produces a simulated failure.
The `redirect` scenario is reserved for browser verification, which intercepts the
Google destination before navigation and fulfills it locally.

Run the fixture on its isolated port:

```sh
pnpm exec vite --config tests/fixtures/google-linking/vite.config.ts
```

Optionally set `ADMIN_PREVIEW_PUBLIC_DIR` to a host's public/static directory to use
its existing fonts. Record the server PID and stop only that process when finished.
Then, from another terminal:

```sh
node tests/fixtures/google-linking/verify.mjs /absolute/path/to/host/package.json
```

The host supplies `@playwright/test`. Screenshots and a sanitized report are written
under `.local/google-linking/`. The verifier covers standard sidebar sizing,
keyboard order, connected/unknown/legacy states, error recovery, compact editor
placement, and the authenticated link contract with a stubbed Google destination.
It cannot establish a real owner's Google consent or account linkage.
