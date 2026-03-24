import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";

/**
 * Propagates an existing tool's configuration to other tools.
 * Uses symlinks for root file and directory contents (rules, skills, agents).
 * Config/MCP files are created empty (not symlinked) and always gitignored.
 */
export async function runPropagate({ TOOLS, CATEGORIES, VERSION }) {
  const projectRoot = process.cwd();

  console.clear();

  const banner = [
    "                                    __                                  _       ",
    " _ ____ ____ _ __ _ _ _  ___ _ _   / / _ __ _ _ ___ _ __  __ _ __ _ __ _| |_ ___ ",
    "| '  \\ V / _` / _` | ' \\/ _ \\ ' \\ / / '_ \\ '_/ _ \\ '_ \\/ _` / _` / _` |  _/ -_)",
    "|_|_|_\\_/\\__,_\\__, |_||_\\___/_||_/_/| .__/_| \\___/ .__/\\__,_\\__, \\__,_|\\__\\___|",
    "              |___/                 |_|          |_|        |___/                ",
  ];
  console.log("\x1b[36m" + banner.join("\n") + "\x1b[0m");
  console.log("\x1b[2m  v" + VERSION + "\x1b[0m\n");

  const existingTools = detectExistingTools(projectRoot, TOOLS);

  if (existingTools.length === 0) {
    p.log.error(
      "No tool instances found. Run 'npx mvagnon-agents <path>' first.",
    );
    process.exit(1);
  }

  p.intro(`Propagate config → ${projectRoot}`);

  // Determine source tool
  let sourceTool;

  if (existingTools.length === 1) {
    sourceTool = existingTools[0];
    p.log.info(`Source: ${sourceTool.label} (only configured tool)`);
  } else {
    const sourceKey = await p.select({
      message: "Select source tool to propagate from",
      options: existingTools.map((t) => ({
        value: t.value,
        label: t.label,
      })),
    });
    if (p.isCancel(sourceKey)) {
      p.cancel("Cancelled");
      process.exit(0);
    }
    sourceTool = TOOLS[sourceKey];
  }

  // Determine available destinations (tools that do NOT exist yet)
  const existingKeys = new Set(existingTools.map((t) => t.value));
  const availableDestinations = Object.values(TOOLS).filter(
    (t) => !existingKeys.has(t.value),
  );

  if (availableDestinations.length === 0) {
    p.log.error("All tools are already configured. Nothing to propagate to.");
    process.exit(1);
  }

  const destKeys = await p.multiselect({
    message: "Select destination tools",
    options: availableDestinations.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.hint,
    })),
    required: true,
  });
  if (p.isCancel(destKeys)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const destTools = destKeys.map((k) => TOOLS[k]);

  const s = p.spinner();
  s.start("Propagating configuration");

  const sourceGitignored = isSourceGitignored(projectRoot, sourceTool);

  for (const destTool of destTools) {
    propagateToolConfig(projectRoot, sourceTool, destTool, CATEGORIES);
    updateGitignore(projectRoot, destTool, sourceGitignored);
  }

  s.stop("Propagation complete");

  for (const destTool of destTools) {
    const lines = buildSummary(
      projectRoot,
      sourceTool,
      destTool,
      CATEGORIES,
      sourceGitignored,
    );
    p.note(lines.join("\n"), `${destTool.label}`);
  }

  // Config files reminder
  const configLines = destTools
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

  p.outro("Done");
}

/**
 * Detects which tools have existing instances in the project root.
 * A tool "exists" if any of its root files or directories exist.
 */
