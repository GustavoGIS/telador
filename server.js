import "dotenv/config";
import express from "express";
import {
  MAX_ROOMS,
  adminKeyOk,
  assertRoomExists,
  createTeladorRoom,
  deleteTeladorRoom,
  getRoomService,
  issueToken,
  listTeladorRooms,
  normalizeRoomName,
} from "./lib/rooms.js";

const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const out = {
    ok: true,
    livekit: false,
    rooms: 0,
    time: new Date().toISOString(),
  };
  try {
    out.rooms = (await listTeladorRooms()).length;
  } catch (e) {
    out.ok = false;
    out.roomsError = e.message;
  }
  try {
    await getRoomService().listRooms();
    out.livekit = true;
  } catch (e) {
    out.ok = false;
    out.livekit = false;
    out.livekitError = e.message;
  }
  res.status(out.ok ? 200 : 503).json(out);
});

app.get("/api/rooms", async (req, res) => {
  try {
    if (!adminKeyOk(req.query.adminKey)) {
      return res.status(401).json({ error: "chave admin inválida" });
    }
    const rooms = await listTeladorRooms();
    res.json({ rooms, max: MAX_ROOMS });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro nas salas" });
  }
});

app.post("/api/rooms", async (req, res) => {
  try {
    if (!adminKeyOk(req.body.adminKey)) {
      return res.status(401).json({ error: "chave admin inválida" });
    }
    const name = normalizeRoomName(req.body.name);
    if (!name) {
      return res.status(400).json({
        error: "nome inválido (2–32 chars: a-z, 0-9, _ ou -)",
      });
    }
    const result = await createTeladorRoom(name);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ name: result.name, rooms: result.rooms, max: MAX_ROOMS });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro ao criar sala" });
  }
});

app.delete("/api/rooms", async (req, res) => {
  try {
    if (!adminKeyOk(req.body.adminKey || req.query.adminKey)) {
      return res.status(401).json({ error: "chave admin inválida" });
    }
    const name = normalizeRoomName(req.body.name || req.query.name);
    if (!name) return res.status(400).json({ error: "nome inválido" });
    const result = await deleteTeladorRoom(name);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ rooms: result.rooms, max: MAX_ROOMS });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro ao apagar sala" });
  }
});

app.get("/api/token", async (req, res) => {
  try {
    const role = req.query.role === "broadcaster" ? "broadcaster" : "viewer";
    const displayName = String(req.query.name || "anon").slice(0, 32);
    const room = normalizeRoomName(
      role === "broadcaster" ? req.query.key : req.query.room
    );

    if (!room) {
      return res.status(400).json({
        error:
          role === "broadcaster"
            ? "informe a key (nome da sala)"
            : "informe o código da sala",
      });
    }

    if (!(await assertRoomExists(room))) {
      return res.status(404).json({ error: "sala não encontrada" });
    }

    const token = await issueToken({ role, displayName, room });
    res.json({ token, room });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro ao emitir token" });
  }
});

app.listen(3001, () => console.log("Backend em http://localhost:3001"));
