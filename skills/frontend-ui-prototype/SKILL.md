---
name: frontend-ui-prototype
description: Build and extend frontend UI using `reference/code.html` as style reference (not strict clone), with reusable CSS architecture for multi-page product consistency. Use when users ask for UI implementation, restyling, new page design, component consistency, or setup of shared CSS structure so style rules do not need to be re-explained each time.
---

# Frontend Ui Prototype

Use this skill to keep UI style consistent across current and future pages without repeating style instructions.

## Workflow

1. Read `reference/code.html` as visual language reference only.
2. Load:
   - `references/style-system.md`
   - `references/css-architecture.md`
3. Apply style direction to requested page/function:
   - keep shared shell, spacing, tokens, badges, and card semantics
   - adapt layout for page-specific features instead of cloning one screen
4. If project lacks global CSS structure, generate it:
   - `python3 skills/frontend-ui-prototype/scripts/scaffold_tender_ui_css.py --out styles/tender-ui`
   - or generate full React/Next skeleton + CSS:
   - `python3 skills/frontend-ui-prototype/scripts/scaffold_next_tender_ui.py --src-root frontend/src --with-css`
5. Wire page styles to shared files first, then add local feature styles only when necessary.
6. Validate responsive behavior for desktop and mobile.

## Implementation Rules

- Do not copy `reference/code.html` one-to-one.
- Reuse design tokens and component semantics to keep visual consistency.
- Keep dark mode variable-driven.
- Keep common styles in `styles/tender-ui/*`, not duplicated in page files.
- For React/Next.js:
  - import `styles/tender-ui/index.css` once at app root
  - keep page-specific overrides in local module css.

## Resources

- `references/style-system.md`: Style tokens and component language extracted from the prototype.
- `references/css-architecture.md`: Planned CSS file structure and layering rules.
- `references/component-architecture.md`: Recommended React/Next.js component/folder structure.
- `scripts/scaffold_tender_ui_css.py`: Generate baseline `styles/tender-ui/*.css` files.
- `scripts/scaffold_next_tender_ui.py`: Generate UI component skeleton (app shell, cards, toolbar, pdf workspace).
