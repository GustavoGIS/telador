import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent } from "livekit-client";

const logEl = document.getElementById("log");
const log = (m) => {
  logEl.textContent += m + "\n";
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
  const barEl = document.getElementById("bar");

  const send = (msg) =>
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true, topic: "telador" }
    );

  function renderBar() {
    barEl.innerHTML = "";
    for (const p of room.remoteParticipants.values()) {
      if (p.metadata !== "broadcaster") continue;
      const b = document.createElement("button");
      b.textContent = (p.isScreenShareEnabled ? "● " : "") + "Tela de " + p.name;
      b.onclick = () => send({ type: "present", target: p.name });
      barEl.appendChild(b);
    }
    const stop = document.createElement("button");
    stop.textContent = "Parar";
    stop.style.background = "rgba(80, 80, 80, 0.9)";
    stop.onclick = () => send({ type: "present", target: null });
    barEl.appendChild(stop);
  }

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === "video") {
      track.attach(videoEl);
      log("Recebendo vídeo");
    }
    renderBar();
  });

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === "video") {
      track.detach(videoEl);
      log("Transmissão encerrada");
    }
    renderBar();
  });

  for (const ev of [
    RoomEvent.ParticipantConnected,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished,
    RoomEvent.TrackUnpublished,
  ]) {
    room.on(ev, renderBar);
  }

  room.on(RoomEvent.Disconnected, () => log("Desconectado"));

  setInterval(() => {
    if (videoEl.videoWidth) {
      document.getElementById("stats").textContent =
        `Recebendo ${videoEl.videoWidth}x${videoEl.videoHeight}`;
    }
  }, 2000);

  await room.connect(wsUrl, token);
  log("Conectado à sala");
  renderBar();
}

start().catch((e) => log("Falha: " + e.message));