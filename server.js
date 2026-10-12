import "dotenv/config";
import express from "express";
import { AccessToken } from "livekit-server-sdk";

const app = express();

app.get("/api/token", async (req, res) => {
  const role = req.query.role === "broadcaster" ? "broadcaster" : "viewer";
  const name = String(req.query.name || "anon").slice(0, 32);
  const identity = `${name}-${Math.random().toString(36).slice(2, 7)}`;

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity, name }
  );
  at.addGrant({
    room: "galera",
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "broadcaster",
    canPublishData: true,
  });
  res.json({ token: await at.toJwt() });
});

app.listen(3001, () => console.log("Backend em http://localhost:3001"));