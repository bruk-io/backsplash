# Backsplash — Tile Map Editor

Browser-based tile map editor with auto-detection of tile size, built on Lit 3 web components.

## Architecture

C4 architecture diagrams live in `docs/architecture/` using [LikeC4](https://likec4.dev) DSL:
- `specification.c4` — Element kinds, relationship kinds, tags
- `model.c4` — System context, containers, components, all relationships
- `views.c4` — Static views (context, container, component) and dynamic views (user flows)

Serve diagrams locally: `npm run arch`

### Before starting any work

1. **Read the C4 model** — Review `model.c4` to understand where your changes fit in the component architecture. Know which components you're touching and their relationships.
2. **Read relevant dynamic views** — Check `views.c4` for any dynamic views that describe the flow you're implementing. These are the spec for how components interact.
3. **Read the GitHub issue** — Understand acceptance criteria before writing code. If the issue is vague, clarify it first.

### Keeping C4 current

Update the architecture docs when:
- Adding a new component — add it to `model.c4` with relationships
- Changing how components interact — update relationship arrows in `model.c4`
- Implementing a new user flow — add or update a dynamic view in `views.c4`
- Renaming or removing a component — update all references

Do NOT update C4 for internal implementation details (private methods, local state). C4 captures the architectural level — components and their contracts.

### Demoability

Every piece of work should produce something visible. Before considering a task done:
- Can you see the change in the browser (`npm run dev`)?
- If it's a data model or non-visual change, is there at least a console log, status bar update, or UI state change that proves it works?
- Would a non-technical person understand what changed if you showed them the screen?

Prefer vertical slices (thin feature end-to-end) over horizontal layers (all models, then all UI).

## Tech Stack

- **Lit 3** web components with TypeScript (strict mode)
- **Vite** for dev server and builds
- **@bruk-io/bh-01** — Shared component library (local dependency at `../bh-01`)

## bh-01 Component Library (CRITICAL)

bh-01 is a Lit 3 web component library at `../bh-01` using atomic design. **Backsplash MUST use bh-01 components wherever they exist.** Do NOT hand-roll UI that bh-01 already provides.

### Before writing any UI code

1. **Check bh-01 first** — Browse `../bh-01/src/` for existing components. If a bh-01 component does what you need, use it.
2. **Check the stories** — `../bh-01/src/demos/vscode/` shows a full app-shell composition pattern. `*.stories.ts` files show component usage.
3. **Only build custom components** for domain-specific UI (tile canvas, tileset grid renderer, detection preview). Generic UI (buttons, panels, trees, tabs, layout) comes from bh-01.

### Available components

| Category | Components |
|---|---|
| **Shell** | `bh-app-shell`, `bh-activity-bar`, `bh-activity-item`, `bh-sidebar-panel`, `bh-status-bar` |
| **Molecules** | `bh-toolbar` (start/center/end slots), `bh-panel-header`, `bh-section-header`, `bh-accordion`/`bh-accordion-item`, `bh-card` |
| **Atoms** | `bh-button`, `bh-icon`, `bh-text`, `bh-divider`, `bh-switch`, `bh-slider`, `bh-input`, `bh-badge`, `bh-checkbox`, `bh-select` |
| **Layout** | `bh-stack`, `bh-cluster`, `bh-repel`, `bh-center`, `bh-grid`, `bh-split`, `bh-reel`, `bh-cover`, `bh-switcher` |
| **Organisms** | `bh-tree`/`bh-tree-item`, `bh-tabs`/`bh-tab-bar`/`bh-tab`/`bh-tab-panel`, `bh-data-table`, `bh-command-palette`, `bh-context-menu` |

### Component conventions

- All backsplash components extend `BaseElement` from bh-01 — **never `LitElement` directly**
- Styles: `static override styles = [...([BaseElement.styles].flat()), css\`...\`]`
- Custom icons: `BhIcon.register('name', '<svg-path-data>')` — registered in `bs-editor-shell.ts`
- Use semantic tokens (`--bh-color-surface`, `--bh-color-text`, `--bh-color-border`, etc.) — never primitive tokens directly
- Properties down, events up (`CustomEvent` with `bubbles: true`, `composed: true`)
- Use `bh-text` for text content, not raw `<span>` or `<p>`
- Use layout components (`bh-stack`, `bh-cluster`, `bh-center`, `bh-repel`) instead of custom flex/grid CSS
- Use `bh-tree` for any list with selection — not custom `<div>` lists
- Use `bh-tabs` for switching between views — not custom tab logic

### Token system

bh-01 has a three-layer token architecture:
1. **Primitive tokens** (`--bh-color-mandarin`, `--bh-spacing-4`) — raw values, never use directly in components
2. **Semantic tokens** (`--bh-color-surface`, `--bh-color-text`, `--bh-color-border`) — theme-aware, always use these
3. **Component tokens** (`--bh-button-bg`, `--bh-toolbar-bg`) — per-component overrides

Dark theme is activated via `data-theme="dark"` on `<html>` (set in `index.html`).

## Project Structure

```
src/
  components/     # Lit web components (bs-* prefix)
  models/         # Pure TypeScript data models and utilities
  styles/         # Global CSS (reset, editor overrides)
  main.ts         # Entry point — component registration
docs/
  architecture/   # LikeC4 C4 diagrams
```

## Scripts

- `npm run dev` — Start dev server (http://localhost:5173)
- `npm run build` — Type-check then build (`tsc --noEmit && vite build`)
- `npm run lint` — Type-check only
- `npm test` — Run node unit tests (models, viewport math)
- `npm run test:browser` — Run browser interaction tests (components)
- `npm run arch` — Serve C4 architecture diagrams

## Testing

Two test layers, each with its own vitest config:

### Node unit tests (`npm test`)

- **Config:** `vitest.config.ts`
- **Pattern:** `src/**/*.test.ts` (excludes `*.browser.test.ts`)
- **What they cover:** Pure TypeScript models and utility functions — no DOM, no browser APIs
- **Design principle:** Extract complex logic (coordinate math, data transformations, algorithms) into pure functions in `src/models/`. Unit test those functions directly. This covers the hardest-to-debug logic without needing a browser.

Example: viewport culling range calculation, screen↔tile coordinate conversion, and zoom-centered-on-cursor math live in `src/models/viewport.ts` — not buried in the canvas component.

### Browser interaction tests (`npm run test:browser`)

- **Config:** `vitest.browser.config.ts`
- **Pattern:** `src/**/*.browser.test.ts`
- **Provider:** Playwright (chromium)
- **What they cover:** Component event contracts, pointer interactions, DOM state changes — things that require a real browser and real DOM
- **Design principle:** Test that components emit the right events, respond to pointer/keyboard input, and update DOM correctly. Don't test rendering pixels — that's what top-hat screenshots are for.

### What goes where

| Logic type | Where it lives | Test type |
|---|---|---|
| Coordinate math, algorithms, data transforms | `src/models/*.ts` (pure functions) | Node unit test (`*.test.ts`) |
| Component event emission, pointer handling | `src/components/*.ts` | Browser test (`*.browser.test.ts`) |
| Visual correctness (does it look right?) | N/A | Top-hat screenshots in PR |

### Writing testable components

1. **Extract the math** — If a component has non-trivial logic (viewport culling, flood fill, coordinate conversion), pull it into a pure function in `src/models/`. Unit test the function. The component becomes a thin wrapper.
2. **Test contracts, not pixels** — Browser tests verify event emission and DOM state, not canvas pixel colors.
3. **Keep browser tests fast** — Create minimal test fixtures (small tilemaps, simple tilesets). Avoid full app bootstrapping.

## Pull Requests (CRITICAL)

Every PR must be top-hatted — visually verified with screenshots before merge.

### Top-hat workflow

1. **Start the dev server** — `npm run dev`
2. **Open in Playwright** — Navigate to `http://localhost:5173` using `browser_navigate`
3. **Resize viewport** — `browser_resize` to 1280x720 for consistent screenshots
4. **Take screenshots** — Use `browser_take_screenshot` for each significant UI state:
   - Default view after changes
   - Any new panels, dialogs, or flows
   - Before/after if modifying existing UI
   - Interactive states (click activity items to show different panels, etc.)
5. **Save screenshots** — Save to `.github/screenshots/{branch-name}/` with descriptive names (e.g., `.github/screenshots/m0-project-bootstrap/editor-shell.png`). Use the branch name with `/` replaced by `-`.
6. **Commit and push** — Screenshots are committed to the PR branch
7. **Comment on PR** — Use `gh pr comment` with image references using raw GitHub URLs:
   ```
   ![Description](https://raw.githubusercontent.com/bruk-io/backsplash/{COMMIT_SHA}/.github/screenshots/filename.png)
   ```
   Use the **commit SHA** (not branch name) so image links never break if the branch moves.

### Screenshot reference format

```bash
# Derive screenshot dir from branch name
BRANCH_DIR=$(git branch --show-current | tr '/' '-')
COMMIT_SHA=$(git rev-parse HEAD)

# Save screenshots to branch-specific dir
mkdir -p .github/screenshots/${BRANCH_DIR}
# Playwright saves to: .github/screenshots/${BRANCH_DIR}/feature-name.png

# Reference in PR comment
gh pr comment {PR_NUMBER} --repo bruk-io/backsplash --body "$(cat <<EOF
## Top-hat: {Feature Name}

![Description](https://raw.githubusercontent.com/bruk-io/backsplash/${COMMIT_SHA}/.github/screenshots/${BRANCH_DIR}/filename.png)

**Verified:**
- [ ] Checklist of what was visually confirmed
EOF
)"
```

### What to screenshot

- **New features** — Show the feature working in context
- **Layout changes** — Full viewport showing the overall editor
- **Panel content** — Activity bar toggled to show the relevant panel
- **Error/empty states** — "No map loaded", "No tilesets", etc.
- **Before/after** — When modifying existing UI, show both states

### PR body format

PRs must include:
- Summary of changes (bullet points)
- `Closes #N` for each issue resolved
- Test plan with checkboxes
- Screenshots section with top-hat images

## GitHub

- Repository: `bruk-io/backsplash` (public)
- Issues track all work, organized by milestones (M0, M1, M2, ...)
- Branch naming: `m{N}/{short-description}` (e.g., `m0/project-bootstrap`)
