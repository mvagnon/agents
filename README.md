```
                                    __                 _
 _ ____ ____ _ __ _ _ _  ___ _ _   / /_ _ __ _ ___ _ _| |_ ___
| '  \ V / _` / _` | ' \/ _ \ ' \ / / _` / _` / -_) ' \  _(_-<
|_|_|_\_/\__,_\__, |_||_\___/_||_/_/\__,_\__, \___|_||_\__/__/
              |___/                      |___/
```

# AI Workflow

Bootstrap bare AI coding assistant instances. One command — every tool gets its directory structure, empty root file, and pre-filled config file, ready for manual configuration.

## Supported Tools

| Tool        | Rules              | Skills / Agents                           | Root File   | Config File          |
| ----------- | ------------------ | ----------------------------------------- | ----------- | -------------------- |
| Claude Code | `.claude/rules/`   | `.claude/skills/` · `.claude/agents/`     | `CLAUDE.md` | `.mcp.json`          |
| OpenCode    | `.opencode/rules/` | `.opencode/skills/` · `.opencode/agents/` | `AGENTS.md` | `opencode.json`      |
| Cursor      | `.cursor/rules/`   | `.cursor/skills/` · `.cursor/agents/`     | —           | `.cursor/mcp.json`   |
| Codex       | —                  | `.agents/skills/`                         | `AGENTS.md` | `.codex/config.toml` |

## Compatibility

| Requirement | Details                   |
| ----------- | ------------------------- |
| Node.js     | >= 18                     |
| macOS       | 12 Monterey and later     |
| Linux       | Any modern distribution   |
| Windows     | Not supported (WSL works) |

## Getting Started

### Init

```bash
npx mvagnon-agents ../my-project
```

The script prompts you to:

1. **Select target tools** — one or more (Claude Code, OpenCode, Cursor, Codex)

Each tool gets:

- Empty directory structure (rules/, skills/, agents/)
- Empty root file (CLAUDE.md, AGENTS.md)
- Pre-filled config file with empty MCP structure (.mcp.json, opencode.json, etc.)

Edit everything manually to fit your project.

```
AI Workflow → /Users/you/projects/my-app

◆ Select target tools
│ [x] Claude Code
│ [x] Cursor
│ [ ] OpenCode
│ [ ] Codex

◇ Claude Code Setup
│ .claude/rules/:  created
│ .claude/skills/: created
│ .claude/agents/: created
│ CLAUDE.md:       created
│ .mcp.json:       created

◇ Cursor Setup
│ .cursor/rules/:   created
│ .cursor/skills/:  created
│ .cursor/agents/:  created
│ .cursor/mcp.json: created

◇ MCP Configuration
│ Don't forget to configure your MCP servers in:
│   Claude Code: .mcp.json
│   Cursor:      .cursor/mcp.json

Done
```

### Propagate

Propagate one tool's configuration to other tools using **symlinks** (root file, rules, skills, agents) so all tools share the same source of truth. Config/MCP files are created empty (not symlinked).

```bash
cd my-project
npx mvagnon-agents propagate
```

The script:

1. Detects which tools are already configured (requires **both** the tool directory and root file to be present)
2. If multiple exist, asks which one to propagate from
3. Proposes all tools that do **not** yet have an instance as destinations
4. Creates symlinks for root file and directory contents (rules, skills, agents)
5. Creates empty config/MCP files

```
Propagate config → /Users/you/projects/my-app

◆ Select source tool to propagate from
│ ● Claude Code

◆ Select destination tools
│ [x] OpenCode
│ [x] Cursor

◇ OpenCode
│ AGENTS.md:         symlinked → CLAUDE.md
│ .opencode/rules/:  3 item(s) symlinked → .claude/rules/
│ .opencode/skills/: 1 item(s) symlinked → .claude/skills/
│ .opencode/agents/: created (empty)
│ opencode.json:     created (empty structure)

◇ Cursor
│ .cursor/rules/:   3 item(s) symlinked → .claude/rules/
│ .cursor/skills/:  1 item(s) symlinked → .claude/skills/
│ .cursor/agents/:  created (empty)
│ .cursor/mcp.json: created (empty structure)

◇ MCP Configuration
│ Don't forget to configure your MCP servers in:
│   OpenCode: opencode.json
│   Cursor:   .cursor/mcp.json

Done
```

## Project Structure

```
bootstrap.mjs          # Interactive setup script
tools.json             # Tool definitions and config templates
lib/
└── propagate.mjs      # Propagate subcommand
```

## Recommended Claude Code Hooks

Claude Code supports `PostToolUse` hooks that automatically lint and format files after every `Edit` or `Write`. Add the following to your `~/.claude/settings.json` to enable auto-formatting across all projects:

```jsonc
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            // JS/TS: ESLint fix then Prettier (sequential to avoid race conditions)
            "type": "command",
            "command": "jq -r '.tool_input.file_path | select(test(\"\\\\.([jt]sx?|mjs|cjs)$\"))' | xargs -I {} sh -c 'npx eslint --fix \"$1\" && npx prettier --write \"$1\"' _ {}",
          },
          {
            // Other files (md, json, css, etc.): Prettier only
            "type": "command",
            "command": "jq -r '.tool_input.file_path | select(test(\"\\\\.([jt]sx?|mjs|cjs)$\") | not)' | xargs npx prettier --write --ignore-unknown",
          },
          {
            // Python: Ruff check then format (sequential to avoid race conditions)
            "type": "command",
            "command": "jq -r '.tool_input.file_path | select(test(\"\\\\.py$\"))' | xargs -I {} sh -c 'uvx ruff check --fix \"$1\" && uvx ruff format \"$1\"' _ {}",
          },
        ],
      },
    ],
  },
}
```

> **Why sequential?** Claude Code runs hooks in parallel. Tools that write to the same file (e.g. ESLint + Prettier, or Ruff check + Ruff format) must be chained with `&&` inside a single hook to prevent race conditions.

### Prerequisites

- **Node.js** (for `npx eslint` and `npx prettier`)
- **uv** (for `uvx ruff`) — install via `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Project-level ESLint and Prettier configs (`.eslintrc.*` / `eslint.config.*`, `.prettierrc*`) for JS/TS rules to take effect
