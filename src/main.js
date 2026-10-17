import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent, Track } from "livekit-client";

const ROOM_KEY = "telador.room";
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const gateEl = document.getElementById("gate");
const formEl = document.getElementById("join-form");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const joinError = document.getElementById("join-error");
const controlsEl = document.getElementById("controls");
const roomLabel = document.getElementById("room-label");
const stageEl = document.getElementById("stage");
const videoEl = document.getElementById("video");
const audioEl = document.getElementById("audio");
const menuEl = document.getElementById("menu");
const listEl = document.getElementById("broadcasters");
const toggleEl = document.getElementById("toggle");
const zoomEl = document.getElementById("zoom");
const zoomFitBtn = document.getElementById("zoom-fit");
const zoomFillBtn = document.getElementById("zoom-fill");

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
const wsUrl = `wss://${clientId}.discordsays.com/.proxy/livekit`;

let sdkReady;
let livekitRoom = null;
let activeTarget = null;
let currentRoomName = null;
let currentAudioTrack = null;
let audioSourceName = null;
const volumes = Object.create(null);

let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragLastX = 0;
let dragLastY = 0;

function apiBase() {
  return window.location.hostname.endsWith("discordsays.com")
    ? "/.proxy/api"
    : "/api";
}

function normalizeRoom(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

async function ensureSdk() {
  if (!sdkReady) {
    const sdk = new DiscordSDK(clientId);
    sdkReady = sdk.ready();
  }
  await sdkReady;
}

function getVolume(name) {
  return volumes[name] ?? 0.8;
}

function applyVolume(name) {
  const key = name || activeTarget || audioSourceName;
  const v = key ? getVolume(key) : 0.8;
  audioEl.volume = v;
  audioEl.muted = v <= 0;
  try {
    currentAudioTrack?.setVolume?.(v);
  } catch {
    /* ignore */
  }
}

function unlockAudio() {
  applyVolume();
  audioEl.muted = false;
  audioEl.play().catch(() => {});
}

function setMenuOpen(open) {
  menuEl.classList.toggle("open", open);
  toggleEl.classList.toggle("open", open);
  toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
  toggleEl.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  if (open) unlockAudio();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function containScale() {
  const vw = videoEl.videoWidth || 1920;
  const vh = videoEl.videoHeight || 1080;
  const sw = stageEl.clientWidth || 1;
  const sh = stageEl.clientHeight || 1;
  return Math.min(sw / vw, sh / vh);
}

function coverScale() {
  const vw = videoEl.videoWidth || 1920;
  const vh = videoEl.videoHeight || 1080;
  const sw = stageEl.clientWidth || 1;
  const sh = stageEl.clientHeight || 1;
  return Math.max(sw / vw, sh / vh);
}

/** Zoom relativo ao modo Fit (contain). Fill = cobrir o painel. */
function fillZoom() {
  const c = containScale();
  if (c <= 0) return 1;
  return clamp(coverScale() / c, ZOOM_MIN, ZOOM_MAX);
}

function clampPan() {
  if (zoom <= 1) {
    panX = 0;
    panY = 0;
    return;
  }
  const sw = stageEl.clientWidth || 1;
  const sh = stageEl.clientHeight || 1;
  const maxX = (sw * (zoom - 1)) / 2;
  const maxY = (sh * (zoom - 1)) / 2;
  panX = clamp(panX, -maxX, maxX);
  panY = clamp(panY, -maxY, maxY);
}

function applyView() {
  clampPan();
  videoEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomEl.value = String(Math.round(zoom * 100));
  stageEl.style.cursor = zoom > 1 ? (dragging ? "grabbing" : "grab") : "default";
}

function setZoom(next, keepCenter = true) {
  const prev = zoom;
  zoom = clamp(next, ZOOM_MIN, ZOOM_MAX);
  if (!keepCenter && prev > 0) {
    const ratio = zoom / prev;
    panX *= ratio;
    panY *= ratio;
  }
  applyView();
}

function resetView() {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyView();
}

function clearMedia() {
  videoEl.removeAttribute("src");
  videoEl.load();
  audioEl.removeAttribute("src");
  audioEl.load();
  resetView();
}

function send(msg) {
  if (!livekitRoom) return;
  livekitRoom.localParticipant.publishData(
    new TextEncoder().encode(JSON.stringify(msg)),
    { reliable: true, topic: "telador" }
  );
}

function renderMenu() {
  listEl.innerHTML = "";
  roomLabel.textContent = currentRoomName ? "Sala: " + currentRoomName : "";
  if (!livekitRoom) return;

  let count = 0;
  for (const p of livekitRoom.remoteParticipants.values()) {
    if (p.metadata !== "broadcaster") continue;
    count++;

    const item = document.createElement("div");
    item.className = "item" + (activeTarget === p.name ? " active" : "");

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.role = "menuitem";
    pick.textContent = (p.isScreenShareEnabled ? "● " : "") + "Tela de " + p.name;
    pick.onclick = () => {
      activeTarget = p.name;
      applyVolume(p.name);
      unlockAudio();
      send({ type: "present", target: p.name });
      renderMenu();
    };

    const volRow = document.createElement("div");
    volRow.className = "volume-row";

    const label = document.createElement("span");
    label.textContent = "Volume";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(getVolume(p.name) * 100));
    slider.setAttribute("aria-label", "Volume de " + p.name);
    const onVol = () => {
      const v = Number(slider.value) / 100;
      volumes[p.name] = v;
      // Aplica sempre que for o stream atual ou o selecionado
      if (activeTarget === p.name || audioSourceName === p.name || !audioSourceName) {
        applyVolume(p.name);
        if (v > 0) unlockAudio();
      }
    };
    slider.oninput = onVol;
    slider.onchange = onVol;

    volRow.append(label, slider);
    item.append(pick, volRow);
    listEl.appendChild(item);
  }

  if (count === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhum transmissor";
    listEl.appendChild(empty);
  }

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "leave";
  leave.role = "menuitem";
  leave.textContent = "Sair da sala";
  leave.onclick = () => {
    leaveRoom();
  };
  listEl.appendChild(leave);
}

function attachTrack(track, participant) {
  if (track.kind === Track.Kind.Video || track.kind === "video") {
    track.attach(videoEl);
    videoEl.play().catch(() => {});
    // Preenche o painel da Activity por padrão (ícones ficam maiores).
    const applyFill = () => {
      panX = 0;
      panY = 0;
      setZoom(fillZoom());
    };
    if (videoEl.videoWidth) applyFill();
    else videoEl.addEventListener("loadedmetadata", applyFill, { once: true });
  } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
    currentAudioTrack = track;
    audioSourceName = participant?.name || activeTarget || audioSourceName;
    track.attach(audioEl);
    applyVolume(audioSourceName);
    unlockAudio();
  }
}

