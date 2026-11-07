# Inquiry browser regression fixture

Renders the real inquiry page with real `useQuery` subscriptions and a controlled
synthetic client. No provider, authentication, or customer records are used.

Run from the package root:

```sh
pnpm exec vite --config tests/fixtures/inquiries/vite.config.ts
node tests/fixtures/inquiries/verify.mjs /tmp/inquiry-browser-evidence
```

The fixture uses isolated localhost port 5213. Record and stop only its task-owned
server PID after inspection. The script checks Chromium and WebKit in light/dark
at 1280px, 390px, and 320px. Set `BROWSER=chromium` or `BROWSER=webkit` to select one
engine, or `INQUIRY_FIXTURE_URL` to target the same fixture on an isolated port.

Coverage includes traversal through 206 inquiries, server-filter arguments, status
changes, failed-page retry, table/row/cell/columnheader roles, each initial cell's
horizontal bounds at scrollLeft 0, keyboard View/Close, focus trapping and return,
and document overflow. `?case=long-tokens` supplies a fictional 141-character email,
180-character unbroken subject, and URL with a 320-character unbroken path. Mobile
checks require their complete modal values to wrap inside the content, preserve a
clickable Close, and restore focus after Escape. Screenshots and `verification.json`
record the measured results. A document-width check alone cannot establish that
individual table cells or modal text are accessible without horizontal panning.

This package fixture uses the admin theme without a consuming site's global CSS.
Host-style acceptance needs a separate isolated fixture using the host's real CSS.
These checks complement Convex and component regressions; they do not establish
live backend/authentication access, physical-device behavior, or a screen-reader
pass.
