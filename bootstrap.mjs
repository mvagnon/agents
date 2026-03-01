#!/usr/bin/env node

import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STABLE_CONFIG_DIR,
  syncConfigToStableDir,
} from "./lib/sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INTERMEDIATE_DIR = ".mvagnon/agents";

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

const CATEGORIES = ["rules", "skills", "agents"];

async function main() {
  const targetArg = process.argv[2];

  // Always: sync global config, upgrade local project
  const syncReport = syncConfigToStableDir(__dirname);
  const localDir = path.join(process.cwd(), INTERMEDIATE_DIR);
  const localReport = fs.existsSync(localDir)
    ? upgradeLocalIntermediateDir(localDir)
    : null;

  if (targetArg === "upgrade") {
    printUpgradeReport(syncReport, localReport);
    process.exit(0);
  }

  if (targetArg === "manage") {
    const { runManage } = await import("./lib/manage.mjs");
    return runManage({
      TOOLS,
      CATEGORIES,
      INTERMEDIATE_DIR,
      STABLE_CONFIG_DIR,
    });
  }

  if (!targetArg) {
    console.error("Usage: npx mvagnon-agents <target-path>");
    console.error("       npx mvagnon-agents upgrade");
    console.error("       npx mvagnon-agents manage");
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

  // Also upgrade target's local project if different from cwd
  const targetLocalDir = path.join(targetPath, INTERMEDIATE_DIR);
  if (targetPath !== process.cwd() && fs.existsSync(targetLocalDir)) {
    upgradeLocalIntermediateDir(targetLocalDir);
  }

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

  // Step 1: Select tools
  const selectedToolKeys = await p.multiselect({
    message: "Select target tools",
    options: Object.values(TOOLS).map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.hint,
    })),
    required: true,
  });
  if (p.isCancel(selectedToolKeys)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }
  const selectedTools = selectedToolKeys.map((key) => TOOLS[key]);

  // Determine which categories the selected tools support
  const supportedCategories = new Set();
  for (const tool of selectedTools) {
    for (const cat of CATEGORIES) {
      if (tool.paths[cat]) supportedCategories.add(cat);
    }
  }

  // Steps 2-4: Select items for each category
  const selections = {};
  for (const category of CATEGORIES) {
    if (!supportedCategories.has(category)) continue;

    const { projectSensitive, generic } = scanAvailableItems(category);

    if (projectSensitive.length === 0 && generic.length === 0) continue;

    if (generic.length > 0) {
      const options = generic.map((name) => ({
        value: name,
        label: name,
        initialSelected: true,
      }));

      const selected = await p.multiselect({
        message: `Pick ${category}`,
        options,
        required: false,
      });
      if (p.isCancel(selected)) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }
      selections[category] = { projectSensitive, generic: selected || [] };
    } else {
      selections[category] = { projectSensitive, generic: [] };
    }
  }

  // Step 5: Gitignore question
  const addGitignore = await p.confirm({
    message: "Add agents configuration to .gitignore?",
    initialValue: false,
    hint: "Srongly recommended on public repositories.",
  });
  if (p.isCancel(addGitignore)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Copying files + creating relative links");

  const summaryLines = [];
  const processedIntermediateFiles = new Set();

  for (const tool of selectedTools) {
    const stats = { rules: 0, skills: 0, agents: 0 };
    const { paths } = tool;

    for (const dir of Object.values(paths)) {
      fs.mkdirSync(path.join(targetPath, dir), { recursive: true });
    }

    for (const category of CATEGORIES) {
      if (!paths[category] || !selections[category]) continue;

      const { projectSensitive, generic } = selections[category];

      stats[category] = installItems(
        category,
        projectSensitive,
        generic,
        path.join(targetPath, paths[category]),
        path.join(targetPath, INTERMEDIATE_DIR),
        processedIntermediateFiles,
      );
    }

    for (const [src, dest] of Object.entries(tool.rootFiles)) {
      const srcPath = path.join(STABLE_CONFIG_DIR, src);
      if (fs.existsSync(srcPath)) {
        const intermediateRoot = path.join(targetPath, INTERMEDIATE_DIR);
        fs.mkdirSync(intermediateRoot, { recursive: true });
        const intermediatePath = path.join(intermediateRoot, src);
        if (!processedIntermediateFiles.has(intermediatePath)) {
          await copyWithConfirm(srcPath, intermediatePath, {
            spinner: s,
            projectRoot: targetPath,
          });
          processedIntermediateFiles.add(intermediatePath);
        }
        createRelativeSymlink(intermediatePath, path.join(targetPath, dest));
      }
    }

    for (const [src, dest] of Object.entries(tool.configFiles)) {
      const srcPath = path.join(STABLE_CONFIG_DIR, src);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(targetPath, dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        await copyWithConfirm(srcPath, destPath, {
          spinner: s,
          projectRoot: targetPath,
        });
      }
    }

    if (addGitignore) {
      updateGitignore(targetPath, tool);
    }

    const toolSummary = [
      stats.rules > 0 ? `Rules:  ${stats.rules} linked` : null,
      paths.skills && stats.skills > 0
        ? `Skills: ${stats.skills} linked`
        : null,
      paths.agents && stats.agents > 0
        ? `Agents: ${stats.agents} linked`
        : null,
      ...Object.values(tool.rootFiles).map((f) => `${f}: linked`),
      ...Object.values(tool.configFiles).map((f) => `${f}: copied`),
      addGitignore ? `.gitignore: entries added` : `.gitignore: not modified`,
    ].filter(Boolean);

    summaryLines.push({ tool, lines: toolSummary });
  }

  if (addGitignore) {
    addGitignoreEntry(targetPath, INTERMEDIATE_DIR, "mvagnon/agents");
  }

  s.stop("Setup complete");

  for (const { tool, lines } of summaryLines) {
    p.note(lines.join("\n"), `${tool.label} Setup`);
  }

  // Build dynamic Next Steps
  const projectSensitiveFiles = [];
  for (const category of CATEGORIES) {
    if (!selections[category]) continue;
    for (const name of selections[category].projectSensitive) {
      projectSensitiveFiles.push(`${category}/${name}`);
    }
  }

  const nextSteps = [
    "1. Add your Context7 and Exa MCPs API keys in the configuration files;",
  ];
  if (projectSensitiveFiles.length > 0) {
    nextSteps.push(
      "2. Modify the following project-sensitive files to fit your project:",
    );
    for (const f of projectSensitiveFiles) {
      nextSteps.push(`   - ${f}`);
    }
    nextSteps.push(
      `${projectSensitiveFiles.length > 0 ? "3" : "2"}. Add rules, skills, agents, MCPs or plugins based on your needs for each tool.`,
    );
  } else {
    nextSteps.push(
      "2. Add rules, skills, agents, MCPs or plugins based on your needs for each tool.",
    );
  }

  p.note(nextSteps.join("\n"), "Next Steps");
  p.outro("Done");
}

