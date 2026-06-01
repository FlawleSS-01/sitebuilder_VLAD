import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DEPLOY_SERVERS_FILE = path.join(DATA_DIR, "deploy-servers.json");

export interface SavedDeployServer {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  createdAt: string;
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): SavedDeployServer[] {
  ensureDataDir();
  if (!fs.existsSync(DEPLOY_SERVERS_FILE)) {
    fs.writeFileSync(DEPLOY_SERVERS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DEPLOY_SERVERS_FILE, "utf-8"));
    return Array.isArray(raw) ? (raw as SavedDeployServer[]) : [];
  } catch {
    return [];
  }
}

function writeAll(servers: SavedDeployServer[]): void {
  ensureDataDir();
  fs.writeFileSync(DEPLOY_SERVERS_FILE, JSON.stringify(servers, null, 2), "utf-8");
}

export function listDeployServers(): SavedDeployServer[] {
  return readAll();
}

export function upsertDeployServer(input: {
  id?: string;
  label: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
}): SavedDeployServer {
  const all = readAll();
  const id =
    input.id ||
    `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedDeployServer = {
    id,
    label: input.label.trim() || input.host.trim(),
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    remotePath: input.remotePath.trim() || "/",
    createdAt: new Date().toISOString(),
  };
  const idx = all.findIndex((s) => s.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...entry, createdAt: all[idx].createdAt };
  } else {
    all.push(entry);
  }
  writeAll(all);
  return idx >= 0 ? all[idx] : entry;
}

export function getDeployServerById(id: string): SavedDeployServer | null {
  return readAll().find((s) => s.id === id) || null;
}
