import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent } from "livekit-client";

const logEl = document.getElementById("log");
const log = (m) => {
  logEl.textContent += m + "\n";
  // mantém só as últimas 6 linhas, para o log nunca crescer
  logEl.textContent = logEl.textContent.trim().split("\n").slice(-6).join("\n");
};

async function start() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  log("SDK pronto");

  const tokenUrl = "/.proxy/api/token?role=viewer&name=espectador";
  const wsUrl = `wss://${clientId}.discordsays.com/.proxy/livekit`;

  const { token } = await (await fetch(tokenUrl)).json();
  log("Token recebido");

  const room = new Room({ adaptiveStream: false, dynacast: false });
  const videoEl = document.getElementById("video");

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === "video") {
      track.attach(videoEl);
      log("Recebendo vídeo");
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === "video") {
      track.detach(videoEl);
      log("Transmissão encerrada");
    }
  });

  room.on(RoomEvent.Disconnected, () => log("Desconectado"));

  setInterval(() => {
    if (videoEl.videoWidth) {
      document.getElementById("stats").textContent =
        `Recebendo ${videoEl.videoWidth}x${videoEl.videoHeight}`;
    }
  }, 2000);

  await room.connect(wsUrl, token);
  log("Conectado à sala");
}

start().catch((e) => log("Falha: " + e.message));