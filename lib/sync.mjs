import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const STABLE_BASE = path.join(os.homedir(), "Public", "mvagnon", "agents");
export const STABLE_CONFIG_DIR = path.join(STABLE_BASE, "config");

/**
 * Synchronize package config/ to the stable directory ~/.config/mvagnon-agents/config/.
 * Returns a report object with added, updated, removed file lists and the version.
 */
export function syncConfigToStableDir(packageRoot) {
  const sourceDir = path.join(packageRoot, "config");
  const version = readPackageVersion(packageRoot);

  fs.mkdirSync(STABLE_CONFIG_DIR, { recursive: true });

  const added = [];
  const updated = [];

  copyRecursive(sourceDir, STABLE_CONFIG_DIR, added, updated);

  const removed = cleanOrphanedFiles(sourceDir, STABLE_CONFIG_DIR);

  if (version) {
    fs.writeFileSync(path.join(STABLE_BASE, "version"), version, "utf-8");
  }

  return { added, updated, removed, version };
}

/**
 * Remove files from the stable dir that no longer exist in the package source.
 */
function cleanOrphanedFiles(sourceDir, stableDir) {
  const removed = [];

  if (!fs.existsSync(stableDir)) return removed;

  for (const entry of fs.readdirSync(stableDir)) {
    const stablePath = path.join(stableDir, entry);
    const sourcePath = path.join(sourceDir, entry);

    if (!fs.existsSync(sourcePath)) {
      fs.rmSync(stablePath, { recursive: true, force: true });
      removed.push(path.relative(STABLE_CONFIG_DIR, stablePath));
      continue;
    }

    if (fs.statSync(stablePath).isDirectory()) {
      const nested = cleanOrphanedFiles(sourcePath, stablePath);
      removed.push(...nested);

      // Remove empty directories left behind
      if (
        fs.existsSync(stablePath) &&
        fs.readdirSync(stablePath).length === 0
      ) {
        fs.rmSync(stablePath);
      }
    }
  }

  return removed;
}

function copyRecursive(source, dest, added, updated) {
  if (!fs.existsSync(source)) return;

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(source)) {
    const srcPath = path.join(source, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath, added, updated);
    } else {
      const relativePath = path.relative(STABLE_CONFIG_DIR, destPath);
      const exists = fs.existsSync(destPath);

      if (exists) {
        const srcContent = fs.readFileSync(srcPath);
        const destContent = fs.readFileSync(destPath);
        if (!srcContent.equals(destContent)) {
          fs.copyFileSync(srcPath, destPath);
          updated.push(relativePath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
        added.push(relativePath);
      }
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
