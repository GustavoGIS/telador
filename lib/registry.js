import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "rooms.json");
const TMP = path.join("/tmp", "telador-rooms.json");
const UPSTASH_KEY = "telador:rooms";

function g() {
  if (!globalThis.__teladorRoomRegistry) {
    globalThis.__teladorRoomRegistry = { rooms: null };
  }
  return globalThis.__teladorRoomRegistry;
}

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data?.rooms)) return data.rooms.map(String);
  } catch {
    /* ignore */
  }
  return null;
}

function writeJsonFile(filePath, rooms) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ rooms }, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

async function readUpstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(UPSTASH_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result == null) return null;
    const parsed =
      typeof data.result === "string" ? JSON.parse(data.result) : data.result;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

async function writeUpstash(rooms) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", UPSTASH_KEY, JSON.stringify(rooms)]),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function roomsFromEnv() {
  return String(process.env.TELADOR_ROOMS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Carrega o registro persistente de salas (não depende do LiveKit). */
export async function loadRooms() {
  const cache = g();
  if (Array.isArray(cache.rooms)) return [...cache.rooms];

  const fromUpstash = await readUpstash();
  if (fromUpstash) {
    cache.rooms = [...new Set(fromUpstash)].sort();
    return [...cache.rooms];
  }

  const fromTmp = readJsonFile(TMP);
  if (fromTmp) {
    cache.rooms = [...new Set(fromTmp)].sort();
    return [...cache.rooms];
  }

  const fromFile = readJsonFile(FILE);
  if (fromFile) {
    cache.rooms = [...new Set(fromFile)].sort();
    return [...cache.rooms];
  }

  const fromEnv = roomsFromEnv();
  cache.rooms = [...new Set(fromEnv)].sort();
  return [...cache.rooms];
}

/** Salva o registro em todos os backends disponíveis. */
export async function saveRooms(rooms) {
  const unique = [...new Set(rooms.map(String))].sort();
  g().rooms = unique;
  await writeUpstash(unique);
  writeJsonFile(TMP, unique);
  writeJsonFile(FILE, unique);
  return unique;
}
