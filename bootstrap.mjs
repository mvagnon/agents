#!/usr/bin/env node

import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STABLE_CONFIG_DIR, syncConfigToStableDir } from "./lib/sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// CONFIGURATION
// =============================================================================

// Technologies and architectures only filter which mvagnon/agents resources
// (rules, skills, agents) are included. They do not affect your project setup.
const TECHNOLOGIES = [
  { value: "react", label: "React", hint: "Components, hooks, patterns" },
  { value: "ts", label: "TypeScript", hint: "Conventions, testing" },
];

const ARCHITECTURES = [
  { value: "none", label: "None", hint: "No custom architecture" },
  { value: "hexagonal", label: "Hexagonal", hint: "Ports & adapters pattern" },
];

// Items always copied (never symlinked) to allow per-project customization
const COPIED_RULES = ["project"];
const COPIED_SKILLS = [];
const COPIED_AGENTS = [];

// Intermediate directory in the target project for per-project customizable resources
const INTERMEDIATE_DIR = ".mvagnon/agents";

// Tool definitions: directory structure, root files, config files, gitignore
const TOOLS = {
  claudecode: {
    value: "claudecode",
    label: "Claude Code",
    hint: "Anthropic's CLI for Claude",
    paths: {
      rules: ".claude/rules",
      skills: ".claude/skills",
      agents: ".claude/agents",
    },
    rootFiles: { "AGENTS.md": "CLAUDE.md" },
    configFiles: { "claudecode.settings.json": ".mcp.json" },
    gitignoreEntries: [".claude", "CLAUDE.md", ".mcp.json"],
  },

  opencode: {
    value: "opencode",
    label: "OpenCode",
    hint: "Open-source AI coding assistant",
    paths: {
      rules: ".opencode/rules",
      skills: ".opencode/skills",
      agents: ".opencode/agents",
    },
    rootFiles: { "AGENTS.md": "AGENTS.md" },
    configFiles: { "opencode.settings.json": "opencode.json" },
    gitignoreEntries: [".opencode", "AGENTS.md", "opencode.json"],
  },

  cursor: {
    value: "cursor",
    label: "Cursor",
    hint: "AI-powered code editor",
    paths: {
      rules: ".cursor/rules",
      skills: ".cursor/skills",
      agents: ".cursor/agents",
    },
    rootFiles: {},
    configFiles: { "cursor.mcp.json": ".cursor/mcp.json" },
    gitignoreEntries: [".cursor"],
  },

  codex: {
    value: "codex",
    label: "Codex",
    hint: "OpenAI's coding agent CLI",
    paths: {
      skills: ".agents/skills",
    },
    rootFiles: { "AGENTS.md": "AGENTS.md" },
    configFiles: { "codex.config.toml": ".codex/config.toml" },
    gitignoreEntries: [".codex", ".agents", "AGENTS.md"],
  },
};

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const targetArg = process.argv[2];

  // --- Upgrade subcommand ---
  if (targetArg === "upgrade") {
    const report = syncConfigToStableDir(__dirname);
    const globalChanged =
      report.added.length || report.updated.length || report.removed.length;

    console.log(`\n~/Public synced (v${report.version}):`);
    if (report.added.length)
      console.log(`  Added:   ${report.added.join(", ")}`);
    if (report.updated.length)
      console.log(`  Updated: ${report.updated.join(", ")}`);
    if (report.removed.length)
      console.log(`  Removed: ${report.removed.join(", ")}`);

    // If .mvagnon/agents/ exists in cwd, also update local copies
    const localDir = path.join(process.cwd(), INTERMEDIATE_DIR);
    const hasLocalDir = fs.existsSync(localDir);
    let localChanged = false;

    if (hasLocalDir) {
      const localReport = upgradeLocalIntermediateDir(localDir);
      localChanged = localReport.updated.length || localReport.removed.length;

      console.log(`\n${INTERMEDIATE_DIR}/ synced:`);
      if (localReport.updated.length)
        console.log(`  Updated: ${localReport.updated.join(", ")}`);
      if (localReport.removed.length)
        console.log(`  Removed: ${localReport.removed.join(", ")}`);
    }

    // Summary message
    console.log("");
    if (!globalChanged && !localChanged) {
      console.log("Already up to date.");
    } else if (globalChanged && hasLocalDir && localChanged) {
      console.log(
        "Agent instructions updated in all symlinked projects and in this project.",
      );
    } else if (globalChanged && hasLocalDir && !localChanged) {
      console.log(
        "Agent instructions updated in all symlinked projects. This project was already up to date.",
      );
    } else if (globalChanged) {
      console.log("Agent instructions updated in all symlinked projects.");
    } else if (localChanged) {
      console.log("Agent instructions updated in this project.");
    }

    process.exit(0);
  }

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

  // Sync config to stable directory before prompts
  const syncReport = syncConfigToStableDir(__dirname);
  console.log(
    `Config synced to ${STABLE_CONFIG_DIR}/ (v${syncReport.version})`,
  );

  console.clear();

  const banner = [
    "                                    __                 _      ",
    " _ ____ ____ _ __ _ _ _  ___ _ _   / /_ _ __ _ ___ _ _| |_ ___",
    "| '  \\ V / _` / _` | ' \\/ _ \\ ' \\ / / _` / _` / -_) ' \\  _(_-<",
    "|_|_|_\\_/\\__,_\\__, |_||_\\___/_||_/_/\\__,_\\__, \\___|_||_\\__/__/",
    "              |___/                      |___/                 ",
  ];
  console.log("\x1b[36m" + banner.join("\n") + "\x1b[0m\n");

  p.intro(`AI Workflow → ${targetPath}`);

  const config = await p.group(
    {
      techs: () =>
        p.multiselect({
          message: "Select which in-house technology instructions to add",
          options: TECHNOLOGIES,
          required: false,
        }),

      archs: () =>
        p.select({
          message: "Select which in-house architecture instructions to add",
          options: ARCHITECTURES,
          required: false,
        }),

      useSymlinks: () =>
        p.select({
          message: "How should agent files be linked to your project?",
          options: [
            {
              value: true,
              label: "Symlinks to ~/Public",
              hint: "Auto-updates across all projects · not tracked in git",
            },
            {
              value: false,
              label: "Copied locally + relative links",
              hint: "Tracked in git, shareable with team · updated per project",
            },
          ],
        }),

      tools: () =>
        p.multiselect({
          message: "Select target tools",
          options: Object.values(TOOLS).map((t) => ({
            value: t.value,
            label: t.label,
            hint: t.hint,
          })),
          required: true,
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
  const selectedTools = config.tools.map((key) => TOOLS[key]);
  const s = p.spinner();
  const safeCopy = (src, tgt) =>
    copyWithConfirm(src, tgt, { spinner: s, projectRoot: targetPath });
  const linkOrCopy = useSymlinks
    ? async (src, tgt) => createSymlink(src, tgt)
    : async (src, tgt) => createRelativeSymlink(src, tgt);

  s.start(
    useSymlinks
      ? "Creating symlinks"
      : "Copying files + creating relative links",
  );

  const mode = useSymlinks ? "linked" : "copied + linked";
  const summaryLines = [];
  const processedIntermediateFiles = new Set();

  for (const tool of selectedTools) {
    const stats = { rules: 0, skills: 0, agents: 0 };
    const { paths } = tool;

    for (const dir of Object.values(paths)) {
      fs.mkdirSync(path.join(targetPath, dir), { recursive: true });
    }

    if (paths.rules) {
      stats.rules = await linkMatchingItems(
        path.join(STABLE_CONFIG_DIR, "rules"),
        path.join(targetPath, paths.rules),
        selectedTechs,
        selectedArchs,
        linkOrCopy,
        {
          filterExtension: ".md",
          copiedItems: COPIED_RULES,
          copyAll: !useSymlinks,
          intermediateDir: path.join(targetPath, INTERMEDIATE_DIR, "rules"),
          processedIntermediateFiles,
          safeCopy,
        },
      );
    }

    if (paths.skills) {
      stats.skills = await linkMatchingItems(
        path.join(STABLE_CONFIG_DIR, "skills"),
        path.join(targetPath, paths.skills),
        selectedTechs,
        selectedArchs,
        linkOrCopy,
        {
          directoriesOnly: true,
          copiedItems: COPIED_SKILLS,
          copyAll: !useSymlinks,
          intermediateDir: path.join(targetPath, INTERMEDIATE_DIR, "skills"),
          processedIntermediateFiles,
          safeCopy,
        },
      );
    }

    if (paths.agents) {
      stats.agents = await linkMatchingItems(
        path.join(STABLE_CONFIG_DIR, "agents"),
        path.join(targetPath, paths.agents),
        selectedTechs,
        selectedArchs,
        linkOrCopy,
        {
          directoriesOnly: true,
          copiedItems: COPIED_AGENTS,
          copyAll: !useSymlinks,
          intermediateDir: path.join(targetPath, INTERMEDIATE_DIR, "agents"),
          processedIntermediateFiles,
          safeCopy,
        },
      );
    }

    for (const [src, dest] of Object.entries(tool.rootFiles)) {
      const srcPath = path.join(STABLE_CONFIG_DIR, src);
      if (fs.existsSync(srcPath)) {
        if (!useSymlinks) {
          const intermediateRoot = path.join(targetPath, INTERMEDIATE_DIR);
          fs.mkdirSync(intermediateRoot, { recursive: true });
          const intermediatePath = path.join(intermediateRoot, src);
          if (!processedIntermediateFiles.has(intermediatePath)) {
            await safeCopy(srcPath, intermediatePath);
            processedIntermediateFiles.add(intermediatePath);
          }
          await linkOrCopy(intermediatePath, path.join(targetPath, dest));
        } else {
          await linkOrCopy(srcPath, path.join(targetPath, dest));
        }
      }
    }

    for (const [src, dest] of Object.entries(tool.configFiles)) {
      const srcPath = path.join(STABLE_CONFIG_DIR, src);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(targetPath, dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        await safeCopy(srcPath, destPath);
      }
    }

    if (useSymlinks) {
      updateGitignore(targetPath, tool);
      addGitignoreEntry(targetPath, INTERMEDIATE_DIR, "mvagnon/agents");
    }

    const toolSummary = [
      `Rules:  ${stats.rules} ${mode}`,
      paths.skills ? `Skills: ${stats.skills} ${mode}` : null,
      paths.agents ? `Agents: ${stats.agents} ${mode}` : null,
      ...Object.values(tool.rootFiles).map((f) => `${f}: ${mode}`),
      ...Object.values(tool.configFiles).map((f) => `${f}: copied`),
      useSymlinks
        ? `.gitignore: entries added`
        : `.gitignore: not modified (files committed via .mvagnon/agents/)`,
    ].filter(Boolean);

    summaryLines.push({ tool, lines: toolSummary });
  }

  s.stop("Setup complete");

  for (const { tool, lines } of summaryLines) {
    p.note(lines.join("\n"), `${tool.label} Setup`);
  }

  p.note(
    [
      "1. Add your Context7 and Exa MCPs API keys in the configuration files;",
      "2. Modify `project.md` to add project-specific rules;",
      "3. Add rules, skills, agents, MCPs or plugins based on your needs for each tool.",
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

function isTechOrArchSpecific(name) {
  const allTechs = TECHNOLOGIES.map((t) => t.value);
  const allArchs = ARCHITECTURES.filter((a) => a.value !== "none").map(
    (a) => a.value,
  );
  const segments = name.split("-");

  return (
    allTechs.some((tech) => segments.includes(tech)) ||
    allArchs.some((arch) => segments[0] === arch)
  );
}

function shouldInclude(name, selectedTechs, selectedArchs) {
  if (!isTechOrArchSpecific(name)) return true;

  const segments = name.split("-");
  const allTechs = TECHNOLOGIES.map((t) => t.value);
  const allArchs = ARCHITECTURES.filter((a) => a.value !== "none").map(
    (a) => a.value,
  );

  const isTechSpecific = allTechs.some((tech) => segments.includes(tech));
  const isArchSpecific = allArchs.some((arch) => segments[0] === arch);

  const matchesTech = selectedTechs.some((tech) => segments.includes(tech));
  const matchesArch = selectedArchs
    .filter((arch) => arch !== "none")
    .some((arch) => segments[0] === arch);

  if (isTechSpecific && isArchSpecific) {
    return matchesTech && matchesArch;
  }

  return matchesTech || matchesArch;
}

async function linkMatchingItems(
  sourceDir,
  targetDir,
  selectedTechs,
  selectedArchs,
  linkOrCopy,
  {
    filterExtension,
    directoriesOnly,
    copiedItems = [],
    copyAll = false,
    intermediateDir,
    safeCopy,
    processedIntermediateFiles = new Set(),
  } = {},
) {
  if (!fs.existsSync(sourceDir)) return 0;

  let count = 0;

  for (const entry of fs.readdirSync(sourceDir)) {
    const fullPath = path.join(sourceDir, entry);
    const isDir = fs.statSync(fullPath).isDirectory();

    if (directoriesOnly && !isDir) continue;
    if (filterExtension && !entry.endsWith(filterExtension)) continue;

    const name = entry.replace(/\.md$/, "");

    if (!shouldInclude(name, selectedTechs, selectedArchs)) continue;

    const isCopied = (copyAll || copiedItems.includes(name)) && intermediateDir;

    if (isCopied) {
      const intermediatePath = path.join(intermediateDir, entry);
      fs.mkdirSync(intermediateDir, { recursive: true });

      if (!processedIntermediateFiles.has(intermediatePath)) {
        await safeCopy(fullPath, intermediatePath);
        processedIntermediateFiles.add(intermediatePath);
      }

      await linkOrCopy(intermediatePath, path.join(targetDir, entry));
    } else {
      await linkOrCopy(fullPath, path.join(targetDir, entry));
    }

    count++;
  }

  return count;
}

async function copyWithConfirm(source, target, { spinner, projectRoot } = {}) {
  if (fs.existsSync(target)) {
    try {
      if (!fs.lstatSync(target).isSymbolicLink()) {
        const label = projectRoot
          ? path.relative(projectRoot, target)
          : path.basename(target);
        if (spinner) spinner.stop("Existing file found");
        const overwrite = await p.confirm({
          message: `${label} already exists. Overwrite?`,
          initialValue: false,
        });
        if (p.isCancel(overwrite)) {
          p.cancel("Setup cancelled");
          process.exit(0);
        }
        if (spinner) spinner.start("Continuing setup");
        if (!overwrite) return false;
      }
    } catch {
      // lstat failed, proceed with copy
    }
  }

  copyPath(source, target);
  return true;
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

function createRelativeSymlink(source, target) {
  removePath(target);
  const relPath = path.relative(path.dirname(target), source);
  fs.symlinkSync(relPath, target);
}

function copyPath(source, target) {
  removePath(target);

  if (fs.statSync(source).isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
  } else {
    fs.copyFileSync(source, target);
  }
}

function updateGitignore(targetPath, tool) {
  const gitignorePath = path.join(targetPath, ".gitignore");
  const sectionHeader = `# ${tool.label} Configuration`;
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");

    if (content.includes(sectionHeader)) return;

    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += "\n";
  }

  content += sectionHeader + "\n";
  content += tool.gitignoreEntries.join("\n") + "\n";

  fs.writeFileSync(gitignorePath, content);
}

function addGitignoreEntry(targetPath, entry, sectionComment) {
  const gitignorePath = path.join(targetPath, ".gitignore");
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.split("\n").some((line) => line.trim() === entry)) return;
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += "\n";
  }

  if (sectionComment) {
    content += `# ${sectionComment}\n`;
  }
  content += entry + "\n";
  fs.writeFileSync(gitignorePath, content);
}

/**
 * Update files in .mvagnon/agents/ that already exist with their latest
 * version from the stable config dir. Only touches existing files (respects
 * what was selected at bootstrap time). Removes local files whose source
 * no longer exists upstream.
 */
function upgradeLocalIntermediateDir(localDir) {
  const updated = [];
  const removed = [];

  const copiedByDir = {
    rules: COPIED_RULES,
    skills: COPIED_SKILLS,
    agents: COPIED_AGENTS,
  };

  for (const entry of fs.readdirSync(localDir)) {
    const localPath = path.join(localDir, entry);
    const stat = fs.statSync(localPath);

    if (stat.isDirectory()) {
      // Subdirectory: rules/, skills/, agents/
      const sourceSubdir = path.join(STABLE_CONFIG_DIR, entry);
      const copiedItems = copiedByDir[entry] || [];

      for (const item of fs.readdirSync(localPath)) {
        const localItem = path.join(localPath, item);
        const sourceItem = path.join(sourceSubdir, item);
        const itemName = item.replace(/\.md$/, "");

        // Skip per-project customizable items
        if (copiedItems.includes(itemName)) continue;

        if (!fs.existsSync(sourceItem)) {
          fs.rmSync(localItem, { recursive: true, force: true });
          removed.push(path.join(entry, item));
          continue;
        }

        if (fs.statSync(sourceItem).isDirectory()) {
          if (syncDirectory(sourceItem, localItem)) {
            updated.push(path.join(entry, item));
          }
        } else {
          if (syncFile(sourceItem, localItem)) {
            updated.push(path.join(entry, item));
          }
        }
      }
    } else {
      // Root-level file (e.g. AGENTS.md)
      const sourceFile = path.join(STABLE_CONFIG_DIR, entry);

      if (!fs.existsSync(sourceFile)) {
        fs.rmSync(localPath, { force: true });
        removed.push(entry);
        continue;
      }

      if (syncFile(sourceFile, localPath)) {
        updated.push(entry);
      }
    }
  }

  return { updated, removed };
}

function syncFile(source, target) {
  const srcContent = fs.readFileSync(source);
  const tgtContent = fs.readFileSync(target);
  if (!srcContent.equals(tgtContent)) {
    fs.copyFileSync(source, target);
    return true;
  }
  return false;
}

function syncDirectory(source, target) {
  let changed = false;

  for (const entry of fs.readdirSync(source)) {
    const srcPath = path.join(source, entry);
    const tgtPath = path.join(target, entry);

    if (fs.statSync(srcPath).isDirectory()) {
      fs.mkdirSync(tgtPath, { recursive: true });
      if (syncDirectory(srcPath, tgtPath)) changed = true;
    } else {
      if (!fs.existsSync(tgtPath)) {
        fs.copyFileSync(srcPath, tgtPath);
        changed = true;
      } else if (syncFile(srcPath, tgtPath)) {
        changed = true;
      }
    }
  }

  // Remove files in target that no longer exist in source
  for (const entry of fs.readdirSync(target)) {
    if (!fs.existsSync(path.join(source, entry))) {
      fs.rmSync(path.join(target, entry), { recursive: true, force: true });
      changed = true;
    }
  }

  return changed;
}

main().catch(console.error);
