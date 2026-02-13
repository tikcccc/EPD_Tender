# Coding Doc Map

Use this map to choose which `coding-doc/*.md` files to load based on the user request.

## Core Files
- `coding-doc/coding-architect.md`: architecture, stack, folder layout, module responsibilities.
- `coding-doc/coding-rules.md`: coding standards, naming, linting, quality gates.
- `coding-doc/coding-plan.md`: milestones, scope, schedule, dependencies.
- `coding-doc/api-spec.md`: endpoint definitions, request/response schema, API governance.
- `coding-doc/data-contract.md`: report JSON, standard schema, evidence anchor schema.
- `coding-doc/acceptance-criteria.md`: requirement-to-testable acceptance mapping.
- `coding-doc/test-strategy.md`: frontend/backend/evidence testing strategy.

## Intent to File Routing
- If asked about architecture or tech stack:
  - Load `coding-doc/coding-architect.md`
  - Load `coding-doc/coding-plan.md` if timeline/scope is also asked.

- If asked about implementation rules or review baseline:
  - Load `coding-doc/coding-rules.md`

- If asked about API design, backend endpoints, response shape:
  - Load `coding-doc/api-spec.md`
  - Load `coding-doc/data-contract.md` for payload details.

- If asked about data fields, required keys, JSON compatibility:
  - Load `coding-doc/data-contract.md`
  - Load `coding-doc/api-spec.md` if API transport is involved.

- If asked about done criteria, UAT, requirement coverage:
  - Load `coding-doc/acceptance-criteria.md`

- If asked about test approach, regression, evidence metrics:
  - Load `coding-doc/test-strategy.md`

- If user asks broad questions like "how should we do this project":
  - Start with:
    - `coding-doc/coding-architect.md`
    - `coding-doc/coding-plan.md`
    - `coding-doc/api-spec.md`
    - `coding-doc/data-contract.md`
  - Then load additional files only if needed.

## Fallback
- If `coding-doc/` is missing or files are incomplete, report exactly what is missing.
- If files conflict, cite both files and ask for a single source of truth decision.
