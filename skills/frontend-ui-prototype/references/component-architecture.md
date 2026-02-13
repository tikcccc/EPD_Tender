# Component Architecture (React/Next.js)

Use this structure for multi-page reuse while keeping style consistent.

## 1. Suggested Folders

```text
src/
  app/
    tender/
      page.tsx
  components/
    layout/
      TenderAppShell.tsx
    report/
      ComplianceCard.tsx
    pdf/
      PdfWorkspace.tsx
    toolbar/
      WorkspaceToolbar.tsx
  features/
    tender-ui/
      types.ts
  styles/
    tender-ui/
      index.css
      tokens.css
      base.css
      layout.css
      components.css
      utilities.css
```

## 2. Responsibilities
- `TenderAppShell.tsx`
  - layout container (left workflow + right workspace)
  - panel slots and header regions
- `ComplianceCard.tsx`
  - render status/severity/confidence
  - render summary and tags
- `WorkspaceToolbar.tsx`
  - search/zoom action buttons
  - page/file context controls
- `PdfWorkspace.tsx`
  - page container and highlight placeholders
  - viewer integration seam
- `features/tender-ui/types.ts`
  - shared interfaces across components

## 3. Reuse Rule
- New pages should reuse shell + tokens + shared components.
- Page-specific behavior should live in feature folders, not shared layout files.
