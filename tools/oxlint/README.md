# Anti-slop lint rules

Run `pnpm lint:anti-slop` to check the baseline rules, or `pnpm lint` to run
all configured lint checks. The active severities and file exclusions live in
`.oxlintrc.json`.

The baseline enforces `no-widen-then-assert` as an error. These rules remain
warnings, with retained findings reviewed against their owner contracts:

- `no-chained-type-assertions`
- `no-known-value-widening`

These rules inspect TypeScript/JavaScript, including script blocks in Svelte
components. They do not lint Svelte template expressions. Legitimate boundary
validation can continue to accept `unknown` and use runtime narrowing. Review
findings against the actual contracts before changing code or raising severity.

The existing linter configuration remains authoritative for other rules.
Oxlint's default rules are disabled so this command adds only the chosen profile.
Generated outputs, installed agent assets, and vendored rule code are excluded;
application code and tests remain included. The separate stricter and Effect
profiles are not enabled.

## Source and updates

`anti-slop/` is a vendored copy from the shared `install-anti-slop` skill,
originating from <https://github.com/dmmulroy/anti-slop>. All 21 TypeScript files
and the MIT license byte-match reviewed upstream revision
`6d538555cb151d4121ed51a27db81890eacf8ae9`. `anti-slop/PROVENANCE.json` records
that revision and each file's SHA-256. This update adds provenance without
changing rule code. The upstream MIT license is preserved in `anti-slop/LICENSE`.

The copy's TypeScript sources are unmodified. Keep the original copy available
through version control when updating, review upstream changes, and preserve
local rule selections and justified exceptions. `oxlint` and `@oxlint/plugins`
are pinned development dependencies; the package manifest and lockfile record
the installed versions.
