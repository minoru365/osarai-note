# Security maintenance — 2026-10-24

Vite is pinned to 8.2.4 and Vitest to 4.1.12. Vitest 4 removes the vulnerable
tinypool dependency. Node and vite/client types are now explicit in tsconfig.app.json
because Vitest 4 no longer supplies the former implicitly to adjacent tests.

Validation: frozen npm install (scripts disabled), 203 tests and production build
passed. npm audit decreased from 5 affected packages to 0. The existing large-chunk
build warning and deprecated whatwg-encoding warning remain; no unrelated bundle
optimization was attempted. npm 11 was used locally to avoid an npm 10 lock-update
internal error; the system npm was not changed. Publication has not been performed.

## Brotli build-runtime correction — 2026-10-25

The prior Pages run used cached Node22.23.3 despite requesting major22.
The workflow now pins22.23.4, which fixes CVE-2026-111497 according to the
[Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
This changes the CI build host, not browser application code or stored learning data.
Exact pins must be reviewed when later Node security releases arrive.

Local validation on Node22.23.4: YAML parsed, baseline comparison found only the
Node selection changed, all203 tests passed and production build passed. The
pre-existing large-chunk warning remains. Remote runtime verification follows push.
