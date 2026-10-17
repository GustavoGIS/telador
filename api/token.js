import {
  assertRoomExists,
  issueToken,
  normalizeRoomName,
} from "../lib/rooms.js";

export default async function handler(req, res) {
  try {
    const role = req.query.role === "broadcaster" ? "broadcaster" : "viewer";
    const displayName = String(req.query.name || "anon").slice(0, 32);

    // Broadcaster: a key da config é o nome da sala.
    // Viewer: passa room= (mesmo nome/chave da sala).
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
      // Soft error: o Transmissor não deve retry agressivo neste caso.
      return res.status(404).json({ error: "sala não encontrada" });
    }

    const token = await issueToken({ role, displayName, room });
    // Contrato estável com Telador Transmissor: { token, room }
    res.json({ token, room });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro ao emitir token" });
  }
}
