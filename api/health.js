import { listTeladorRooms, getRoomService } from "../lib/rooms.js";

export default async function handler(_req, res) {
  const out = {
    ok: true,
    livekit: false,
    rooms: 0,
    time: new Date().toISOString(),
  };

  try {
    const rooms = await listTeladorRooms();
    out.rooms = rooms.length;
  } catch (e) {
    out.ok = false;
    out.roomsError = e.message || "falha ao listar salas";
  }

  try {
    await getRoomService().listRooms();
    out.livekit = true;
  } catch (e) {
    out.ok = false;
    out.livekit = false;
    out.livekitError = e.message || "LiveKit indisponível";
  }

  res.status(out.ok ? 200 : 503).json(out);
}
