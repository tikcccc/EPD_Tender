---
name: doc-sync-governor
description: Validate and repair consistency across project docs in `coding-doc/`, including architecture, rules, plan, API spec, data contracts, acceptance criteria, and test strategy. Use after requirement changes, API/schema updates, or before implementation/release to prevent doc drift.
---

# Doc Sync Governor

Use this skill to detect and fix document drift before coding and release.

## Workflow

1. Confirm `coding-doc/` exists.
2. Run the sync checker:
   - `python3 skills/doc-sync-governor/scripts/check_doc_sync.py coding-doc --json coding-doc/.doc-sync-report.json`
3. Review issues by severity:
   - `error`: fix immediately
   - `warn`: either fix now or document rationale
4. Apply patches to affected docs.
5. Re-run checker until no `error` remains.
6. Summarize:
   - what drift was found
   - what was fixed
   - what was deferred

## What to Check First

- API and schema alignment:
  - `coding-doc/api-spec.md`
  - `coding-doc/data-contract.md`
- Requirement and test alignment:
  - `coding-doc/acceptance-criteria.md`
  - `coding-doc/test-strategy.md`
- Architecture/plan/rules alignment:
  - `coding-doc/coding-architect.md`
  - `coding-doc/coding-plan.md`
  - `coding-doc/coding-rules.md`

## Fix Policy

- Keep one source of truth per concern:
  - API behavior in `api-spec.md`
  - Data fields in `data-contract.md`
  - Done criteria in `acceptance-criteria.md`
  - Test coverage strategy in `test-strategy.md`
- If two files conflict, update both or state explicit precedence in both files.

## Resources

- `scripts/check_doc_sync.py`: Automated baseline consistency checks.
- `references/sync-rules.md`: Manual rules for resolving cross-doc drift.
