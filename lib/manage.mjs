import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";

export async function runManage({ TOOLS, CATEGORIES, INTERMEDIATE_DIR, STABLE_CONFIG_DIR }) {
  const projectRoot = process.cwd();
  const intermediateBase = path.join(projectRoot, INTERMEDIATE_DIR);

  if (!fs.existsSync(intermediateBase)) {
    console.error(
      `Error: ${INTERMEDIATE_DIR}/ not found. Run bootstrap first.`,
    );
    process.exit(1);
  }

  // Detect configured tools by checking for their directories
  const configuredTools = Object.values(TOOLS).filter((tool) =>
    Object.values(tool.paths).some((dir) =>
      fs.existsSync(path.join(projectRoot, dir)),
    ),
  );

  if (configuredTools.length === 0) {
    console.error("Error: No configured tools detected in this project.");
    process.exit(1);
  }

  p.intro(`Manage → ${projectRoot}`);

  // --- Tool management ---
  const currentToolKeys = new Set(configuredTools.map((t) => t.value));

  const selectedToolKeys = await p.multiselect({
    message: "Select tools",
    options: Object.values(TOOLS).map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.hint,
      initialSelected: currentToolKeys.has(t.value),
    })),
    required: true,
  });
  if (p.isCancel(selectedToolKeys)) {
    p.cancel("Manage cancelled");
    process.exit(0);
  }

  const selectedToolSet = new Set(selectedToolKeys);
  const toolsToAdd = [...selectedToolSet]
    .filter((k) => !currentToolKeys.has(k))
    .map((k) => TOOLS[k]);
  const toolsToRemove = [...currentToolKeys]
    .filter((k) => !selectedToolSet.has(k))
    .map((k) => TOOLS[k]);

  const activeTools = selectedToolKeys.map((k) => TOOLS[k]);

  for (const tool of toolsToAdd) {
    addTool(tool, projectRoot, intermediateBase, STABLE_CONFIG_DIR, CATEGORIES);
  }

  for (const tool of toolsToRemove) {
    removeTool(tool, projectRoot, activeTools);
  }

  if (toolsToAdd.length > 0 || toolsToRemove.length > 0) {
    const changes = [];
    if (toolsToAdd.length)
      changes.push(`added: ${toolsToAdd.map((t) => t.label).join(", ")}`);
    if (toolsToRemove.length)
      changes.push(`removed: ${toolsToRemove.map((t) => t.label).join(", ")}`);
    p.log.success(`Tools: ${changes.join(" | ")}`);
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

    const { projectSensitive, generic, currentGeneric } = scanCurrentState(
      category,
      intermediateBase,
      STABLE_CONFIG_DIR,
    );

    if (projectSensitive.length === 0 && generic.length === 0) continue;

    if (projectSensitive.length > 0) {
      p.note(
        projectSensitive.join(", "),
        `${capitalize(category)} — project-sensitive (always included)`,
      );
    }

    if (generic.length === 0) continue;

    const options = generic.map((name) => ({
      value: name,
      label: name,
      initialSelected: currentGeneric.includes(name),
    }));

    const selected = await p.multiselect({
      message: `Select generic ${category}`,
      options,
      required: false,
    });
    if (p.isCancel(selected)) {
      p.cancel("Manage cancelled");
      process.exit(0);
    }

    const selectedSet = new Set(selected || []);
    const currentSet = new Set(currentGeneric);

    const toAdd = [...selectedSet].filter((x) => !currentSet.has(x));
    const toRemove = [...currentSet].filter((x) => !selectedSet.has(x));

    if (toAdd.length === 0 && toRemove.length === 0) {
      p.log.info(`${capitalize(category)}: no changes`);
      continue;
    }

    // Apply additions
    const genSourceDir = path.join(STABLE_CONFIG_DIR, category, "generic");
    const genIntermediateDir = path.join(intermediateBase, "generic", category);

    for (const item of toAdd) {
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

    // Apply removals
    for (const item of toRemove) {
      const intermediatePath = path.join(genIntermediateDir, item);
      removePath(intermediatePath);

      for (const tool of activeTools) {
        if (!tool.paths[category]) continue;
        const toolPath = path.join(projectRoot, tool.paths[category], item);
        removePath(toolPath);
      }
    }

    const changes = [];
    if (toAdd.length) changes.push(`added: ${toAdd.join(", ")}`);
    if (toRemove.length) changes.push(`removed: ${toRemove.join(", ")}`);
    p.log.success(`${capitalize(category)}: ${changes.join(" | ")}`);
  }

  p.outro("Done");
}

