# Security maintenance — 2026-10-24

Vite is pinned to 8.2.4 and Vitest to 4.1.12. Vitest 4 removes the vulnerable
tinypool dependency. Node and vite/client types are now explicit in tsconfig.app.json
because Vitest 4 no longer supplies the former implicitly to adjacent tests.

Validation: frozen npm install (scripts disabled), 203 tests and production build
passed. npm audit decreased from 5 affected packages to 0. The existing large-chunk
build warning and deprecated whatwg-encoding warning remain; no unrelated bundle
optimization was attempted. npm 11 was used locally to avoid an npm 10 lock-update
internal error; the system npm was not changed. Publication has not been performed.