function scanAvailableItems(category) {
  const projectSensitive = [];
  const generic = [];

  const psDir = path.join(STABLE_CONFIG_DIR, category, "project-sensitive");
  if (fs.existsSync(psDir)) {
    for (const entry of fs.readdirSync(psDir)) {
      if (entry === ".gitkeep") continue;
      projectSensitive.push(entry);
    }
  }

  const genDir = path.join(STABLE_CONFIG_DIR, category, "generic");
  if (fs.existsSync(genDir)) {
    for (const entry of fs.readdirSync(genDir)) {
      if (entry === ".gitkeep") continue;
      generic.push(entry);
    }
  }

  return { projectSensitive, generic };
}

function installItems(
  category,
  projectSensitiveItems,
  genericItems,
  toolDir,
  intermediateBase,
  processedIntermediateFiles,
) {
  let count = 0;

  // Install project-sensitive items → INTERMEDIATE_DIR/<category>/
  const psSourceDir = path.join(
    STABLE_CONFIG_DIR,
    category,
    "project-sensitive",
  );
  const psIntermediateDir = path.join(intermediateBase, category);

  for (const item of projectSensitiveItems) {
    const srcPath = path.join(psSourceDir, item);
    if (!fs.existsSync(srcPath)) continue;

    fs.mkdirSync(psIntermediateDir, { recursive: true });
    const intermediatePath = path.join(psIntermediateDir, item);

    if (!processedIntermediateFiles.has(intermediatePath)) {
      copyPath(srcPath, intermediatePath);
      processedIntermediateFiles.add(intermediatePath);
    }

    createRelativeSymlink(intermediatePath, path.join(toolDir, item));
    count++;
  }

  // Install generic items → INTERMEDIATE_DIR/generic/<category>/
  const genSourceDir = path.join(STABLE_CONFIG_DIR, category, "generic");
  const genIntermediateDir = path.join(intermediateBase, "generic", category);

  for (const item of genericItems) {
    const srcPath = path.join(genSourceDir, item);
    if (!fs.existsSync(srcPath)) continue;

    fs.mkdirSync(genIntermediateDir, { recursive: true });
    const intermediatePath = path.join(genIntermediateDir, item);

    if (!processedIntermediateFiles.has(intermediatePath)) {
      copyPath(srcPath, intermediatePath);
      processedIntermediateFiles.add(intermediatePath);
    }

    createRelativeSymlink(intermediatePath, path.join(toolDir, item));
    count++;
  }

  return count;
}

