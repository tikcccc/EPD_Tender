# CSS Architecture

Use modular CSS with explicit layers to avoid style drift across pages.

## 1. Folder Structure

```text
styles/
  tender-ui/
    tokens.css
    base.css
    layout.css
    components.css
    utilities.css
    index.css
```

## 2. File Responsibilities
- `tokens.css`
  - color, spacing, radius, elevation, z-index, typography tokens
  - light/dark variables
- `base.css`
  - reset, html/body defaults, scrollbars, focus ring baseline
- `layout.css`
  - app shell, side panel, workspace panel, responsive breakpoints
- `components.css`
  - cards, badges, chips, toolbars, buttons, input rows, PDF canvas container
- `utilities.css`
  - concise one-purpose helpers (`.u-truncate`, `.u-muted`, `.u-mono`)
- `index.css`
  - only imports in deterministic order

## 3. Layering and Naming
- Prefer component classes over long utility-only chains for shared UI.
- Naming:
  - layout: `.l-shell`, `.l-sidebar`, `.l-workspace`
  - component: `.c-card`, `.c-badge`, `.c-chip`, `.c-toolbar`
  - utility: `.u-*`
- State class:
  - `.is-major`, `.is-consistent`, `.is-active`

## 4. Order Rule
Import order in `index.css`:
1. `tokens.css`
2. `base.css`
3. `layout.css`
4. `components.css`
5. `utilities.css`

## 5. Dark Mode Rule
- Use attribute or class switch (`[data-theme="dark"]` or `.dark`) at root.
- Define all theme-sensitive values as variables in `tokens.css`.
- Component files must consume vars, not hard-coded dark colors.

## 6. Scope Rule
- Never put page-specific hacks into global files.
- For one-off page styles, create local module css in feature folder.
- Keep reusable shell/card patterns in `styles/tender-ui/components.css`.
