# Inquiry pagination browser fixture

Renders the real inquiry page with real `useQuery` subscriptions and a controlled
synthetic client. No provider, authentication, or customer records are used.

Run from the package root:

```sh
pnpm exec vite --config tests/fixtures/inquiries/vite.config.ts
node tests/fixtures/inquiries/verify.mjs /tmp/inquiry-browser-evidence
```

The fixture uses isolated localhost port 5213. Record and stop only its task-owned
server PID after inspection. The script verifies desktop/mobile Chromium traversal
through 206 inquiries, server-filter arguments, status changes, failed-page retry,
document overflow and page errors, and saves screenshots for visual inspection.
It complements the real Convex handler and component regressions; it does not
establish deployed backend access or authentication.
