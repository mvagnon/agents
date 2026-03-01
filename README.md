```
                                    __                 _
 _ ____ ____ _ __ _ _ _  ___ _ _   / /_ _ __ _ ___ _ _| |_ ___
| '  \ V / _` / _` | ' \/ _ \ ' \ / / _` / _` / -_) ' \  _(_-<
|_|_|_\_/\__,_\__, |_||_\___/_||_/_/\__,_\__, \___|_||_\__/__/
              |___/                      |___/
```

# AI Workflow

Shared configuration and conventions to bootstrap AI coding assistants. One repo, one command — every tool gets the same rules, skills, and MCP servers.

## Supported Tools

| Tool        | Rules              | Skills / Agents                          | Root File   | MCP Config           |
| ----------- | ------------------ | ---------------------------------------- | ----------- | -------------------- |
| Claude Code | `.claude/rules/`   | `.claude/skills/`, `.claude/agents/`     | `CLAUDE.md` | `.mcp.json`          |
| OpenCode    | `.opencode/rules/` | `.opencode/skills/`, `.opencode/agents/` | `AGENTS.md` | `opencode.json`      |
| Cursor      | `.cursor/rules/`   | `.cursor/skills/`, `.cursor/agents/`     | —           | `.cursor/mcp.json`   |
| Codex       | —                  | `.agents/skills/`                        | `AGENTS.md` | `.codex/config.toml` |

## Compatibility

| Requirement | Details                       |
| ----------- | ----------------------------- |
| Node.js     | >= 18                         |
| macOS       | 12 Monterey and later         |
| Linux       | Any modern distribution       |
| Windows     | Not supported (WSL works)     |

## Getting Started

### Bootstrap

```bash
npx mvagnon-agents ../my-project
```

### Upgrade

```bash
npx mvagnon-agents upgrade
```

### Manage

Add or remove tools, rules, skills and agents from an existing project:

```bash
cd my-project
npx mvagnon-agents manage
```

### Interactive Walkthrough

The script prompts you to:

1. **Select target tools** — one or more (Claude Code, OpenCode, Cursor, Codex)
2. **Select rules** — pick from generic rules (project-sensitive rules are always included)
3. **Select skills** — pick from generic skills (skipped if none available)
4. **Select agents** — pick from generic agents (skipped if none available)
5. **Add to .gitignore?** — yes to ignore tool directories, no to track everything

```
AI Workflow → /Users/you/projects/my-app

◆ Select target tools
│ [x] Claude Code
│ [x] Cursor
│ [ ] OpenCode
│ [ ] Codex

◆ Select rules (project.md always included as project-sensitive)
│ [x] hexagonal-architecture.md
│ [ ] hexagonal-react-architecture.md

◆ Add tool directories to .gitignore?
│ ○ No

◇ Claude Code Setup
│ Rules:      2 linked
│ Skills:     1 linked
│ CLAUDE.md:  linked
│ .mcp.json:  copied
│ .gitignore: not modified

◇ Cursor Setup
│ Rules:      2 linked
│ .cursor/mcp.json: copied
│ .gitignore: not modified

◇ Next Steps
│ 1. Add your Context7 and Exa MCPs API keys in the configuration files;
│ 2. Modify the following project-sensitive files to fit your project:
│    - rules/project.md
│ 3. Add rules, skills, agents, MCPs or plugins based on your needs for each tool.

Done
```

## Project Structure

```
config/
├── rules/
│   ├── project-sensitive/
│   │   └── project.md                        # Per-project rules (editable)
│   └── generic/
│       ├── hexagonal-architecture.md          # Hexagonal architecture
│       └── hexagonal-react-architecture.md    # Hexagonal + React
├── skills/
│   ├── project-sensitive/                     # Per-project skills
│   └── generic/
│       └── readme-writing/                    # README generation skill
├── agents/
│   ├── project-sensitive/                     # Per-project agents
│   └── generic/                               # Shared agents
├── AGENTS.md                                  # Master rules for all agents
├── claudecode.settings.json                   # Claude Code MCP config
├── opencode.settings.json                     # OpenCode MCP config
├── cursor.mcp.json                            # Cursor MCP config
└── codex.config.toml                          # Codex MCP config (TOML)

bootstrap.mjs                                  # Interactive setup script
lib/
├── sync.mjs                                   # Config sync utilities
└── manage.mjs                                 # Manage subcommand
```

### How It Works

Files are organized into two categories:

- **project-sensitive** — copied to `.mvagnon/agents/<category>/` and meant to be edited per project. Never overwritten on upgrade.
- **generic** — copied to `.mvagnon/agents/generic/<category>/` and kept in sync with the package. Updated on upgrade.

Tool directories (`.claude/rules/`, `.cursor/rules/`, etc.) contain relative symlinks pointing into `.mvagnon/agents/`. This means all tools share the same source files.

```
.mvagnon/agents/
├── AGENTS.md                              # Root file
├── rules/
│   └── project.md                         # Project-sensitive (editable)
└── generic/
    ├── rules/
    │   ├── hexagonal-architecture.md      # Generic (updated via upgrade)
    │   └── hexagonal-react-architecture.md
    └── skills/
        └── readme-writing/
```

## Stable Configuration Directory

The package syncs all configuration files to a stable local path:

| Platform     | Path                              |
| ------------ | --------------------------------- |
| All platforms | `~/.config/mvagnon/agents/config/` |

This directory is automatically created and synchronized on every run (bootstrap, manage, upgrade).

### Upgrading

```bash
npx mvagnon-agents upgrade
```

This prints a detailed report of changes. The actual sync (global config + local generic files) happens automatically on every run. Project-sensitive files are never overwritten.

## Manual Installation

If you prefer not to use the bootstrap script:

1. Copy the `config/` folder contents to your project
2. Rename files according to your target tool (see Supported Tools table)
3. Update `.gitignore` as needed
