#!/usr/bin/env node

import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadApiKeys,
  replacePlaceholders,
  saveApiKeys,
  scanPlaceholders,
} from "./lib/apikeys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR = path.join(__dirname, "config");
const VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"),
).version;
const INTERMEDIATE_DIR = ".mvagnon-agents";

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

  // Auto-upgrade local project if it exists
  const localDir = path.join(process.cwd(), INTERMEDIATE_DIR);
  const localReport = fs.existsSync(localDir)
    ? upgradeLocalIntermediateDir(localDir)
    : null;

  if (targetArg === "upgrade") {
    console.clear();
    const upgradeBanner = [
      "                                    __                           _     ",
      " _ ____ ____ _ __ _ _ _  ___ _ _   / /  _ _ __  __ _ _ _ __ _ __| |___ ",
      "| '  \\ V / _` / _` | ' \\/ _ \\ ' \\ / / || | '_ \\/ _` | '_/ _` / _` / -_)",
      "|_|_|_\\_/\\__,_\\__, |_||_\\___/_||_/_/ \\_,_| .__/\\__, |_| \\__,_\\__,_\\___|",
      "              |___/                      |_|   |___/                    ",
    ];
    console.log("\x1b[36m" + upgradeBanner.join("\n") + "\x1b[0m");
    console.log("\x1b[2m  v" + VERSION + "\x1b[0m\n");

    if (!localReport) {
      p.log.error(
        `${INTERMEDIATE_DIR}/ not found in current directory. Run bootstrap first.`,
      );
      process.exit(1);
    }
    printUpgradeReport(localReport);
    process.exit(0);
  }

  if (targetArg === "manage") {
    const { runManage } = await import("./lib/manage.mjs");
    return runManage({
      TOOLS,
      CATEGORIES,
      INTERMEDIATE_DIR,
      CONFIG_DIR,
      VERSION,
    });
  }

  if (targetArg === "keys") {
    const { runKeys } = await import("./lib/keys.mjs");
    return runKeys({ VERSION });
  }

  if (!targetArg) {
    console.error("Usage: npx mvagnon-agents <target-path>");
    console.error("       npx mvagnon-agents upgrade");
    console.error("       npx mvagnon-agents manage");
    console.error("       npx mvagnon-agents keys");
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
  console.log("\x1b[36m" + banner.join("\n") + "\x1b[0m");
  console.log("\x1b[2m  v" + VERSION + "\x1b[0m\n");

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

  // Step 2: Select resources (rules, skills, agents in one menu)
  const allResourceOptions = [];
  for (const category of CATEGORIES) {
    if (!supportedCategories.has(category)) continue;

    const { projectSensitive, generic } = scanAvailableItems(category);

    for (const name of projectSensitive) {
      allResourceOptions.push({
        value: `ps:${category}:${name}`,
        label: name,
        hint: `${category} · project-sensitive`,
      });
    }
    for (const name of generic) {
      allResourceOptions.push({
        value: `gen:${category}:${name}`,
        label: name,
        hint: category,
        initialSelected: true,
      });
    }
  }

  const selections = {};
  if (allResourceOptions.length > 0) {
    const selected = await p.multiselect({
      message: "Pick resources",
      options: allResourceOptions,
      required: false,
    });
    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled");
      process.exit(0);
    }

    for (const val of selected || []) {
      const [type, category, ...nameParts] = val.split(":");
      const name = nameParts.join(":");
      if (!selections[category])
        selections[category] = { projectSensitive: [], generic: [] };
      if (type === "ps") selections[category].projectSensitive.push(name);
      else selections[category].generic.push(name);
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

  // Step 6: API keys — scan config files for placeholders, prompt for missing keys
  const configFilePaths = [];
  for (const tool of selectedTools) {
    for (const src of Object.keys(tool.configFiles)) {
      configFilePaths.push(path.join(CONFIG_DIR, src));
    }
  }
  const neededKeys = scanPlaceholders(configFilePaths);
  const apiKeys = loadApiKeys();
  let newKeysAdded = false;

  if (neededKeys.size > 0) {
    for (const name of neededKeys) {
      if (apiKeys[name]) continue;
      const value = await p.password({
        message: `API key for ${name} (empty to skip)`,
      });
      if (p.isCancel(value)) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }
      if (value) {
        apiKeys[name] = value;
        newKeysAdded = true;
      }
    }
    if (newKeysAdded) {
      saveApiKeys(apiKeys);
    }
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
      const srcPath = path.join(CONFIG_DIR, src);
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
      const srcPath = path.join(CONFIG_DIR, src);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(targetPath, dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        await copyConfigWithReplacements(srcPath, destPath, apiKeys, {
          spinner: s,
          projectRoot: targetPath,
        });
      }
    }

    updateGitignore(targetPath, tool, !addGitignore);

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
      addGitignore
        ? `.gitignore: entries added`
        : `.gitignore: exceptions added`,
    ].filter(Boolean);

    summaryLines.push({ tool, lines: toolSummary });
  }

  addGitignoreEntry(
    targetPath,
    INTERMEDIATE_DIR,
    "mvagnon-agents",
    !addGitignore,
  );

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

  // Check for unresolved placeholders
  const unresolvedKeys = [...neededKeys].filter((k) => !apiKeys[k]);

  const nextSteps = [];
  let stepNum = 1;

  if (unresolvedKeys.length > 0) {
    nextSteps.push(
      `${stepNum}. Add your ${unresolvedKeys.join(", ")} API key(s) via: npx mvagnon-agents keys`,
    );
    stepNum++;
  }

  if (projectSensitiveFiles.length > 0) {
    nextSteps.push(
      `${stepNum}. Modify the following project-sensitive files to fit your project:`,
    );
    for (const f of projectSensitiveFiles) {
      nextSteps.push(`   - ${f}`);
    }
    stepNum++;
  }

  nextSteps.push(
    `${stepNum}. Add rules, skills, agents, MCPs or plugins based on your needs for each tool.`,
  );
  stepNum++;

  nextSteps.push(`${stepNum}. Configure hooks for linting and formatting.`);

  p.note(nextSteps.join("\n"), "Next Steps");

  const commands = [
    "npx mvagnon-agents <path>    Bootstrap a project with AI tool configs",
    "npx mvagnon-agents manage    Add tools, rules, skills or agents to an existing project",
    "npx mvagnon-agents upgrade   Sync generic resources with the latest package version",
    "npx mvagnon-agents keys      Manage API keys for future bootstraps (~/.config/mvagnon/agents/)",
  ];
  p.note(commands.join("\n"), "Available Commands");

  p.outro("Done");
}