function detachTrack(track) {
  if (track.kind === Track.Kind.Video || track.kind === "video") {
    track.detach(videoEl);
  } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
    track.detach(audioEl);
    if (currentAudioTrack === track) {
      currentAudioTrack = null;
      audioSourceName = null;
    }
  }
}

function bindRoomEvents(room) {
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    attachTrack(track, participant);
    renderMenu();
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    detachTrack(track);
    renderMenu();
  });
  for (const ev of [
    RoomEvent.ParticipantConnected,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished,
    RoomEvent.TrackUnpublished,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
  ]) {
    room.on(ev, renderMenu);
  }
}

async function disconnectLivekit() {
  const room = livekitRoom;
  livekitRoom = null;
  activeTarget = null;
  currentRoomName = null;
  currentAudioTrack = null;
  audioSourceName = null;
  if (room) {
    try {
      await room.disconnect();
    } catch {
      /* ignore */
    }
  }
  clearMedia();
  setMenuOpen(false);
}

async function leaveRoom() {
  sessionStorage.removeItem(ROOM_KEY);
  await disconnectLivekit();
  controlsEl.classList.remove("visible");
  gateEl.classList.remove("hidden");
  joinBtn.disabled = false;
  joinError.textContent = "";
  roomInput.focus();
  roomInput.select();
}

async function connectToRoom(roomName) {
  await ensureSdk();
  await disconnectLivekit();

  const tokenUrl =
    `${apiBase()}/token?role=viewer&name=espectador&room=${encodeURIComponent(roomName)}`;
  const res = await fetch(tokenUrl);
  const data = await res.json();
  if (!data.token) throw new Error(data.error || "não foi possível entrar");

  const room = new Room({ adaptiveStream: false, dynacast: false });
  bindRoomEvents(room);
  applyVolume();
  await room.connect(wsUrl, data.token);

  livekitRoom = room;
  currentRoomName = roomName;
  renderMenu();
}

async function enter(roomName) {
  joinError.textContent = "";
  joinBtn.disabled = true;
  try {
    await connectToRoom(roomName);
    sessionStorage.setItem(ROOM_KEY, roomName);
    gateEl.classList.add("hidden");
    controlsEl.classList.add("visible");
  } catch (e) {
    await disconnectLivekit();
    joinError.textContent = e.message || "falha ao entrar";
    joinBtn.disabled = false;
    gateEl.classList.remove("hidden");
    controlsEl.classList.remove("visible");
    throw e;
  }
}

zoomEl.addEventListener("input", () => {
  setZoom(Number(zoomEl.value) / 100);
});

zoomFitBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  panX = 0;
  panY = 0;
  setZoom(1);
});

zoomFillBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  panX = 0;
  panY = 0;
  setZoom(fillZoom());
});

stageEl.addEventListener(
  "wheel",
  (e) => {
    if (gateEl.classList.contains("hidden") === false) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(zoom * factor, false);
  },
  { passive: false }
);

stageEl.addEventListener("pointerdown", (e) => {
  if (!gateEl.classList.contains("hidden")) return;
  if (e.button !== 0 || zoom <= 1) return;
  dragging = true;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  stageEl.classList.add("panning");
  stageEl.setPointerCapture(e.pointerId);
});

stageEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  panX += e.clientX - dragLastX;
  panY += e.clientY - dragLastY;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  applyView();
});

function endPan(e) {
  if (!dragging) return;
  dragging = false;
  stageEl.classList.remove("panning");
  try {
    stageEl.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  applyView();
}

stageEl.addEventListener("pointerup", endPan);
stageEl.addEventListener("pointercancel", endPan);

stageEl.addEventListener("dblclick", () => {
  if (!gateEl.classList.contains("hidden")) return;
  panX = 0;
  panY = 0;
  setZoom(zoom > 1.05 ? 1 : fillZoom());
});

window.addEventListener("resize", () => applyView());

toggleEl.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(!menuEl.classList.contains("open"));
});

document.addEventListener("click", (e) => {
  if (!controlsEl.contains(e.target)) setMenuOpen(false);
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = normalizeRoom(roomInput.value);
  if (!roomName) {
    joinError.textContent = "digite o código da sala";
    return;
  }
  enter(roomName).catch(() => {});
});

ensureSdk()
  .then(() => {
    const saved = normalizeRoom(sessionStorage.getItem(ROOM_KEY));
    if (saved) {
      roomInput.value = saved;
      return enter(saved).catch(() => {
        sessionStorage.removeItem(ROOM_KEY);
      });
    }
  })
  .catch(() => {});