function detectExistingTools(projectRoot, TOOLS) {
  const found = [];

  for (const tool of Object.values(TOOLS)) {
    const hasRootFile =
      tool.rootFile && fs.existsSync(path.join(projectRoot, tool.rootFile));

    const hasDirectory = Object.values(tool.paths).some((dirPath) => {
      const topDir = dirPath.split("/")[0];
      return fs.existsSync(path.join(projectRoot, topDir));
    });

    const hasToolDir = tool.gitignoreEntries.some((entry) => {
      const fullPath = path.join(projectRoot, entry);
      try {
        return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    if (hasRootFile || hasDirectory || hasToolDir) {
      found.push(tool);
    }
  }

  return found;
}

/**
 * Propagates config from source tool to destination tool.
 * Root file and directory contents use symlinks.
 * Config/MCP file is created empty (not symlinked).
 */
function propagateToolConfig(projectRoot, sourceTool, destTool, categories) {
  // Symlink root file
  if (sourceTool.rootFile && destTool.rootFile) {
    const sourceRootPath = path.join(projectRoot, sourceTool.rootFile);
    const destRootPath = path.join(projectRoot, destTool.rootFile);

    if (fs.existsSync(sourceRootPath) && sourceRootPath !== destRootPath) {
      createRelativeSymlink(sourceRootPath, destRootPath);
    }
  }

  // Symlink directory contents (rules, skills, agents)
  for (const category of categories) {
    const sourceDirRel = sourceTool.paths[category];
    const destDirRel = destTool.paths[category];
    if (!sourceDirRel || !destDirRel) continue;

    const sourceDir = path.join(projectRoot, sourceDirRel);
    const destDir = path.join(projectRoot, destDirRel);
    fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(sourceDir)) {
      symlinkDirectoryContents(sourceDir, destDir);
    }
  }

  // Create remaining directories the dest tool supports
  for (const dirPath of Object.values(destTool.paths)) {
    fs.mkdirSync(path.join(projectRoot, dirPath), { recursive: true });
  }

  // Create config file empty (NOT symlinked)
  if (destTool.configFile) {
    const configPath = path.join(projectRoot, destTool.configFile);
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, renderConfigTemplate(destTool), "utf-8");
    }
  }
}

/**
 * Symlinks each entry from sourceDir into destDir.
 * Each top-level entry (file or directory) becomes a symlink in destDir.
 */
function symlinkDirectoryContents(sourceDir, destDir) {
  for (const entry of fs.readdirSync(sourceDir)) {
    const srcPath = path.join(sourceDir, entry);
    const dstPath = path.join(destDir, entry);
    createRelativeSymlink(srcPath, dstPath);
  }
}

/** Creates a relative symlink from source to target, removing target if it exists. */
function createRelativeSymlink(source, target) {
  removePath(target);
  const relPath = path.relative(path.dirname(target), source);
  fs.symlinkSync(relPath, target);
}

/** Removes a path (file, directory, or symlink). */
function removePath(target) {
  try {
    fs.lstatSync(target);
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Does not exist
  }
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
 * Checks whether the source tool's entries are gitignored.
 * Returns true if any gitignore entry for the source tool exists without a `!` prefix.
 */
function isSourceGitignored(projectRoot, sourceTool) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;

  const lines = fs
    .readFileSync(gitignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim());

  return sourceTool.gitignoreEntries.some(
    (entry) => lines.includes(entry) && !lines.includes(`!${entry}`),
  );
}

/**
 * Updates .gitignore for a destination tool.
 * Config/MCP file is ALWAYS gitignored.
 * Tool directories and root files are gitignored only if the source was gitignored.
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

/** Builds a summary of what was propagated for a single destination tool. */
function buildSummary(
  projectRoot,
  sourceTool,
  destTool,
  categories,
  sourceGitignored,
) {
  const lines = [];

  if (destTool.rootFile && sourceTool.rootFile) {
    const sourceRootPath = path.join(projectRoot, sourceTool.rootFile);
    const destRootPath = path.join(projectRoot, destTool.rootFile);
    if (sourceRootPath !== destRootPath) {
      lines.push(`${destTool.rootFile}: symlinked → ${sourceTool.rootFile}`);
    }
  }

  for (const category of categories) {
    const sourceDirRel = sourceTool.paths[category];
    const destDirRel = destTool.paths[category];
    if (!sourceDirRel || !destDirRel) continue;

    const sourceDir = path.join(projectRoot, sourceDirRel);
    if (fs.existsSync(sourceDir)) {
      const count = fs
        .readdirSync(sourceDir)
        .filter((e) => e !== ".gitkeep").length;
      if (count > 0) {
        lines.push(`${destDirRel}/: ${count} item(s) symlinked → ${sourceDirRel}/`);
      } else {
        lines.push(`${destDirRel}/: created (empty)`);
      }
    } else {
      lines.push(`${destDirRel}/: created (empty)`);
    }
  }

  if (destTool.configFile) {
    lines.push(`${destTool.configFile}: created (empty structure)`);
  }

  lines.push(
    sourceGitignored
      ? ".gitignore: entries added"
      : ".gitignore: config gitignored",
  );

  return lines;
}
