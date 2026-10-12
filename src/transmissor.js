import { Room, RoomEvent } from "livekit-client";

const T = window.telador;
let room;
let sharing = false;
let cfg;

async function connect() {
  const res = await fetch(
    `/api/token?role=broadcaster&name=${encodeURIComponent(cfg.name)}&key=${encodeURIComponent(cfg.key)}`
  );
  const data = await res.json();
  if (!data.token) throw new Error(data.error || "sem token");

  room = new Room();
  room.on(RoomEvent.DataReceived, onData);
  room.on(RoomEvent.LocalTrackUnpublished, () => {
    sharing = false;
    T.setStatus("Conectado");
  });
  room.on(RoomEvent.Disconnected, () => {
    sharing = false;
    T.setStatus("Desconectado, tentando de novo...");
    setTimeout(run, 5000);
  });
  await room.connect(`wss://${import.meta.env.VITE_LIVEKIT_HOST}`, data.token);
  T.setStatus("Conectado · sala " + (data.room || cfg.key));
}

async function run() {
  try {
    await connect();
  } catch (e) {
    T.setStatus("Erro: " + e.message);
    setTimeout(run, 5000);
  }
}

function onData(payload, participant, kind, topic) {
  if (topic !== "telador") return;
  let msg;
  try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
  if (msg.type !== "present") return;

  if (msg.target === room.localParticipant.name) T.gesture(); // pede ao app para iniciar
  else stopShare();
}

// chamado pelo app (com "gesto de usuário" simulado, que o Chromium exige)
window.__startShare = async () => {
  if (sharing) return;
  await room.localParticipant.setScreenShareEnabled(
    true,
    {
      audio: true,
      systemAudio: "include",
      resolution: { width: 1920, height: 1080, frameRate: 30 },
      contentHint: "detail",
    },
    {
      videoCodec: "h264",
      simulcast: false,
      screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 },
      degradationPreference: "maintain-resolution",
    }
  );
  sharing = true;
  T.setStatus("Transmitindo");
};

async function stopShare() {
  if (!sharing) return;
  await room.localParticipant.setScreenShareEnabled(false);
  sharing = false;
  T.setStatus("Conectado");
}

(async () => {
  cfg = await T.getConfig();
  run();
})();