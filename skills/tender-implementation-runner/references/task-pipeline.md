# Task Pipeline (coding-doc -> execution)

Convert planning docs into execution artifacts with this mapping:

## Source Mapping
- `coding-doc/coding-plan.md` -> milestone phases and delivery sequence
- `coding-doc/acceptance-criteria.md` -> feature-level executable tasks and done criteria
- `coding-doc/test-strategy.md` -> testing tasks and gates
- `coding-doc/api-spec.md` + `coding-doc/data-contract.md` -> backend/frontend integration tasks
- `coding-doc/coding-rules.md` -> PR checklist quality constraints

## Output Artifacts
- `coding-doc/implementation-tasks.md`
  - phased checklist
  - task owner placeholder
  - dependencies and risk notes
- `coding-doc/pr-checklist.md`
  - contract sync checks
  - test evidence checks
  - docs updated checks

## Priority Rule
1. Blockers first:
- missing schema fields
- missing endpoint contract
- undefined acceptance criteria

2. Build order:
- data contract + API skeleton
- core frontend flows
- evidence navigation
- export/reporting
- hardening + tests

3. PR checklist must enforce:
- docs in sync
- tests added/updated
- acceptance criteria coverage
