import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { loadRooms, saveRooms } from "./registry.js";

export const MAX_ROOMS = 5;

export function normalizeRoomName(raw) {
  const name = String(raw || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(name)) return null;
  return name;
}

function livekitHttpUrl() {
  const host = process.env.LIVEKIT_HOST || process.env.VITE_LIVEKIT_HOST;
  if (!host) throw new Error("LIVEKIT_HOST não configurado");
  return host.startsWith("http") ? host : `https://${host}`;
}

export function getRoomService() {
  return new RoomServiceClient(
    livekitHttpUrl(),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
}

function isTeladorRoom(room) {
  try {
    return JSON.parse(room.metadata || "{}").app === "telador";
  } catch {
    return false;
  }
}

/** Garante que a sala exista no LiveKit (recria se tiver expirado). */
export async function ensureLiveKitRoom(name) {
  try {
    await getRoomService().createRoom({
      name,
      emptyTimeout: 60 * 60 * 24 * 30,
      departureTimeout: 60 * 60 * 24 * 30,
      metadata: JSON.stringify({ app: "telador" }),
    });
  } catch {
    // Se já existe, createRoom pode falhar ou retornar a existente — ok.
  }
}

export async function listTeladorRooms() {
  let rooms = await loadRooms();

  // Recupera salas ainda vivas no LiveKit (legado sem metadata + registry frio).
  try {
    const lk = await getRoomService().listRooms();
    const fromLk = lk
      .filter(
        (r) => isTeladorRoom(r) || normalizeRoomName(r.name) === r.name
      )
      .map((r) => r.name)
      .filter((n) => n !== "galera");
    if (fromLk.length) {
      const merged = [...new Set([...rooms, ...fromLk])].sort();
      if (merged.join(",") !== rooms.join(",")) {
        rooms = await saveRooms(merged);
      }
    }
  } catch {
    /* LiveKit indisponível — usa só o registry */
  }

  return rooms;
}

export async function createTeladorRoom(name) {
  const rooms = await loadRooms();
  if (rooms.includes(name)) {
    return { ok: false, status: 409, error: "sala já existe" };
  }
  if (rooms.length >= MAX_ROOMS) {
    return { ok: false, status: 400, error: `limite de ${MAX_ROOMS} salas` };
  }

  const next = await saveRooms([...rooms, name]);
  await ensureLiveKitRoom(name);
  return { ok: true, name, rooms: next };
}

export async function deleteTeladorRoom(name) {
  const rooms = await loadRooms();
  if (!rooms.includes(name)) {
    return { ok: false, status: 404, error: "sala não encontrada" };
  }
  const next = await saveRooms(rooms.filter((r) => r !== name));
  try {
    await getRoomService().deleteRoom(name);
  } catch {
    /* sala LiveKit já podia ter expirado */
  }
  return { ok: true, rooms: next };
}

export async function assertRoomExists(name) {
  const rooms = await loadRooms();
  if (rooms.includes(name)) return true;

  // Sala antiga ainda ativa no LiveKit (antes do registry) → importa.
  try {
    const lk = await getRoomService().listRooms([name]);
    if (lk.some((r) => r.name === name)) {
      await saveRooms([...rooms, name]);
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

export async function issueToken({ role, displayName, room }) {
  await ensureLiveKitRoom(room);

  const identity = `${displayName}-${Math.random().toString(36).slice(2, 7)}`;
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity, name: displayName, metadata: role }
  );
  at.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "broadcaster",
    canPublishData: true,
  });
  return at.toJwt();
}

export function adminKeyOk(key) {
  const expected = process.env.TELADOR_KEY;
  return Boolean(expected) && key === expected;
}
