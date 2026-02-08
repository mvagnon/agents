# Master Rules

## Project-Specific Rules

Find the project-specific master rules here → `project.md`.

## Before Writing Code

Before writing or modifying code that uses any external library:

1. **First**, resolve the library with _Context7 MCP_ to get the up-to-date documentation;
2. **Only** if Context7 returns no results or insufficient info, fall back to _Exa MCP_ as a secondary source.

> **Important:** ALWAYS prefer Context7 documentation over training data as the source of truth, especially for critical features (security, billing, authentication, payments, etc.).

## While Writing Code

### Documentation & Logging

- Write TSDoc/docstrings ONLY for **exported** functions, classes, types, and interfaces;
- DO NOT add inline comments or logs unless explicitly requested;
- Generic code (style variables, UI components, etc.) should ALWAYS be reusable.

## After Writing Code

ALWAYS check the following after modifying the codebase. Iterate until complete:

- [ ] Generic code is reusable
- [ ] No code was duplicated
- [ ] No logs were added without prior consent
- [ ] `README.md` is still up to date
