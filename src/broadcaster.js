import { Room } from "livekit-client";

const log = (m) => (document.getElementById("log").textContent += m + "\n");

document.getElementById("btn").onclick = async () => {
  try {
    const { token } = await (
      await fetch("/api/token?role=broadcaster&name=teste")
    ).json();

    const room = new Room();
    await room.connect(`wss://${import.meta.env.VITE_LIVEKIT_HOST}`, token);
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