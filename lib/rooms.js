import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

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

export async function listTeladorRooms() {
  const rooms = await getRoomService().listRooms();
  return rooms
    .filter(isTeladorRoom)
    .map((r) => r.name)
    .sort();
}

export async function createTeladorRoom(name) {
  const rooms = await listTeladorRooms();
  if (rooms.includes(name)) {
    return { ok: false, status: 409, error: "sala já existe" };
  }
  if (rooms.length >= MAX_ROOMS) {
    return { ok: false, status: 400, error: `limite de ${MAX_ROOMS} salas` };
  }

  await getRoomService().createRoom({
    name,
    // Mantém a sala registrada mesmo vazia (até alguém apagar ou expirar).
    emptyTimeout: 60 * 60 * 24 * 7,
    departureTimeout: 60 * 60 * 24 * 7,
    metadata: JSON.stringify({ app: "telador" }),
  });

  return { ok: true, name, rooms: await listTeladorRooms() };
}

export async function deleteTeladorRoom(name) {
  const rooms = await listTeladorRooms();
  if (!rooms.includes(name)) {
    return { ok: false, status: 404, error: "sala não encontrada" };
  }
  await getRoomService().deleteRoom(name);
  return { ok: true, rooms: await listTeladorRooms() };
}

export async function assertRoomExists(name) {
  const rooms = await listTeladorRooms();
  return rooms.includes(name);
}

export async function issueToken({ role, displayName, room }) {
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
