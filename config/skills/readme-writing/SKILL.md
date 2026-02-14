---
name: readme-writing
description: Write README.md for a project.
---

# README Generator Skill

Generates or updates the `README.md` file at the project root.

## Workflow

1. **Analyze the project**
   - Read `package.json` (or equivalent) for metadata;
   - Read `.claude/CLAUDE.md` and `.claude/rules/` to understand context;
   - Scan folder structure (`src/`, `lib/`, `app/`, etc.);
   - Identify the tech stack in use.

2. **Collect existing information**
   - If `README.md` exists: read it to preserve custom content;
   - Identify sections to keep vs regenerate.

3. **Generate content**
   - Follow the structure below;
   - Use a professional and concise tone;
   - No emojis unless explicitly requested.

## README Structure

```markdown
# Project Name

Short and impactful description (1-2 sentences).

## Features

- Feature 1;
- Feature 2.

## Tech Stack

| Category | Technologies |
| -------- | ------------ |
| Frontend | ...          |
| Backend  | ...          |

## Getting Started

### Prerequisites

- Node.js >= X.X;
- pnpm/npm.

### Environment Files

#### `.env`

\`\`\`text
ENV_VAR=
\`\`\`

#### `.env.local`

\`\`\`text
ENV_LOCAL_VAR=
\`\`\`

### Installation

\`\`\`bash
pnpm install
\`\`\`

### Development

\`\`\`bash
pnpm dev
\`\`\`

## Project Structure

\`\`\`
src/
├── ...
\`\`\`

## Scripts

| Script | Description |
| ------ | ----------- |
| `dev`  | ...         |

## Rules

- **Never invent** features not present in the code;
- **Preserve** existing custom sections (Contributing, Acknowledgments, etc.);
- **Adapt** the structure based on project type (lib, app, monorepo);
```
