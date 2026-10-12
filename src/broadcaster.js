import { Room } from "livekit-client";

const log = (m) => (document.getElementById("log").textContent += m + "\n");

document.getElementById("btn").onclick = async () => {
  try {
    const key = new URLSearchParams(location.search).get("key") || "";
    log("key na URL: " + (key ? "sim" : "NÃO"));

    const res = await fetch(
      `/api/token?role=broadcaster&name=teste&key=${encodeURIComponent(key)}`
    );
    const data = await res.json();
    log("resposta da API: " + (data.token ? "token ok" : JSON.stringify(data)));
    if (!data.token) return;

    // lê o payload do token só para diagnóstico
    const payload = JSON.parse(atob(data.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    log("token assinado com a API Key: " + payload.iss);
    log("host: " + import.meta.env.VITE_LIVEKIT_HOST);

    const room = new Room();
    await room.connect(`wss://${import.meta.env.VITE_LIVEKIT_HOST}`, data.token);
    log("Conectado");

    const pub = await room.localParticipant.setScreenShareEnabled(
      true,
      {
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

    const s = pub?.track?.mediaStreamTrack.getSettings();
    log(`Transmitindo ${s?.width}x${s?.height} @ ${Math.round(s?.frameRate)}fps`);
  } catch (e) {
    log("ERRO: " + e.message);
  }
};