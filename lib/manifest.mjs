import fs from "node:fs";
import path from "node:path";

const MANIFEST_FILE = "manifest.json";

export function readManifest(intermediateBase) {
  const manifestPath = path.join(intermediateBase, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, items: {} };
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

export function writeManifest(intermediateBase, manifest) {
  const manifestPath = path.join(intermediateBase, MANIFEST_FILE);
  fs.mkdirSync(intermediateBase, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
}
