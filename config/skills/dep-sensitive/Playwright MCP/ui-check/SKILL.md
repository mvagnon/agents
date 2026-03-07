---
name: ui-check
description: Verify a web app or SaaS UI via Playwright MCP — responsive behavior, spacing consistency, font/size coherence, navigation, forms, accessibility, console errors. Use when the user asks to check, audit, test, or review the interface.
---

# UI Check via Playwright MCP

Verify the interface of a running web app or SaaS by navigating views, inspecting the accessibility
tree, checking visual coherence (spacing, sizing, typography), responsive behavior, interactions,
and accessibility — all through the Playwright MCP tools.

## Prerequisites

The Playwright MCP server must be configured in Claude Code:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

Confirm the tools are available by running `/mcp` and checking for `playwright` entries.

## Available MCP Tools Reference

These are the Playwright MCP tools you will use. Prefer `browser_snapshot` over
`browser_take_screenshot` — snapshots return structured accessibility data that is
cheaper in tokens and more reliable for automated reasoning.

| Tool                       | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `browser_navigate`         | Go to a URL                                    |
| `browser_snapshot`         | Get the accessibility tree of the current page |
| `browser_take_screenshot`  | Capture a visual screenshot (use sparingly)    |
| `browser_click`            | Click an element by ref                        |
| `browser_type`             | Type text into an input by ref                 |
| `browser_hover`            | Hover over an element                          |
| `browser_select_option`    | Select a dropdown value                        |
| `browser_press_key`        | Press a keyboard key                           |
| `browser_wait_for`         | Wait for text or element to appear             |
| `browser_console_messages` | Read console errors/warnings                   |
| `browser_evaluate`         | Execute JS in the page context                 |

All element interactions use a `ref` attribute from the snapshot tree, not CSS selectors.

## Workflow

Follow these steps in order. Adapt based on the site type and user request.

### Step 1 — Gather context

Before opening the browser, determine:

1. **Target URL** — Ask the user if not provided. Default to `http://localhost:3000` for local dev.
2. **Scope** — Full app audit or specific views/components?
3. **Breakpoints** — Desktop (1440px), tablet (768px), mobile (375px). Test all three unless told otherwise.
4. **Design system** — Does the project use Tailwind, a component library, or custom tokens? This helps detect spacing/sizing inconsistencies.

### Step 2 — Navigate and take a baseline snapshot

```
browser_navigate → target URL
browser_snapshot → capture the accessibility tree
```

From the snapshot, evaluate:

- **Page structure**: Logical heading hierarchy (h1 → h2 → h3)?
- **Navigation**: Nav links present and labeled correctly?
- **Landmarks**: `main`, `nav`, `banner`, `contentinfo` landmarks present?
- **Interactive elements**: Buttons/links distinguishable? Inputs have labels?
- **Empty states**: Missing texts, broken refs, unnamed elements?

Then run visual coherence checks via `browser_evaluate`:

```js
// Extract computed styles of key elements for consistency analysis
JSON.stringify(
  [
    ...document.querySelectorAll(
      'h1,h2,h3,p,button,input,a,section,card,[class*="card"]',
    ),
  ]
    .slice(0, 50)
    .map((el) => {
      const s = getComputedStyle(el);
      return {
        tag: el.tagName,
        class: el.className?.toString().slice(0, 60),
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        marginTop: s.marginTop,
        marginBottom: s.marginBottom,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        paddingRight: s.paddingRight,
        width: s.width,
        maxWidth: s.maxWidth,
      };
    }),
);
```

From the results, flag:

- **Inconsistent font sizes**: e.g. h2 at 18px on one view but 24px on another
- **Spacing irregularities**: Sections with mismatched padding/margin values
- **Typography breaks**: Line heights that don't follow a consistent scale
- **Oversized or undersized elements**: Buttons/inputs with wildly different padding
- **Layout overflow**: Elements wider than viewport (check `maxWidth`, `width`)

### Step 3 — Check console for errors

```
browser_console_messages
```

Flag:

- Any `error` level messages (JS exceptions, failed fetches, 404s)
- Warnings related to accessibility, deprecations, or security (mixed content)

### Step 4 — Navigate through key pages

For each important route:

```
browser_click → nav link (by ref from snapshot)
browser_snapshot → capture and analyze
browser_console_messages → check for new errors
```

Build a list of visited pages and their status:

| View       | Loads OK | Heading structure | Console errors | Notes        |
| ---------- | -------- | ----------------- | -------------- | ------------ |
| /dashboard | ✅       | h1 present        | 0              |              |
| /settings  | ✅       | missing h1        | 1 (404 image)  | Broken asset |
| /billing   | ✅       | h1 present        | 0              |              |

