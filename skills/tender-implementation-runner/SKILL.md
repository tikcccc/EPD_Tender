---
name: tender-implementation-runner
description: Convert `coding-doc` project documentation into executable implementation tasks and a pull-request checklist. Use when planning sprint work, starting feature implementation, validating readiness, or translating architecture/API/acceptance docs into trackable engineering actions.
---

# Tender Implementation Runner

Use this skill to generate ready-to-execute engineering checklists from planning docs.

## Workflow

1. Confirm `coding-doc/` exists and contains:
   - `coding-plan.md`
   - `acceptance-criteria.md`
2. Read `references/task-pipeline.md`.
3. Generate artifacts:
   - `python3 skills/tender-implementation-runner/scripts/generate_tender_tasks.py --doc-dir coding-doc --task-out coding-doc/implementation-tasks.md --pr-out coding-doc/pr-checklist.md`
4. Review output for:
   - milestone coverage
   - AC coverage
   - integration/hardening tasks
5. If any critical doc is missing, stop and report blockers explicitly.
6. If requested, refine tasks by team scope:
   - frontend-only
   - backend-only
   - full-stack

## Output Requirements

- `implementation-tasks.md` must include:
  - milestone checklist
  - AC-derived executable tasks
  - verification notes
- `pr-checklist.md` must include:
  - API/data-contract sync checks
  - test updates
  - doc consistency checks

## Resources

- `references/task-pipeline.md`: mapping from docs to execution outputs.
- `scripts/generate_tender_tasks.py`: task list and PR checklist generator.
