# UI Style System (From `reference/code.html`)

Treat `reference/code.html` as style baseline, not strict template duplication.

## 1. Visual Direction
- Product tone: legal/compliance, clean, high-contrast, low-noise.
- Layout pattern: split app shell
  - left: workflow cards / controls
  - right: document workspace
- Use restrained color accents for status and actions.

## 2. Design Tokens
- Primary: `#2563EB`
- Background light: `#F9FAFB`
- Background dark: `#0B1120`
- Surface light: `#FFFFFF`
- Surface dark: `#1F2937`
- Border light: `#E5E7EB`
- Border dark: `#374151`

Status tokens:
- danger/major: red scale (`bg-red-100`, `text-red-600`)
- success/consistent: green scale (`bg-green-100`, `text-green-600`)
- evidence highlight: yellow with border (`bg-yellow-300/30`, `border-yellow-400`)

Typography:
- UI font: Inter-like sans for app chrome
- Document font: serif for PDF-like content area

Radius:
- base: `8px`
- medium: `12px`
- large: `16px`

## 3. Component Pattern

Card pattern:
- left border encodes semantic status
- top row includes category + severity/confidence badge
- body text with compact leading
- metadata chips below content
- footer with stable ID

Toolbar pattern:
- icon buttons with subtle hover background
- spacing stays compact and consistent

PDF workspace pattern:
- top document bar
- centered paper canvas with shadow
- independent scroll behavior
- text selection preserved

## 4. Responsiveness
- Desktop: two-column shell
- Mobile: collapse to single column and defer PDF panel to second view or modal
- Avoid desktop-only fixed widths without mobile fallback

## 5. Reuse Rule
- Preserve token palette and interaction language.
- Do not copy raw HTML structure blindly.
- For new pages, keep shared shell/spacing/status chips consistent while allowing page-specific layouts.
