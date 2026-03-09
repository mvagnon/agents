# AGENTIC CODING MASTER RULES

## Rule 0: Skill Check (BLOCKING)

CRITICAL: before writing ANY code/plan, output a `Skill Check` block:

1. Check your available skills and list those who will be useful to access the request and why;
2. ALWAYS use those skills:
   - When writing a plan, make sure to mention the skills to use;
   - When writing code, use the skills in the intended purpose.

## Code Rules

- Separate logical blocks (imports, hooks, statements, functions, etc.) with one blank line;
- TSDoc/docstrings on exported functions/classes/types;
- NO comments on trivial logic; ALWAYS comment complex logic only (regex, etc.);
- NO logs unless explicitly requested;
- ALWAYS apply DRY, KISS and SOLID principles;
- DO NOT imitate existing code patterns (logs, comments, spacing, etc.).

## Checklist

- Comply to `Rule 0`
- Respect the `Code Rules`
