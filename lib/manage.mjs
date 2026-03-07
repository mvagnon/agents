import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { loadApiKeys, replacePlaceholders } from "./apikeys.mjs";

export async function runManage({
  TOOLS,
  CATEGORIES,
  INTERMEDIATE_DIR,
  CONFIG_DIR,
  VERSION,
}) {
  const projectRoot = process.cwd();
  const intermediateBase = path.join(projectRoot, INTERMEDIATE_DIR);

  console.clear();
  const banner = [
    "                                    __                             ",
    " _ ____ ____ _ __ _ _ _  ___ _ _   / / __  __ _ _ _  __ _ __ _ ___ ",
    "| '  \\ V / _` / _` | ' \\/ _ \\ ' \\ / / '  \\/ _` | ' \\/ _` / _` / -_)",
    "|_|_|_\\_/\\__,_\\__, |_||_\\___/_||_/_/|_|_|_\\__,_|_||_\\__,_\\__, \\___|",
    "              |___/                                      |___/     ",
  ];
  console.log("\x1b[36m" + banner.join("\n") + "\x1b[0m");
  console.log("\x1b[2m  v" + VERSION + "\x1b[0m\n");

  if (!fs.existsSync(intermediateBase)) {
    p.log.error(`${INTERMEDIATE_DIR}/ not found. Run bootstrap first.`);
    process.exit(1);
  }

  // Detect configured tools by checking for all gitignore entries
  const configuredTools = Object.values(TOOLS).filter((tool) =>
    tool.gitignoreEntries.every((entry) => {
      const trimmed = entry.replace(/^!/, "");
      return fs.existsSync(path.join(projectRoot, trimmed));
    }),
  );

  p.intro(`Add resources → ${projectRoot}`);

  // --- Tool management ---
  const currentToolKeys = new Set(configuredTools.map((t) => t.value));
  const availableTools = Object.values(TOOLS).filter(
    (t) => !currentToolKeys.has(t.value),
  );

  let toolsToAdd = [];
  if (availableTools.length > 0) {
    const selectedToolKeys = await p.multiselect({
      message: "Select tools to add",
      options: availableTools.map((t) => ({
        value: t.value,
        label: t.label,
        hint: t.hint,
      })),
      required: false,
    });
    if (p.isCancel(selectedToolKeys)) {
      p.cancel("Manage cancelled");
      process.exit(0);
    }

    toolsToAdd = selectedToolKeys.map((k) => TOOLS[k]);
  }

  const activeTools = [...configuredTools, ...toolsToAdd];

  const useExceptions = detectGitignoreMode(projectRoot, INTERMEDIATE_DIR);

  for (const tool of toolsToAdd) {
    addTool(
      tool,
      projectRoot,
      intermediateBase,
      CONFIG_DIR,
      CATEGORIES,
      useExceptions,
    );
  }

  if (toolsToAdd.length > 0) {
    p.log.success(`Tools: added ${toolsToAdd.map((t) => t.label).join(", ")}`);
  } else {
    p.log.info("Tools: no changes");
  }

  // --- Category management ---
  const supportedCategories = new Set();
  for (const tool of activeTools) {
    for (const cat of CATEGORIES) {
      if (tool.paths[cat]) supportedCategories.add(cat);
    }
  }

  for (const category of CATEGORIES) {
    if (!supportedCategories.has(category)) continue;

    const {
      projectSensitive,
      generic,
      currentGeneric,
      currentProjectSensitive,
    } = scanCurrentState(category, intermediateBase, CONFIG_DIR);

    const availableProjectSensitive = projectSensitive.filter(
      (name) => !currentProjectSensitive.includes(name),
    );
    const availableGeneric = generic.filter(
      (name) => !currentGeneric.includes(name),
    );

    if (
      availableProjectSensitive.length === 0 &&
      availableGeneric.length === 0
    ) {
      p.log.info(`${capitalize(category)}: no changes`);
      continue;
    }

    let projectToAdd = [];
    if (availableProjectSensitive.length > 0) {
      const psOptions = availableProjectSensitive.map((name) => ({
        value: name,
        label: name,
      }));

      const selectedProjectSensitive = await p.multiselect({
        message: `Select project-sensitive ${category} to add`,
        options: psOptions,
        required: false,
      });
      if (p.isCancel(selectedProjectSensitive)) {
        p.cancel("Manage cancelled");
        process.exit(0);
      }
      projectToAdd = selectedProjectSensitive || [];
    }

    let genericToAdd = [];
    if (availableGeneric.length > 0) {
      const options = availableGeneric.map((name) => ({
        value: name,
        label: name,
      }));

      const selectedGeneric = await p.multiselect({
        message: `Select generic ${category} to add`,
        options,
        required: false,
      });
      if (p.isCancel(selectedGeneric)) {
        p.cancel("Manage cancelled");
        process.exit(0);
      }
      genericToAdd = selectedGeneric || [];
    }

    if (projectToAdd.length === 0 && genericToAdd.length === 0) {
      p.log.info(`${capitalize(category)}: no changes`);
      continue;
    }

    // Apply project-sensitive additions
    const psSourceDir = path.join(CONFIG_DIR, category, "project-sensitive");
    const psIntermediateDir = path.join(intermediateBase, category);

    for (const item of projectToAdd) {
      const srcPath = path.join(psSourceDir, item);
      if (!fs.existsSync(srcPath)) continue;

      fs.mkdirSync(psIntermediateDir, { recursive: true });
      const intermediatePath = path.join(psIntermediateDir, item);
      copyPath(srcPath, intermediatePath);

      for (const tool of activeTools) {
        if (!tool.paths[category]) continue;
        const toolDir = path.join(projectRoot, tool.paths[category]);
        fs.mkdirSync(toolDir, { recursive: true });
        createRelativeSymlink(intermediatePath, path.join(toolDir, item));
      }
    }

    // Apply generic additions
    const genSourceDir = path.join(CONFIG_DIR, category, "generic");
    const genIntermediateDir = path.join(intermediateBase, "generic", category);

    for (const item of genericToAdd) {
      const srcPath = path.join(genSourceDir, item);
      if (!fs.existsSync(srcPath)) continue;

      fs.mkdirSync(genIntermediateDir, { recursive: true });
      const intermediatePath = path.join(genIntermediateDir, item);
      copyPath(srcPath, intermediatePath);

      for (const tool of activeTools) {
        if (!tool.paths[category]) continue;
        const toolDir = path.join(projectRoot, tool.paths[category]);
        fs.mkdirSync(toolDir, { recursive: true });
        createRelativeSymlink(intermediatePath, path.join(toolDir, item));
      }
    }

    const changes = [];
    if (projectToAdd.length)
      changes.push(`project-sensitive added: ${projectToAdd.join(", ")}`);
    if (genericToAdd.length)
      changes.push(`generic added: ${genericToAdd.join(", ")}`);
    p.log.success(`${capitalize(category)}: ${changes.join(" | ")}`);
  }

  p.outro("Done");
}

