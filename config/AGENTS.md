# AGENTIC CODING MASTER RULES

## Rule 0: Skill Check (BLOCKING)

Before writing ANY code, executing ANY plan, or producing ANY plan:

1. List available skills by scanning skill directories in a `Skill Check` block;
2. For each skill relevant to the current task:
   - State the skill name and WHY it applies;
   - READ the SKILL.md file to load its instructions into context;
3. In your plan, for each step:
   - Reference which skill(s) govern it;
   - Describe HOW the skill applies (which specific instructions/patterns to follow);
4. During execution, follow the loaded skill instructions for each step;
5. If no skill is relevant, state "No skills apply" and proceed.

NEVER skip this step. NEVER write code or produce a plan before completing the Skill Check.

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
