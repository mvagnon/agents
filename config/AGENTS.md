# AGENTIC CODING MASTER RULES

## Rule 0: Documentation Lookup (BLOCKING before code generation)

Before writing or modifying code that uses a library API, resolve the correct signatures and behavior from documentation.
Skip this rule only for code with no external dependency.

### Lookup chain

1. **Context7 (primary)**
   - `resolve-library-id` → `get-library-docs` with the resolved ID.
   - If docs answer the question → use them, cite the source in a
     code comment, stop.

2. **Brave Search (fallback)**
   - Trigger: Context7 returned nothing, or the question is not
     library-specific (e.g. architecture pattern, OS behavior, RFC).
   - Query: `<library> <version> <specific method/concept>` (3-8 words).
   - Prefer: official docs > GitHub issues/PRs > Stack Overflow > blog posts.
   - If snippets are insufficient, fetch the full page.

3. **Conflict resolution**
   - When sources disagree, favor the most recent official source.
   - Flag the discrepancy in a code comment or commit message.

### Scope control

| Confidence | External API?                       | Action                           |
| ---------- | ----------------------------------- | -------------------------------- |
| High       | No                                  | Skip lookup, proceed             |
| High       | Yes, non-critical                   | Lookup recommended, not blocking |
| Any        | Auth / payments / security / crypto | **Always lookup, no exceptions** |
| Low        | Any                                 | **Always lookup**                |

## Coding Rules

- Separate logical blocks (imports, hooks, statements, functions, etc.) with one blank line;
- TSDoc/docstrings on exported functions/classes/types;
- NO comments on trivial logic; ALWAYS comment complex logic only (regex, etc.);
- NO logs unless explicitly requested;
- ALWAYS apply DRY, KISS and SOLID principles;
- DO NOT imitate existing code patterns (logs, comments, spacing, etc.).