### Step 5 — Test interactive elements

For each form or interactive component found:

1. **Forms**: Click into each input (`browser_click`), type test data (`browser_type`),
   submit the form (`browser_click` on submit button), and check the result
   (`browser_snapshot` + `browser_console_messages`).
2. **Modals/Dialogs**: Trigger open, verify content in snapshot, close.
3. **Dropdowns/Selects**: Use `browser_select_option`, verify the selection took effect.
4. **Navigation menus**: Open hamburger/mobile menus if present, verify links.

Do NOT submit forms that trigger real side effects (payments, emails) unless the user
explicitly confirms it is a test/staging environment.

### Step 6 — Responsive check

Test all three breakpoints: desktop (1440px), tablet (768px), mobile (375px).

Use `browser_evaluate` to resize the viewport and re-check:

```js
// Resize viewport to mobile
document.documentElement.style.setProperty("--test-vw", "375px");
window.resizeTo(375, 812);
```

For each breakpoint:

1. `browser_evaluate` → set viewport width
2. `browser_snapshot` → capture the tree at this width
3. `browser_evaluate` → run the visual coherence script (same as Step 2)
4. `browser_console_messages` → check for new errors

Flag:

- **Overflow**: Horizontal scroll appearing, elements breaking out of viewport
- **Stacking issues**: Elements that should stack vertically on mobile but don't
- **Touch targets**: Buttons/links smaller than 44×44px on mobile
- **Hidden elements**: Content that disappears but shouldn't (or vice-versa)
- **Font scaling**: Text too small to read on mobile (< 14px)
- **Spacing compression**: Padding/margins that don't scale down proportionally

### Step 7 — Produce the report

Summarize findings in a structured markdown report:

```markdown
# UI Verification Report — [App Name]

**URL**: https://app.example.com
**Date**: YYYY-MM-DD
**Scope**: Full app / Specific views

## Summary

- Views checked: N
- Console errors found: N
- Visual coherence issues: N
- Accessibility issues: N
- Responsive issues: N

## Page-by-Page Results

### / (Dashboard)

- Structure: ✅ Logical heading hierarchy
- Console: ✅ No errors
- Interactions: ✅ Nav links functional
- Notes: —

### /settings

- Structure: ⚠️ Missing h1
- Console: ❌ 1 error (404 on /images/avatar.jpg)
- Notes: Broken image asset

## Visual Coherence

- Font sizes used: 14px, 16px, 18px, 24px, 32px (✅ consistent scale)
- Spacing tokens: mostly 8/16/24/32px (⚠️ one section uses 13px margin — likely a bug)
- Button padding: ✅ consistent across views
- Card sizes: ⚠️ /pricing cards have different heights

## Responsive Behavior

| Breakpoint   | Overflow    | Stacking | Touch targets | Font size |
| ------------ | ----------- | -------- | ------------- | --------- |
| Desktop 1440 | ✅          | ✅       | ✅            | ✅        |
| Tablet 768   | ✅          | ✅       | ⚠️ small CTA  | ✅        |
| Mobile 375   | ❌ h-scroll | ✅       | ⚠️ small CTA  | ✅        |

## Accessibility Observations

- [Missing labels, unnamed buttons, empty links, etc.]

## Recommendations

1. Fix horizontal overflow on mobile (likely a container missing `overflow-x: hidden`)
2. Normalize the 13px margin to 12px or 16px to match spacing scale
3. Increase CTA button size on tablet/mobile to meet 44px touch target
4. Add h1 to /settings page
```

Save the report to `ui-check-report.md` in the project root (or wherever the user prefers).

## Important Conventions

- **Prefer `browser_snapshot` over `browser_take_screenshot`**. Screenshots cost more tokens
  and provide less structured data. Use screenshots only when the user explicitly asks for
  visual proof or when investigating a layout issue that the accessibility tree cannot surface.
- **Always read `ref` from the latest snapshot** before clicking or typing. Refs can change
  between navigations. Never reuse a ref from a previous snapshot.
- **One action at a time**. Take a snapshot → act → take a new snapshot. Do not chain multiple
  clicks without verifying intermediate state.
- **Report, don't fix**. The purpose of this skill is verification and reporting. Do not modify
  source code unless the user explicitly asks to fix issues.
- **Be explicit about limitations**. The accessibility tree does not capture CSS visual bugs
  (e.g. overlapping elements, wrong colors, broken animations). Note this in the report if
  relevant.
