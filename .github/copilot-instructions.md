# GitHub Copilot repository instructions

Before planning, editing, reviewing, or running commands in this repository:

- Follow the repository-wide rules in `AGENTS.md`.
- Read `docs/handoff.md` for the current snapshot, uncommitted work, next task, and exact resume commands.
- Read `docs/progress.md` for verified implementation status and known limitations.
- Read the relevant section of `docs/study-support-plan.md` before making product or behavior decisions.
- Read `docs/content-generation-design.md` before changing kanji source data, review batches, or generation scripts.
- Read the relevant ADR under `docs/adr/` before changing an established architectural decision.

The documents above are canonical. Do not duplicate changing counts or task status in this file. If instructions conflict, preserve user data and existing work, then follow the more specific repository document.

Important operating constraints:

- Do not directly edit generated files listed in `AGENTS.md`.
- Do not discard uncommitted changes.
- Do not change IndexedDB compatibility, question IDs, or `pairId` values without reading the design documents and adding tests first.
- Do not commit, push, publish, deploy, delete learning data, or change production settings unless the user explicitly asks.
- After implementation, run the proportional checks described in `AGENTS.md` and update `docs/progress.md` and `docs/handoff.md` when their snapshot changes.
