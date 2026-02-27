import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SHARED_DIR =
  process.platform === "darwin"
    ? path.join("/Users", "Shared")
    : path.join(os.homedir(), ".local", "share");

export const STABLE_BASE = path.join(SHARED_DIR, "mvagnon", "agents");
export const STABLE_CONFIG_DIR = path.join(STABLE_BASE, "config");

/**
 * Synchronize package config/ to the stable directory by replacing
 * the entire config folder.
 * macOS: /Users/Shared/mvagnon/agents/config/
 * Linux: ~/.local/share/mvagnon/agents/config/
 * Returns a report object with added, removed file lists and the version.
 */
export function syncConfigToStableDir(packageRoot) {
  const sourceDir = path.join(packageRoot, "config");
  const version = readPackageVersion(packageRoot);

  // Collect existing files for reporting
  const existingFiles = collectFiles(STABLE_CONFIG_DIR);

  // Replace the entire config directory
  fs.rmSync(STABLE_CONFIG_DIR, { recursive: true, force: true });
  fs.cpSync(sourceDir, STABLE_CONFIG_DIR, { recursive: true });

  // Collect new files for reporting
  const newFiles = collectFiles(STABLE_CONFIG_DIR);

  const added = [...newFiles].filter((f) => !existingFiles.has(f));
  const removed = [...existingFiles].filter((f) => !newFiles.has(f));

  if (version) {
    fs.writeFileSync(path.join(STABLE_BASE, "version"), version, "utf-8");
  }

  return { added, updated: [], removed, version };
}

function collectFiles(baseDir) {
  const files = new Set();
  if (!fs.existsSync(baseDir)) return files;
  collectFilesRecursive(baseDir, baseDir, files);
  return files;
}

function collectFilesRecursive(dir, baseDir, files) {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      collectFilesRecursive(fullPath, baseDir, files);
    } else {
      files.add(path.relative(baseDir, fullPath));
    }
  }
}

function readPackageVersion(packageRoot) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    );
    return pkg.version || null;
  } catch {
    return null;
  }
}
