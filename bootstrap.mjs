#!/usr/bin/env node

import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Available technologies for filtering rules/skills/agents.
 * Items with matching prefix (e.g., "react-*") will be included.
 */
const TECHNOLOGIES = [
  { value: "react", label: "React", hint: "Components, hooks, patterns" },
  { value: "ts", label: "TypeScript", hint: "Conventions, testing" },
];

/**
 * Available architectures for filtering rules/skills/agents.
 * Items containing the architecture name anywhere will be included.
 */
const ARCHITECTURES = [
  { value: "none", label: "None", hint: "No custom architecture" },
  { value: "hexagonal", label: "Hexagonal", hint: "Ports & adapters pattern" },
];

/**
 * Generic items included regardless of technology/architecture selection.
 */
const GENERIC_RULES = ["project"];
const GENERIC_SKILLS = ["readme-writing", "implement-within"];
const GENERIC_AGENTS = [];

/**
 * Tool configurations define the directory structure for each supported IDE tool.
 * Each tool specifies where rules, skills, agents, and config files should be placed.
 */
const TOOLS = {
  claudecode: {
    value: "claudecode",
    label: "Claude Code",
    hint: "Anthropic's CLI for Claude",

    // Target directory structure in the project
    paths: {
      rules: ".claude/rules",
      skills: ".claude/skills",
      agents: ".claude/agents",
    },

    // Root-level files to copy/link
    rootFiles: {
      "AGENTS.md": "CLAUDE.md",
    },

    // Config files to always copy (never symlink)
    // Format: "source-file-in-config-folder": "target-path-in-project"
    configFiles: {
      "claudecode.settings.json": ".mcp.json",
    },

    // Entries to add to .gitignore
    gitignoreEntries: [".claude", "CLAUDE.md", ".mcp.json"],
  },

  opencode: {
    value: "opencode",
    label: "OpenCode",
    hint: "Open-source AI coding assistant",

    // Target directory structure in the project
    paths: {
      rules: ".opencode/rules",
      skills: ".opencode/skills",
      agents: ".opencode/agents",
    },

    // Root-level files to copy/link
    rootFiles: {
      "AGENTS.md": "AGENTS.md",
    },

    // Config files to always copy (never symlink)
    // Format: "source-file-in-config-folder": "target-path-in-project"
    configFiles: {
      "opencode.settings.json": "opencode.json",
    },

    // Entries to add to .gitignore
    gitignoreEntries: [".opencode", "AGENTS.md", "opencode.json"],
  },
};

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const targetArg = process.argv[2];

  if (!targetArg) {
    console.error("Usage: ./bootstrap.sh <target-path>");
    console.error("Example: ./bootstrap.sh ../my-project");
    process.exit(1);
  }

  const targetPath = resolvePath(targetArg);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Directory not found: ${targetPath}`);
    process.exit(1);
  }

  if (!fs.statSync(targetPath).isDirectory()) {
    console.error(`Error: Path must be a directory: ${targetPath}`);
    process.exit(1);
  }

  console.clear();

  p.intro(`OpenCode Workflow → ${targetPath}`);

  const config = await p.group(
    {
      techs: () =>
        p.multiselect({
          message: "Select technologies",
          options: TECHNOLOGIES,
          required: false,
        }),

      archs: () =>
        p.select({
          message: "Select custom architecture",
          options: ARCHITECTURES,
          required: false,
        }),

      useSymlinks: () =>
        p.confirm({
          message: "Use symlinks?",
          initialValue: true,
        }),

      gitignoreMode: ({ results }) => {
        // Symlinks must be gitignored (GitHub doesn't support symlinks)
        if (results.useSymlinks) {
          return Promise.resolve("add");
        }
        return p.select({
          message: "Gitignore handling?",
          options: [
            {
              value: "add",
              label: "Add to .gitignore",
              hint: "Add entries to ignore config files",
            },
            {
              value: "exceptions",
              label: "Create exceptions",
              hint: "Use negation patterns (!path) to track specific files",
            },
          ],
        });
      },

      tool: () =>
        p.select({
          message: "Select target tool",
          options: Object.values(TOOLS).map((t) => ({
            value: t.value,
            label: t.label,
            hint: t.hint,
          })),
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled");
        process.exit(0);
      },
    },
  );

  const selectedTechs = config.techs || [];
  const selectedArchs = config.archs ? [config.archs] : [];
  const useSymlinks = config.useSymlinks;
  const gitignoreMode = config.gitignoreMode;
  const selectedTool = TOOLS[config.tool];
  const linkOrCopy = useSymlinks ? createSymlink : copyPath;

  const s = p.spinner();
  s.start(useSymlinks ? "Creating symlinks" : "Copying files");

  const stats = { rules: 0, skills: 0, agents: 0 };

  // Create directories based on tool configuration
  const { paths } = selectedTool;
  if (paths.rules) {
    fs.mkdirSync(path.join(targetPath, paths.rules), { recursive: true });
  }
  if (paths.skills) {
    fs.mkdirSync(path.join(targetPath, paths.skills), { recursive: true });
  }
  if (paths.agents) {
    fs.mkdirSync(path.join(targetPath, paths.agents), { recursive: true });
  }

  // Link/copy rules
  const rulesDir = path.join(__dirname, "config", "rules");
  if (fs.existsSync(rulesDir) && paths.rules) {
    for (const file of fs.readdirSync(rulesDir)) {
      if (!file.endsWith(".md")) continue;
      if (shouldIncludeRule(file, selectedTechs, selectedArchs)) {
        const isGenericRule = isGeneric(file);
        // Generic rules are always copied (not symlinked) to allow customization
        const action = isGenericRule ? copyPath : linkOrCopy;
        action(
          path.join(rulesDir, file),
          path.join(targetPath, paths.rules, file),
        );
        stats.rules++;
      }
    }
  }

  // Link/copy skills
  const skillsDir = path.join(__dirname, "config", "skills");
  if (fs.existsSync(skillsDir) && paths.skills) {
    for (const dir of fs.readdirSync(skillsDir)) {
      const skillPath = path.join(skillsDir, dir);
      if (
        fs.statSync(skillPath).isDirectory() &&
        shouldInclude(dir, selectedTechs, selectedArchs, GENERIC_SKILLS)
      ) {
        linkOrCopy(skillPath, path.join(targetPath, paths.skills, dir));
        stats.skills++;
      }
    }
  }

  // Link/copy agents
  const agentsDir = path.join(__dirname, "config", "agents");
  if (fs.existsSync(agentsDir) && paths.agents) {
    for (const dir of fs.readdirSync(agentsDir)) {
      const agentPath = path.join(agentsDir, dir);
      if (
        fs.statSync(agentPath).isDirectory() &&
        shouldInclude(dir, selectedTechs, selectedArchs, GENERIC_AGENTS)
      ) {
        linkOrCopy(agentPath, path.join(targetPath, paths.agents, dir));
        stats.agents++;
      }
    }
  }

  // Link/copy root files (e.g., AGENTS.md → CLAUDE.md)
  for (const [sourceFile, targetFile] of Object.entries(
    selectedTool.rootFiles,
  )) {
    const sourcePath = path.join(__dirname, "config", sourceFile);
    if (fs.existsSync(sourcePath)) {
      linkOrCopy(sourcePath, path.join(targetPath, targetFile));
    }
  }

  // Always copy config files (never symlink)
  for (const [sourceFile, targetFile] of Object.entries(
    selectedTool.configFiles,
  )) {
    const sourcePath = path.join(__dirname, "config", sourceFile);
    if (fs.existsSync(sourcePath)) {
      // Ensure target directory exists
      const targetDir = path.dirname(path.join(targetPath, targetFile));
      fs.mkdirSync(targetDir, { recursive: true });
      copyPath(sourcePath, path.join(targetPath, targetFile));
    }
  }

  // Update .gitignore
  updateGitignore(targetPath, selectedTool, gitignoreMode);

  s.stop("Setup complete");

  const mode = useSymlinks ? "linked" : "copied";
  const summaryLines = [`Rules:  ${stats.rules} ${mode}`];

  if (paths.skills) {
    summaryLines.push(`Skills: ${stats.skills} ${mode}`);
  }
  if (paths.agents) {
    summaryLines.push(`Agents: ${stats.agents} ${mode}`);
  }

  for (const targetFile of Object.values(selectedTool.rootFiles)) {
    summaryLines.push(`${targetFile}: ${mode}`);
  }
  for (const targetFile of Object.values(selectedTool.configFiles)) {
    summaryLines.push(`${targetFile}: copied`);
  }
  const gitignoreAction =
    gitignoreMode === "exceptions" ? "exceptions added" : "entries added";
  summaryLines.push(`.gitignore: ${gitignoreAction}`);

  p.note(summaryLines.join("\n"), `${selectedTool.label} Setup`);

  p.note(
    [
      "1. Modify Project.md to add project-specific rules",
      "2. Add skills, agents, or MCP based on your needs",
      "3. Alternatively, add Claude Code plugins",
    ].join("\n"),
    "Next Steps",
  );

  p.outro("Done");
}

function resolvePath(inputPath) {
  if (inputPath.startsWith("~")) {
    inputPath = inputPath.replace("~", process.env.HOME);
  }
  return path.resolve(inputPath);
}

function shouldInclude(name, selectedTechs, selectedArchs, genericList) {
  if (genericList.includes(name)) return true;
  const matchesTech = selectedTechs.some((tech) => name.startsWith(`${tech}-`));
  const matchesArch = selectedArchs
    .filter((arch) => arch !== "none")
    .some((arch) => name.includes(arch));
  return matchesTech || matchesArch;
}

function shouldIncludeRule(filename, selectedTechs, selectedArchs) {
  const name = filename.replace(".md", "");
  return shouldInclude(name, selectedTechs, selectedArchs, GENERIC_RULES);
}

function isGeneric(filename) {
  const name = filename.replace(".md", "");
  return GENERIC_RULES.includes(name);
}

function removePath(target) {
  if (
    fs.existsSync(target) ||
    fs.lstatSync(target, { throwIfNoEntry: false })
  ) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function createSymlink(source, target) {
  removePath(target);
  fs.symlinkSync(source, target);
}

function copyPath(source, target) {
  removePath(target);
  if (fs.statSync(source).isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
  } else {
    fs.copyFileSync(source, target);
  }
}

/**
 * Updates or creates the .gitignore file in the target directory
 * to include tool-specific configuration entries.
 * @param {string} targetPath - The target project directory
 * @param {object} tool - The selected tool configuration
 * @param {string} mode - "add" to ignore entries, "exceptions" to use negation patterns
 */
function updateGitignore(targetPath, tool, mode) {
  const gitignorePath = path.join(targetPath, ".gitignore");
  const sectionHeader = `# ${tool.label} Configuration`;
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");

    // Check if section already exists
    if (content.includes(sectionHeader)) {
      return; // Already configured
    }

    // Ensure content ends with newline before adding section
    if (content.length > 0 && !content.endsWith("\n")) {
      content += "\n";
    }
    content += "\n";
  }

  // Add tool-specific section
  content += sectionHeader + "\n";

  if (mode === "exceptions") {
    // Use negation patterns to track specific files
    content +=
      tool.gitignoreEntries.map((entry) => `!${entry}`).join("\n") + "\n";
  } else {
    // Default: add entries to ignore
    content += tool.gitignoreEntries.join("\n") + "\n";
  }

  fs.writeFileSync(gitignorePath, content);
}

main().catch(console.error);
