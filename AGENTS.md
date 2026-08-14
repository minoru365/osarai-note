# Repository guidance

Before changing this project, read these files in order:

1. `docs/handoff.md` — current snapshot, next task, and resume procedure
2. `docs/progress.md` — completed work, remaining work, and latest verification
3. `docs/study-support-plan.md` — product requirements and roadmap
4. `docs/adr/README.md` and relevant ADRs — decisions that must be preserved

## Working rules

- Preserve user changes in the working tree. Never discard or overwrite unrelated edits.
- Do not edit generated files directly: `public/content/kanji-v2.json`, `src/generated/kanjiCharacterData.ts`, `docs/generated/*.md`, `content-review/*.md`, and `dist/`.
- Treat `content-source/kanji-materials.json` and `content-review/*.json` as the kanji content sources of truth.
- Preserve IndexedDB name `study-support`, existing question IDs, `pairId` values, learning history, and learned/unlearned settings.
- Only `approved` materials may enter the published question pack. Keep excluded material as `needs-fix` with a reason unless physical deletion is explicitly required.
- For 3rd-grade questions, visible kanji must be from grades 1–3; for 4th-grade questions, grades 1–4. Human review is required for every generated example.
- After content changes, run `npm run content:generate`, `npm test`, and `npm run build`.
- After behavior changes, update `docs/progress.md`; after workflow or snapshot changes, also update `docs/handoff.md`.
- Do not commit, push, publish GitHub Pages, deploy, delete local learning data, or change production settings unless the user explicitly requests it.
