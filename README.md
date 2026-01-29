# OpenCode Workflow

Configuration and conventions to optimize OpenCode usage on TypeScript/React projects.

## Features

![Features Illustration](./.github/assets/readme-illustration.png)

- Ready-to-use OpenCode configuration rules
- Strict TypeScript conventions with recommended patterns
- Hexagonal architecture for React applications
- Testing guidelines with Testing Library
- Custom skills (readme-writing, implement-within, ts-test-writing)
- Bootstrap script for easy setup (symlinks or copy)

## Project Structure

```
.opencode/
├── rules/
│   ├── project-stack.md               # Supported tech stack
│   ├── ts-conventions.md              # TypeScript conventions
│   ├── react-conventions.md           # React component patterns
│   └── react-hexagonal-architecture.md # Hexagonal architecture
├── skills/
│   ├── readme-writing/     # README generation
│   ├── implement-within/   # Context-first implementation strategy
│   └── ts-test-writing/    # Testing guidelines
└── agents/                 # Custom agents (optional)

AGENTS.md                   # Master rules for all agents
opencode.json               # OpenCode configuration
bootstrap.mjs               # Node.js setup script
```

## Tech Stack Coverage

| Category   | Technologies                                              |
| ---------- | --------------------------------------------------------- |
| Frontend   | React, Next.js, Vite, TypeScript, Tailwind CSS, ShadCN UI |
| Backend    | Node.js, Fastify, Express, NestJS, Supabase               |
| State      | Zustand, TanStack Query, React Context                    |
| Testing    | Vitest, Jest, React Testing Library                       |
| Tooling    | ESLint, Prettier, pnpm, Docker                            |
| Middleware | Clerk, Stripe                                             |

## Quick Start with Bootstrap

The bootstrap script automates the setup process by creating symlinks (or copying files) from this repository to your target project.

### Usage

```bash
# Install dependencies (first time only)
pnpm install

# Run the bootstrap script with target path
pnpm run bootstrap ../my-project

# Or directly with node
node bootstrap.mjs ~/projects/my-app
```

### Interactive Walkthrough

The script prompts you to:

1. **Select technologies**: Choose React and/or TypeScript to filter relevant rules
2. **Choose mode**: Symlinks (recommended) or copy files

```
OpenCode Workflow → /Users/you/projects/my-app

? Select technologies
  [ ] React - Components, hooks, patterns
  [x] TypeScript - Conventions, testing

? Use symlinks? (No = copy files) Yes

Summary
  Rules:         3 linked
  Skills:        3 linked
  Agents:        0 linked
  AGENTS.md:     linked
  opencode.json: copied
  .gitignore:    updated

Done
```

### What Gets Created

| Path                | Description                            |
| ------------------- | -------------------------------------- |
| `.opencode/rules/`  | Rules matching selected technologies   |
| `.opencode/skills/` | All available skills                   |
| `.opencode/agents/` | Custom agents (if any)                 |
| `AGENTS.md`         | Master rules file                      |
| `opencode.json`     | OpenCode configuration (always copied) |

### Rule Filtering

| Selection  | Rules Included                                |
| ---------- | --------------------------------------------- |
| React      | `react-*.md` + `project-stack.md`             |
| TypeScript | `ts-*.md` + `project-stack.md`                |
| Both       | `react-*.md` + `ts-*.md` + `project-stack.md` |

### Symlinks vs Copy

| Mode     | Pros                                | Cons                          |
| -------- | ----------------------------------- | ----------------------------- |
| Symlinks | Centralized updates, no duplication | Requires source repo presence |
| Copy     | Self-contained, portable            | Manual updates needed         |

## Prerequisites

- Node.js >= 18
- pnpm or npm

## Manual Installation

If you prefer not to use symlinks:

1. Copy the `.opencode/` folder to the root of your project
2. Copy `AGENTS.md` to your project root
3. Copy `opencode.json` to your project root
4. Adapt `rules/project-stack.md` according to your stack

## Available Skills

| Skill              | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `readme-writing`   | Generates or updates the project README.md                              |
| `implement-within` | Context-first implementation strategy for modifying only provided files |
| `ts-test-writing`  | Testing guidelines and patterns for TypeScript tests                    |
