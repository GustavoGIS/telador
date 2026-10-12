import {
  MAX_ROOMS,
  adminKeyOk,
  createTeladorRoom,
  deleteTeladorRoom,
  listTeladorRooms,
  normalizeRoomName,
} from "../lib/rooms.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    const body =
      req.method === "GET" || req.method === "HEAD" ? {} : await readBody(req);
    const adminKey = body.adminKey || req.query.adminKey;

    if (!adminKeyOk(adminKey)) {
      return res.status(401).json({ error: "chave admin inválida" });
    }

    if (req.method === "GET") {
      const rooms = await listTeladorRooms();
      return res.json({ rooms, max: MAX_ROOMS });
    }

    if (req.method === "POST") {
      const name = normalizeRoomName(body.name || req.query.name);
      if (!name) {
        return res.status(400).json({
          error: "nome inválido (2–32 chars: a-z, 0-9, _ ou -)",
        });
      }
      const result = await createTeladorRoom(name);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.status(201).json({
        name: result.name,
        rooms: result.rooms,
        max: MAX_ROOMS,
      });
    }

    if (req.method === "DELETE") {
      const name = normalizeRoomName(body.name || req.query.name);
      if (!name) {
        return res.status(400).json({ error: "nome inválido" });
      }
      const result = await deleteTeladorRoom(name);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json({ rooms: result.rooms, max: MAX_ROOMS });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "método não permitido" });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro nas salas" });
  }
}