// --- Tool add/remove ---

function addTool(tool, projectRoot, intermediateBase, stableConfigDir, categories) {
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
      const srcPath = path.join(stableConfigDir, src);
      if (fs.existsSync(srcPath)) {
        copyPath(srcPath, intermediatePath);
      }
    }
    if (fs.existsSync(intermediatePath)) {
      createRelativeSymlink(intermediatePath, path.join(projectRoot, dest));
    }
  }

  // Config files (copy from stable config)
  for (const [src, dest] of Object.entries(tool.configFiles)) {
    const srcPath = path.join(stableConfigDir, src);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(projectRoot, dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      copyPath(srcPath, destPath);
    }
  }

  // Gitignore
  addGitignoreSection(projectRoot, tool);
}

function removeTool(tool, projectRoot, remainingTools) {
  // Remove tool directories (symlinks inside)
  for (const dir of Object.values(tool.paths)) {
    removePath(path.join(projectRoot, dir));
  }

  // Remove root files not needed by remaining tools
  const remainingRootDests = new Set();
  for (const rt of remainingTools) {
    for (const dest of Object.values(rt.rootFiles)) {
      remainingRootDests.add(dest);
    }
  }
  for (const dest of Object.values(tool.rootFiles)) {
    if (!remainingRootDests.has(dest)) {
      removePath(path.join(projectRoot, dest));
    }
  }

  // Remove config files
  for (const dest of Object.values(tool.configFiles)) {
    removePath(path.join(projectRoot, dest));
  }

  // Clean up empty parent directories
  const dirsToCheck = new Set();
  for (const dir of Object.values(tool.paths)) {
    const topLevel = dir.split("/")[0];
    if (topLevel) dirsToCheck.add(path.join(projectRoot, topLevel));
  }
  for (const dest of Object.values(tool.configFiles)) {
    const dir = path.dirname(dest);
    if (dir !== ".") dirsToCheck.add(path.join(projectRoot, dir));
  }
  for (const dir of dirsToCheck) {
    removeIfEmpty(dir);
  }

  // Gitignore
  removeGitignoreSection(projectRoot, tool);
}

// --- Gitignore helpers ---

function addGitignoreSection(projectRoot, tool) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
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

function removeGitignoreSection(projectRoot, tool) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return;

  const content = fs.readFileSync(gitignorePath, "utf-8");
  const sectionHeader = `# ${tool.label} Configuration`;
  if (!content.includes(sectionHeader)) return;

  const lines = content.split("\n");
  const headerIdx = lines.findIndex((l) => l === sectionHeader);
  if (headerIdx === -1) return;

  // Remove header + following entries until next blank line, comment, or EOF
  let endIdx = headerIdx + 1;
  while (
    endIdx < lines.length &&
    lines[endIdx].trim() !== "" &&
    !lines[endIdx].startsWith("#")
  ) {
    endIdx++;
  }

  lines.splice(headerIdx, endIdx - headerIdx);

  // Clean up multiple consecutive blank lines
  let result = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (result.length > 0) result += "\n";

  fs.writeFileSync(gitignorePath, result);
}

// --- Shared helpers ---

function scanCurrentState(category, intermediateBase, stableConfigDir) {
  const projectSensitive = [];
  const generic = [];
  const currentGeneric = [];

  // Available project-sensitive items from stable config
  const psDir = path.join(stableConfigDir, category, "project-sensitive");
  if (fs.existsSync(psDir)) {
    for (const entry of fs.readdirSync(psDir)) {
      if (entry === ".gitkeep") continue;
      projectSensitive.push(entry);
    }
  }

  // Available generic items from stable config
  const genDir = path.join(stableConfigDir, category, "generic");
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

  return { projectSensitive, generic, currentGeneric };
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

function removeIfEmpty(dirPath) {
  try {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
      }
    }
  } catch {
    // Ignore errors
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