function resolvePath(inputPath) {
  if (inputPath.startsWith("~")) {
    inputPath = inputPath.replace("~", process.env.HOME);
  }
  return path.resolve(inputPath);
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
    fs.mkdirSync(path.dirname(target), { recursive: true });
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

function printUpgradeReport(syncReport, localReport) {
  const globalChanged = syncReport.added.length || syncReport.removed.length;

  console.log(`\nGlobal config (v${syncReport.version}):`);
  if (syncReport.added.length)
    console.log(`  Added:   ${syncReport.added.join(", ")}`);
  if (syncReport.removed.length)
    console.log(`  Removed: ${syncReport.removed.join(", ")}`);

  const localChanged =
    localReport &&
    (localReport.updated.length > 0 || localReport.removed.length > 0);

  if (localReport) {
    console.log(`\nLocal project:`);
    if (localReport.updated.length)
      console.log(`  Updated: ${localReport.updated.join(", ")}`);
    if (localReport.removed.length)
      console.log(`  Removed: ${localReport.removed.join(", ")}`);
  }

  console.log("");
  if (!globalChanged && !localChanged) {
    console.log("Already up to date.");
  } else {
    if (globalChanged) console.log("Global config updated.");
    if (localChanged) console.log("Local project updated.");
  }
}

function upgradeLocalIntermediateDir(localDir) {
  const updated = [];
  const removed = [];

  // Only update generic/ subdirectory — project-sensitive items are never overwritten
  const genericDir = path.join(localDir, "generic");
  if (!fs.existsSync(genericDir)) return { updated, removed };

  for (const category of CATEGORIES) {
    const localCatDir = path.join(genericDir, category);
    if (!fs.existsSync(localCatDir)) continue;

    const sourceCatDir = path.join(STABLE_CONFIG_DIR, category, "generic");

    for (const item of fs.readdirSync(localCatDir)) {
      const localItem = path.join(localCatDir, item);
      const sourceItem = path.join(sourceCatDir, item);

      if (!fs.existsSync(sourceItem)) {
        fs.rmSync(localItem, { recursive: true, force: true });
        removed.push(path.join("generic", category, item));
        continue;
      }

      if (fs.statSync(sourceItem).isDirectory()) {
        if (syncDirectory(sourceItem, localItem)) {
          updated.push(path.join("generic", category, item));
        }
      } else {
        if (syncFile(sourceItem, localItem)) {
          updated.push(path.join("generic", category, item));
        }
      }
    }
  }

  // Also update root-level files (AGENTS.md etc.)
  for (const entry of fs.readdirSync(localDir)) {
    const localPath = path.join(localDir, entry);
    if (fs.statSync(localPath).isDirectory()) continue;

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

  for (const entry of fs.readdirSync(target)) {
    if (!fs.existsSync(path.join(source, entry))) {
      fs.rmSync(path.join(target, entry), { recursive: true, force: true });
      changed = true;
    }
  }

  return changed;
}

main().catch(console.error);
