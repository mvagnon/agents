import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { loadApiKeys, replacePlaceholders } from "./apikeys.mjs";
import { readManifest, writeManifest } from "./manifest.mjs";

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

  // --- Resource management (rules, skills, agents in one menu) ---
  const supportedCategories = new Set();
  for (const tool of activeTools) {
    for (const cat of CATEGORIES) {
      if (tool.paths[cat]) supportedCategories.add(cat);
    }
  }

  const allOptions = [];
  for (const category of CATEGORIES) {
    if (!supportedCategories.has(category)) continue;

    const {
      projectSensitive,
      generic,
      depSensitive,
      currentGeneric,
      currentProjectSensitive,
      currentDepSensitive,
    } = scanCurrentState(category, intermediateBase, CONFIG_DIR);

    for (const name of projectSensitive.filter(
      (n) => !currentProjectSensitive.includes(n),
    )) {
      allOptions.push({
        value: `ps:${category}:${name}`,
        label: name,
        hint: `${category} · project-sensitive`,
      });
    }
    for (const name of generic.filter((n) => !currentGeneric.includes(n))) {
      allOptions.push({
        value: `gen:${category}:${name}`,
        label: name,
        hint: category,
      });
    }
    for (const name of depSensitive.filter(
      (n) => !currentDepSensitive.includes(n),
    )) {
      const dep = name.split("-")[0];
      allOptions.push({
        value: `dep:${category}:${name}`,
        label: name,
        hint: `${category} · requires ${dep}`,
      });
    }
  }

  let toAdd = {};

  if (allOptions.length === 0) {
    p.log.info("Resources: nothing new to add");
  } else {
    const selected = await p.multiselect({
      message: "Select resources to add",
      options: allOptions,
      required: false,
    });
    if (p.isCancel(selected)) {
      p.cancel("Manage cancelled");
      process.exit(0);
    }

    // Group selections by category
    for (const val of selected || []) {
      const [type, category, ...nameParts] = val.split(":");
      const name = nameParts.join(":");
      if (!toAdd[category])
        toAdd[category] = {
          projectSensitive: [],
          generic: [],
          depSensitive: [],
        };
      if (type === "ps") toAdd[category].projectSensitive.push(name);
      else if (type === "dep") toAdd[category].depSensitive.push(name);
      else toAdd[category].generic.push(name);
    }

    const manifest = readManifest(intermediateBase);

    for (const category of CATEGORIES) {
      const items = toAdd[category];
      if (
        !items ||
        (items.projectSensitive.length === 0 &&
          items.generic.length === 0 &&
          items.depSensitive.length === 0)
      )
        continue;

      const intermediateDir = path.join(intermediateBase, category);
      if (!manifest.items[category]) manifest.items[category] = {};

      const itemGroups = [
        { items: items.projectSensitive, type: "project-sensitive", sourceSubdir: "project-sensitive" },
        { items: items.generic, type: "generic", sourceSubdir: "generic" },
        { items: items.depSensitive, type: "dep-sensitive", sourceSubdir: "dep-sensitive" },
      ];

      for (const { items: groupItems, type, sourceSubdir } of itemGroups) {
        const sourceDir = path.join(CONFIG_DIR, category, sourceSubdir);

        for (const item of groupItems) {
          const srcPath = path.join(sourceDir, item);
          if (!fs.existsSync(srcPath)) continue;

          fs.mkdirSync(intermediateDir, { recursive: true });
          const intermediatePath = path.join(intermediateDir, item);
          copyPath(srcPath, intermediatePath);
          manifest.items[category][item] = type;

          for (const tool of activeTools) {
            if (!tool.paths[category]) continue;
            const toolDir = path.join(projectRoot, tool.paths[category]);
            fs.mkdirSync(toolDir, { recursive: true });
            createRelativeSymlink(intermediatePath, path.join(toolDir, item));
          }
        }
      }

      const changes = [];
      if (items.projectSensitive.length)
        changes.push(`project-sensitive: ${items.projectSensitive.join(", ")}`);
      if (items.generic.length)
        changes.push(`generic: ${items.generic.join(", ")}`);
      if (items.depSensitive.length)
        changes.push(`dep-sensitive: ${items.depSensitive.join(", ")}`);
      p.log.success(`${capitalize(category)}: ${changes.join(" | ")}`);
    }

    writeManifest(intermediateBase, manifest);
  }

  const projectSensitiveFiles = [];
  for (const category of CATEGORIES) {
    const items = toAdd[category];
    if (!items) continue;
    for (const name of items.projectSensitive || []) {
      projectSensitiveFiles.push(`${category}/${name}`);
    }
  }
  if (projectSensitiveFiles.length > 0) {
    const psLines = [
      "Modify the following project-sensitive files to fit your project:",
    ];
    for (const f of projectSensitiveFiles) {
      psLines.push(`  - ${f}`);
    }
    p.note(psLines.join("\n"), "Project-Sensitive Files");
  }

  const requiredDeps = new Map();
  for (const category of CATEGORIES) {
    const items = toAdd[category];
    if (!items) continue;
    for (const name of items.depSensitive || []) {
      const dep = name.split("-")[0];
      if (!requiredDeps.has(dep)) requiredDeps.set(dep, []);
      requiredDeps.get(dep).push(name);
    }
  }
  if (requiredDeps.size > 0) {
    const depLines = [
      "Ensure the following dependencies are installed in your project:",
    ];
    for (const [dep, items] of requiredDeps) {
      depLines.push(`  - ${dep} (used by: ${items.join(", ")})`);
    }
    p.note(depLines.join("\n"), "Required Dependencies");
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
  // Symlink currently installed items from flat category dirs
  for (const category of categories) {
    if (!tool.paths[category]) continue;

    const catDir = path.join(intermediateBase, category);
    if (!fs.existsSync(catDir)) continue;

    const items = fs.readdirSync(catDir).filter((e) => e !== ".gitkeep");
    if (items.length === 0) continue;

    const toolDir = path.join(projectRoot, tool.paths[category]);
    fs.mkdirSync(toolDir, { recursive: true });

    for (const item of items) {
      createRelativeSymlink(path.join(catDir, item), path.join(toolDir, item));
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
  const depSensitive = [];
  const currentGeneric = [];
  const currentProjectSensitive = [];
  const currentDepSensitive = [];

  // Available items from stable config
  for (const [type, list] of [
    ["project-sensitive", projectSensitive],
    ["generic", generic],
    ["dep-sensitive", depSensitive],
  ]) {
    const dir = path.join(configDir, category, type);
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        if (entry === ".gitkeep") continue;
        list.push(entry);
      }
    }
  }

  // Currently installed items from manifest
  const manifest = readManifest(intermediateBase);
  const manifestItems = manifest.items[category] || {};

  for (const [item, type] of Object.entries(manifestItems)) {
    if (type === "project-sensitive") currentProjectSensitive.push(item);
    else if (type === "generic") currentGeneric.push(item);
    else if (type === "dep-sensitive") currentDepSensitive.push(item);
  }

  return {
    projectSensitive,
    generic,
    depSensitive,
    currentGeneric,
    currentProjectSensitive,
    currentDepSensitive,
  };
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
