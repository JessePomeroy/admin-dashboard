# Modal lifecycle browser fixture

This fixture renders the real Admin shell, media picker and global Toast. It is
non-native: it deliberately does not make the surrounding page inert.

Start the isolated renderer from the package root:

```sh
pnpm exec vite --config tests/fixtures/modal-browser/vite.config.ts
```

Then use an existing Angels Rest Playwright installation (no package dependency
is added here):

```sh
node tests/fixtures/modal-browser/verify.mjs /absolute/path/to/angelsrest/package.json
```

The checks use port 5199 and desktop/mobile Chromium. They cover nested owner
keyboard handling, callback replacement, disabled controls/openers, both
backdrop policies, toast hit-testing and dismissal, and teardown restoration.
The renderer must be stopped after verification. The package's normal Vitest
suite also exercises these lifetimes and the actual AdminLayout drawer-to-page
handoff; it does not claim to coordinate arbitrary concurrent external locks.
