import { Room, RoomEvent } from "livekit-client";

// Fallback remoto para o Electron: só usar APIs expostas em window.telador.
const T = window.telador;
if (!T?.getConfig || !T?.setStatus || !T?.gesture) {
  console.error("[telador] window.telador incompleto — abortando worker remoto");
} else {
  boot();
}

function boot() {
  let room;
  let sharing = false;
  let cfg;
  let retryTimer = 0;

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = 0;
    }
  }

  function softError(status, message) {
    return status === 400 || status === 401 || status === 403 || status === 404;
  }

  async function connect() {
    const res = await fetch(
      `/api/token?role=broadcaster&name=${encodeURIComponent(cfg.name)}&key=${encodeURIComponent(cfg.key)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      const err = new Error(data.error || "sem token");
      err.status = res.status;
      err.soft = softError(res.status, data.error);
      throw err;
    }

    room = new Room();
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      sharing = false;
      T.setStatus("Conectado");
    });
    room.on(RoomEvent.Disconnected, () => {
      sharing = false;
      T.setStatus("Desconectado, tentando de novo...");
      scheduleRetry(5000);
    });

    const host = import.meta.env.VITE_LIVEKIT_HOST;
    await room.connect(`wss://${host}`, data.token);
    T.setStatus("Conectado · sala " + (data.room || cfg.key));
  }

  function scheduleRetry(ms) {
    clearRetry();
    retryTimer = setTimeout(run, ms);
  }

  async function run() {
    clearRetry();
    try {
      await connect();
    } catch (e) {
      T.setStatus("Erro: " + (e.message || "falha"));
      // Soft errors (código inválido etc.): não martelar retry.
      if (!e.soft) scheduleRetry(5000);
    }
  }

  function onData(payload, _participant, _kind, topic) {
    if (topic !== "telador") return;
    let msg;
    try {
      msg = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return;
    }
    if (msg.type !== "present") return;

    if (msg.target === room.localParticipant.name) T.gesture();
    else stopShare();
  }

  // Chamado pelo Electron após gesto simulado.
  window.__startShare = async () => {
    if (sharing || !room) return;
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
        screenShareSimulcastLayers: [],
        screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 30 },
        degradationPreference: "maintain-resolution",
      }
    );
    sharing = true;
    T.setStatus("Transmitindo");
  };

  async function stopShare() {
    if (!sharing || !room) return;
    await room.localParticipant.setScreenShareEnabled(false);
    sharing = false;
    T.setStatus("Conectado");
  }

  (async () => {
    cfg = await T.getConfig();
    run();
  })();
}
