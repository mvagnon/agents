---
name: browser-check
description: Verify that a frontend feature implementation is correct by inspecting it in a real browser via Chrome DevTools MCP. Checks visual design, console errors, and functional correctness — then iterates fixes until everything passes.
user-invocable: true
---

# Feature Verification

Verify frontend feature implementations in a real Chrome browser using the `chrome-devtools-mcp` MCP server. The goal is to catch visual issues, runtime errors, and functional bugs — then fix them iteratively until the result is correct.

## Verification Loop

Run this loop after every feature implementation or code change. Iterate until all three checks pass.

### Step 1 — Navigate to the target

Use `navigate_page` to open the page/route where the feature lives. If the dev server is running locally, navigate to the local URL (e.g. `http://localhost:3000/some-route`). Wait for the page to be ready using `wait_for` with the expected text or element.

### Step 2 — Take a snapshot and a screenshot

1. Call `take_snapshot` to get the accessibility tree. This is the primary inspection tool — it reveals the page structure, text content, ARIA roles, and interactive elements with unique IDs.
2. Call `take_screenshot` to capture a visual render. Use it to assess layout, spacing, colors, and overall design quality.

Prefer the snapshot for structural/content checks. Use the screenshot for visual/design judgment.

### Step 3 — Check for console errors

Call `list_console_messages` to retrieve all console output since last navigation. Inspect every entry:

- **errors** and **warnings** are failures unless they are known/expected (e.g. React dev-mode warnings, third-party script noise).
- **failed network requests** visible in console (4xx, 5xx, CORS) count as failures.

If there are errors, read individual messages with `get_console_message` for full stack traces.

### Step 4 — Validate functional correctness

Compare what you observe (snapshot + screenshot) against the expected behavior. The expected behavior comes from:

- The user's description of what the feature should do.
- The ticket/spec if provided.
- Common sense defaults (buttons should be clickable, forms should have labels, links should navigate, lists should render items).

If the feature involves interactions (click, form fill, navigation), use the input automation tools to simulate them:

- `click` — click buttons, links, toggles
- `fill` — type into inputs
- `fill_form` — fill multiple fields at once
- `press_key` — keyboard shortcuts, Enter to submit
- `hover` — tooltips, dropdowns

After each interaction, take a new snapshot/screenshot and re-check console errors.

### Step 5 — Decide: pass or fix

**PASS** — All three checks are clean:

1. Visual design matches expectations (layout, spacing, content, responsiveness)
2. Zero unexpected console errors or warnings
3. Feature behaves as specified

Report the result to the user with a short summary.

**FIX** — One or more checks failed:

1. Identify the root cause from the snapshot, screenshot, console errors, or interaction results.
2. Fix the code.
3. Go back to Step 1 and re-verify.

Repeat until the feature passes. Do not stop after a partial fix — always re-run the full verification loop.

## Design Quality Checklist

When assessing visual design from the screenshot, check for:

- Text is readable and properly sized
- Spacing and alignment are consistent (no overlapping, no unexpected gaps)
- Colors and contrast look intentional (not broken themes or missing styles)
- Interactive elements are visually distinguishable (buttons look like buttons)
- Responsive layout is correct if multiple viewports are relevant (use `resize_page` or `emulate` to test)
- No broken images, missing icons, or layout shifts

## Multi-Viewport Verification

When the feature should work across screen sizes, verify at least two breakpoints:

1. Desktop: use `resize_page` with `1280x800` or similar
2. Mobile: use `emulate` with a mobile device preset, or `resize_page` with `375x812`

Run the full verification loop at each viewport.

## Interaction Testing Patterns

**Form submission:**

1. `fill_form` with test data
2. `click` the submit button (or `press_key` Enter)
3. `wait_for` the success message or redirect
4. `take_snapshot` to verify the result

**Navigation flow:**

1. `click` a link or nav item
2. `wait_for` the new page content
3. `take_snapshot` + `take_screenshot` to verify

**Toggle/modal:**

1. `click` the trigger
2. `take_snapshot` to verify the component appeared
3. `click` close or click outside
4. `take_snapshot` to verify it dismissed

## Tool Reference (Quick)

| Category | Tools                                                                       |
| -------- | --------------------------------------------------------------------------- |
| Navigate | `navigate_page`, `wait_for`, `new_page`, `list_pages`, `select_page`        |
| Inspect  | `take_snapshot` (a11y tree), `take_screenshot` (visual)                     |
| Console  | `list_console_messages`, `get_console_message`                              |
| Interact | `click`, `fill`, `fill_form`, `hover`, `press_key`, `drag`, `handle_dialog` |
| Viewport | `resize_page`, `emulate`                                                    |
| Debug    | `evaluate_script` (run JS in page context)                                  |
| Network  | `list_network_requests`, `get_network_request`                              |

## Important Notes

- Always use the **latest snapshot** — previous snapshots are stale after any navigation or interaction.
- Prefer `take_snapshot` over `take_screenshot` for content and structure checks — it's faster and more reliable.
- The browser starts automatically on first tool use. No manual launch needed.
- If the dev server is not running, start it first before navigating.
- Never consider the feature verified after fixing code without re-running the full check loop.