function scanAvailableItems(category) {
  const projectSensitive = [];
  const generic = [];

  const psDir = path.join(CONFIG_DIR, category, "project-sensitive");
  if (fs.existsSync(psDir)) {
    for (const entry of fs.readdirSync(psDir)) {
      if (entry === ".gitkeep") continue;
      projectSensitive.push(entry);
    }
  }

  const genDir = path.join(CONFIG_DIR, category, "generic");
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
  const psSourceDir = path.join(CONFIG_DIR, category, "project-sensitive");
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
  const genSourceDir = path.join(CONFIG_DIR, category, "generic");
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

async function copyConfigWithReplacements(
  source,
  target,
  apiKeys,
  { spinner, projectRoot } = {},
) {
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

  const content = fs.readFileSync(source, "utf-8");
  const replaced = replacePlaceholders(content, apiKeys);
  removePath(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, replaced, "utf-8");
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

function updateGitignore(targetPath, tool, exceptions = false) {
  const gitignorePath = path.join(targetPath, ".gitignore");
  const sectionHeader = `# ${tool.label} Configuration`;
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");

    if (content.includes(sectionHeader)) return;

    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += "\n";
  }

  const entries = exceptions
    ? tool.gitignoreEntries.map((e) => `!${e}`)
    : tool.gitignoreEntries;

  content += sectionHeader + "\n";
  content += entries.join("\n") + "\n";

  fs.writeFileSync(gitignorePath, content);
}

function addGitignoreEntry(
  targetPath,
  entry,
  sectionComment,
  exceptions = false,
) {
  const gitignorePath = path.join(targetPath, ".gitignore");
  const effectiveEntry = exceptions ? `!${entry}` : entry;
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.split("\n").some((line) => line.trim() === effectiveEntry))
      return;
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += "\n";
  }

  if (sectionComment) {
    content += `# ${sectionComment}\n`;
  }
  content += effectiveEntry + "\n";
  fs.writeFileSync(gitignorePath, content);
}

function printUpgradeReport(report) {
  const changed = report.updated.length > 0 || report.removed.length > 0;

  if (!changed) {
    p.log.info("Already up to date.");
  } else {
    if (report.updated.length)
      p.log.success(`Updated: ${report.updated.join(", ")}`);
    if (report.removed.length)
      p.log.warn(`Removed: ${report.removed.join(", ")}`);
  }

  p.outro(changed ? "Project updated" : "Done");
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

    const sourceCatDir = path.join(CONFIG_DIR, category, "generic");

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

    const sourceFile = path.join(CONFIG_DIR, entry);
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
