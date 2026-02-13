# Skill Index

Use this file as the single routing entrypoint.
When user includes `@skills/skill-index.md`, choose the best matching skill below.

## Skill Router

1. Need to answer from project docs in `coding-doc/` without manually `@` each file:
- Use `$coding-doc-indexer`
- Output: focused answer with file-backed references.

2. Need to check and fix drift across architecture/API/contract/acceptance/test docs:
- Use `$doc-sync-governor`
- Output: consistency report + sync patches.

3. Need frontend UI design/implementation aligned with `reference/code.html` style baseline (not strict clone), with reusable CSS structure:
- Use `$frontend-ui-prototype`
- Output: consistent UI implementation + shared CSS architecture.

4. Need to convert `coding-doc` into executable implementation tasks and PR checklist:
- Use `$tender-implementation-runner`
- Output: `coding-doc/implementation-tasks.md` and `coding-doc/pr-checklist.md`.

## Routing Keywords

- `style`, `UI`, `layout`, `component`, `css`, `prototype` -> `$frontend-ui-prototype`
- `task list`, `sprint`, `plan to execution`, `checklist` -> `$tender-implementation-runner`
- `api contract`, `schema`, `acceptance`, `test strategy`, `docs answer` -> `$coding-doc-indexer`
- `doc sync`, `inconsistency`, `drift`, `cross-doc` -> `$doc-sync-governor`

## Combined Workflows

1. Build feature from docs:
- `$coding-doc-indexer` -> `$tender-implementation-runner` -> `$frontend-ui-prototype`

2. Stabilize before merge:
- `$doc-sync-governor` -> `$tender-implementation-runner`

## Quick Invocation Examples

- "Use skill index to answer this API question from docs."
- "Use skill index to generate frontend skeleton for a new tender page."
- "Use skill index to update task plan and PR checklist after requirement changes."
