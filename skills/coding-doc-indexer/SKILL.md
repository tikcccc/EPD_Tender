---
name: coding-doc-indexer
description: Locate, route, and load the right project documentation from `coding-doc/` without manual `@file` references. Use when users ask questions grounded in project docs, including architecture, coding rules, API behavior, data contracts, acceptance criteria, test strategy, implementation plans, or cross-document clarification.
---

# Coding Doc Indexer

Use this skill to turn high-level doc-based questions into targeted file reads.

## Workflow

1. Confirm `coding-doc/` exists in the current project root.
2. Build or refresh the file index:
   - `python3 skills/coding-doc-indexer/scripts/index_coding_docs.py coding-doc --output coding-doc/.doc-index.json`
3. Read `references/doc-map.md` and map the request intent to files.
4. Load only the mapped files first; do not bulk-read all docs unless the request is broad.
5. If user request is broad or ambiguous, start from this minimum set:
   - `coding-doc/coding-architect.md`
   - `coding-doc/coding-plan.md`
   - `coding-doc/api-spec.md`
   - `coding-doc/data-contract.md`
6. Answer with file-backed conclusions and cite concrete paths (and line refs when useful).
7. If docs conflict, explicitly report the conflict and ask which file is source of truth.

## File Routing Rules

- Use `references/doc-map.md` for routing by intent.
- If asked for API + payload semantics, always load both:
  - `coding-doc/api-spec.md`
  - `coding-doc/data-contract.md`
- If asked for quality readiness, always load both:
  - `coding-doc/acceptance-criteria.md`
  - `coding-doc/test-strategy.md`

## Output Rules

- Prefer concise synthesized answers; avoid dumping full doc content.
- Quote only short snippets when necessary.
- Include a clear "what to do next" when the request is implementation-facing.

## Resources

- `scripts/index_coding_docs.py`: Build a heading index for all markdown files in `coding-doc/`.
- `references/doc-map.md`: Map user intent to the correct files.
