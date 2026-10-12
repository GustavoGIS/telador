import { AccessToken } from "livekit-server-sdk";

export default async function handler(req, res) {
  const role = req.query.role === "broadcaster" ? "broadcaster" : "viewer";

  if (role === "broadcaster" && req.query.key !== process.env.TELADOR_KEY) {
    return res.status(401).json({ error: "chave inválida" });
  }

  const name = String(req.query.name || "anon").slice(0, 32);
  const identity = `${name}-${Math.random().toString(36).slice(2, 7)}`;

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity, name, metadata: role }
  );
  at.addGrant({
    room: "galera",
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "broadcaster",
    canPublishData: true,
  });
  res.json({ token: await at.toJwt() });
}