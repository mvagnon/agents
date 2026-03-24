#!/usr/bin/env node

import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { version: VERSION } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"),
);

const toolsConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "tools.json"), "utf-8"),
);

const CATEGORIES = toolsConfig.categories;

/** Tool definitions keyed by ID, with `value` injected from the key. */
const TOOLS = Object.fromEntries(
  Object.entries(toolsConfig.tools).map(([key, def]) => [
    key,
    { value: key, ...def },
  ]),
);

async function main() {
  const command = process.argv[2];

  if (command === "propagate") {
    const { runPropagate } = await import("./lib/propagate.mjs");
    return runPropagate({ TOOLS, CATEGORIES, VERSION });
  }

  if (!command) {
    console.error("Usage: npx mvagnon-agents <target-path>");
    console.error("       npx mvagnon-agents propagate");
    process.exit(1);
  }

  const targetPath = resolvePath(command);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Directory not found: ${targetPath}`);
    process.exit(1);
  }

  if (!fs.statSync(targetPath).isDirectory()) {
    console.error(`Error: Path must be a directory: ${targetPath}`);
    process.exit(1);
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

  // Step 2: Gitignore question
  const addGitignore = await p.confirm({
    message: "Add agent configs to .gitignore?",
    initialValue: false,
  });
  if (p.isCancel(addGitignore)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  // Step 3: Create tool instances
  const s = p.spinner();
  s.start("Creating tool instances");

  const summaryLines = [];

  for (const tool of selectedTools) {
    const lines = createToolInstance(targetPath, tool);

    updateGitignore(targetPath, tool, addGitignore);
    lines.push(".gitignore: updated");

    summaryLines.push({ tool, lines });
  }

  s.stop("Setup complete");

  for (const { tool, lines } of summaryLines) {
    p.note(lines.join("\n"), `${tool.label} Setup`);
  }

  // Config files reminder
  const configLines = selectedTools
    .filter((t) => t.configFile)
    .map((t) => `  ${t.label}: ${t.configFile}`);
  if (configLines.length > 0) {
    p.note(
      [
        "Don't forget to configure your MCP servers in:",
        ...configLines,
        "",
        "These files are always gitignored for security.",
      ].join("\n"),
      "MCP Configuration",
    );
  }

  p.note(
    "npx mvagnon-agents propagate   Copy one tool's config to other tools",
    "Available Commands",
  );

  p.outro("Done");
}

/**
 * Creates directories, empty root file, and pre-filled config file for a single tool.
 * Returns summary lines describing what was created.
 */
function createToolInstance(projectRoot, tool) {
  const lines = [];

  for (const dirPath of Object.values(tool.paths)) {
    fs.mkdirSync(path.join(projectRoot, dirPath), { recursive: true });
    lines.push(`${dirPath}/: created`);
  }

  // Root file (empty)
  if (tool.rootFile) {
    const destPath = path.join(projectRoot, tool.rootFile);
    if (!fs.existsSync(destPath)) {
      fs.writeFileSync(destPath, "", "utf-8");
      lines.push(`${tool.rootFile}: created`);
    } else {
      lines.push(`${tool.rootFile}: already exists, skipped`);
    }
  }

  // Config file (pre-filled empty structure)
  if (tool.configFile) {
    const configPath = path.join(projectRoot, tool.configFile);
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, renderConfigTemplate(tool), "utf-8");
      lines.push(`${tool.configFile}: created`);
    } else {
      lines.push(`${tool.configFile}: already exists, skipped`);
    }
  }

  return lines;
}

/**
 * Renders a config template to string.
 * JSON config files get pretty-printed from the object; others are used as-is.
 */
function renderConfigTemplate(tool) {
  const tpl = tool.configTemplate;
  if (typeof tpl === "object") {
    return JSON.stringify(tpl, null, 2) + "\n";
  }
  return tpl;
}

/**
 * Updates .gitignore for a tool.
 * Config/MCP files are ALWAYS gitignored.
 * Tool directories and root files are gitignored only if `ignoreAll` is true.
 */
function updateGitignore(projectRoot, tool, ignoreAll) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const sectionHeader = `# ${tool.label} Configuration`;
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.includes(sectionHeader)) return;
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += "\n";
  }

  const entries = [];

  if (ignoreAll) {
    entries.push(...tool.gitignoreEntries);
  }

  // Config file is ALWAYS gitignored
  if (tool.configFile) {
    entries.push(tool.configFile);
  }

  if (entries.length === 0) return;

  content += sectionHeader + "\n";
  content += entries.join("\n") + "\n";

  fs.writeFileSync(gitignorePath, content);
}

function resolvePath(inputPath) {
  if (inputPath.startsWith("~")) {
    inputPath = inputPath.replace("~", process.env.HOME);
  }
  return path.resolve(inputPath);
}

main().catch(console.error);