// --- Tool add/remove ---

function addTool(
  tool,
  projectRoot,
  intermediateBase,
  configDir,
  categories,
  useExceptions = false,
) {
  // Create tool directories
  for (const dir of Object.values(tool.paths)) {
    fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
  }

  // Symlink currently installed items (project-sensitive + generic)
  for (const category of categories) {
    if (!tool.paths[category]) continue;
    const toolDir = path.join(projectRoot, tool.paths[category]);

    // Project-sensitive items
    const psDir = path.join(intermediateBase, category);
    if (fs.existsSync(psDir)) {
      for (const item of fs.readdirSync(psDir)) {
        if (item === ".gitkeep") continue;
        const intermediatePath = path.join(psDir, item);
        if (fs.lstatSync(intermediatePath).isSymbolicLink()) continue;
        createRelativeSymlink(intermediatePath, path.join(toolDir, item));
      }
    }

    // Generic items
    const genDir = path.join(intermediateBase, "generic", category);
    if (fs.existsSync(genDir)) {
      for (const item of fs.readdirSync(genDir)) {
        if (item === ".gitkeep") continue;
        createRelativeSymlink(
          path.join(genDir, item),
          path.join(toolDir, item),
        );
      }
    }
  }

  // Root files (symlink to intermediate copy, create if missing)
  for (const [src, dest] of Object.entries(tool.rootFiles)) {
    const intermediatePath = path.join(intermediateBase, src);
    if (!fs.existsSync(intermediatePath)) {
      const srcPath = path.join(configDir, src);
      if (fs.existsSync(srcPath)) {
        copyPath(srcPath, intermediatePath);
      }
    }
    if (fs.existsSync(intermediatePath)) {
      createRelativeSymlink(intermediatePath, path.join(projectRoot, dest));
    }
  }

  // Config files (copy from stable config with API key replacement)
  const apiKeys = loadApiKeys();
  for (const [src, dest] of Object.entries(tool.configFiles)) {
    const srcPath = path.join(configDir, src);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(projectRoot, dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const content = fs.readFileSync(srcPath, "utf-8");
      const replaced = replacePlaceholders(content, apiKeys);
      removePath(destPath);
      fs.writeFileSync(destPath, replaced, "utf-8");
    }
  }

  // Gitignore
  addGitignoreSection(projectRoot, tool, useExceptions);
}

// --- Gitignore helpers ---

function addGitignoreSection(projectRoot, tool, exceptions = false) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
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

function detectGitignoreMode(projectRoot, intermediateDir) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;
  const content = fs.readFileSync(gitignorePath, "utf-8");
  return content.split("\n").some((l) => l.trim() === `!${intermediateDir}`);
}

// --- Shared helpers ---

function scanCurrentState(category, intermediateBase, configDir) {
  const projectSensitive = [];
  const generic = [];
  const currentGeneric = [];
  const currentProjectSensitive = [];

  // Available project-sensitive items from stable config
  const psDir = path.join(configDir, category, "project-sensitive");
  if (fs.existsSync(psDir)) {
    for (const entry of fs.readdirSync(psDir)) {
      if (entry === ".gitkeep") continue;
      projectSensitive.push(entry);
    }
  }

  // Available generic items from stable config
  const genDir = path.join(configDir, category, "generic");
  if (fs.existsSync(genDir)) {
    for (const entry of fs.readdirSync(genDir)) {
      if (entry === ".gitkeep") continue;
      generic.push(entry);
    }
  }

  // Currently installed generic items
  const currentGenDir = path.join(intermediateBase, "generic", category);
  if (fs.existsSync(currentGenDir)) {
    for (const entry of fs.readdirSync(currentGenDir)) {
      if (entry === ".gitkeep") continue;
      currentGeneric.push(entry);
    }
  }

  // Currently installed project-sensitive items
  const currentPsDir = path.join(intermediateBase, category);
  if (fs.existsSync(currentPsDir)) {
    for (const entry of fs.readdirSync(currentPsDir)) {
      if (entry === ".gitkeep") continue;
      currentProjectSensitive.push(entry);
    }
  }

  return { projectSensitive, generic, currentGeneric, currentProjectSensitive };
}

function removePath(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  } catch {
    // Does not exist
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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
