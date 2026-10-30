# Connected workflow browser fixture

This fixture renders the real shared inquiry controls and gallery selection review
with an inert synthetic Convex transport and the shared theme. It reads no
provider credentials, customer records or private photographs.

From the package root, start the isolated Vite fixture on port 5243, record its
exact PID, then run:

```sh
node node_modules/vite/bin/vite.js --config tests/fixtures/connected-workflows/vite.config.ts
node tests/fixtures/connected-workflows/verify.mjs .local/connected-workflows
```

The verification drives follow-up saving, explicit lead creation, retained final
selection notes and owner reopening at desktop and phone sizes. It checks page
errors and document overflow and writes screenshots for visual review. Stop only
the recorded fixture-server PID afterwards. These checks do not establish live
membership, deployed backend availability or notification email delivery.
