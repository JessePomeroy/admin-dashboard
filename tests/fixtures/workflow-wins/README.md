Synthetic browser fixture for the real record controller/pagination, inquiry-notification panel, recurring schedule controls, and delivery recovery panel. Uses only inert query/mutation/fetch adapters and fictional records. No credentials or external services.

From this package run `pnpm exec vite --config tests/fixtures/workflow-wins/vite.config.ts`, then `node tests/fixtures/workflow-wins/verify.mjs`. Uses isolated port 5276; record the server PID and stop only that process after verification.
