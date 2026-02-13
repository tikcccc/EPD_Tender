# Doc Sync Rules

Use these rules to keep `coding-doc/` documents aligned after requirement or API changes.

## Required Files
- `coding-doc/coding-architect.md`
- `coding-doc/coding-rules.md`
- `coding-doc/coding-plan.md`
- `coding-doc/api-spec.md`
- `coding-doc/data-contract.md`
- `coding-doc/acceptance-criteria.md`
- `coding-doc/test-strategy.md`

## Cross-Document Consistency Rules

1. API and contract consistency:
- If `coding-doc/api-spec.md` defines endpoint payload fields, `coding-doc/data-contract.md` must define those fields or related schema entities.
- If `coding-doc/data-contract.md` introduces a new required field, API request/response examples must include it where relevant.

2. Requirement and test consistency:
- `coding-doc/acceptance-criteria.md` must cover all requirement groups from `reference/task.md`.
- `coding-doc/test-strategy.md` must include test approach for each acceptance group.

3. Plan and architecture consistency:
- `coding-doc/coding-plan.md` milestones must be implementable with the stack in `coding-doc/coding-architect.md`.
- If architecture changes framework/runtime, plan and rules must be updated in the same change.

4. Rules and implementation consistency:
- `coding-doc/coding-rules.md` must reference current API versioning and current testing gates.

## Update Policy
- When one core file changes, run doc sync check immediately.
- Fix high-severity drift in the same PR/commit.
- Do not postpone schema and API doc sync.
