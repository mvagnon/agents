import path from "node:path";
import os from "node:os";

export const STABLE_BASE = path.join(
  os.homedir(),
  ".config",
  "mvagnon",
  "agents",
);
