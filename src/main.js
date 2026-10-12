import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent, Track } from "livekit-client";

const ROOM_KEY = "telador.room";

const gateEl = document.getElementById("gate");
const formEl = document.getElementById("join-form");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const joinError = document.getElementById("join-error");
const controlsEl = document.getElementById("controls");
const roomLabel = document.getElementById("room-label");

function apiBase() {
  // Dentro do Discord o proxy exige /.proxy; fora (dev) usa /api direto.
  return window.location.hostname.endsWith("discordsays.com")
    ? "/.proxy/api"
    : "/api";
}

function normalizeRoom(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

async function connectToRoom(roomName) {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const tokenUrl =
    `${apiBase()}/token?role=viewer&name=espectador&room=${encodeURIComponent(roomName)}`;
  const wsUrl = `wss://${clientId}.discordsays.com/.proxy/livekit`;
  const res = await fetch(tokenUrl);
  const data = await res.json();
  if (!data.token) throw new Error(data.error || "não foi possível entrar");

  const room = new Room({ adaptiveStream: false, dynacast: false });
  const videoEl = document.getElementById("video");
  const audioEl = document.getElementById("audio");
  const menuEl = document.getElementById("menu");
  const listEl = document.getElementById("broadcasters");
  const toggleEl = document.getElementById("toggle");

  let activeTarget = null;
  const volumes = Object.create(null);

  const send = (msg) =>
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true, topic: "telador" }
    );

  function getVolume(name) {
    return volumes[name] ?? 0.8;
  }

  function applyVolume() {
    audioEl.volume = activeTarget ? getVolume(activeTarget) : 0.8;
  }

  function unlockAudio() {
    applyVolume();
    audioEl.play().catch(() => {});
  }

  function setMenuOpen(open) {
    menuEl.classList.toggle("open", open);
    toggleEl.classList.toggle("open", open);
    toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    toggleEl.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    if (open) unlockAudio();
  }

  toggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenuOpen(!menuEl.classList.contains("open"));
  });

  document.addEventListener("click", (e) => {
    if (!controlsEl.contains(e.target)) setMenuOpen(false);
  });

  function leaveRoom() {
    sessionStorage.removeItem(ROOM_KEY);
    room.disconnect();
    location.reload();
  }

  function renderMenu() {
    listEl.innerHTML = "";
    roomLabel.textContent = "Sala: " + roomName;
    let count = 0;

    for (const p of room.remoteParticipants.values()) {
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
        applyVolume();
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
      slider.oninput = () => {
        const v = Number(slider.value) / 100;
        volumes[p.name] = v;
        if (activeTarget === p.name) {
          audioEl.volume = v;
          unlockAudio();
        }
      };

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

    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "stop";
    stop.role = "menuitem";
    stop.textContent = "Parar";
    stop.onclick = () => {
      activeTarget = null;
      send({ type: "present", target: null });
      renderMenu();
    };
    listEl.appendChild(stop);

    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "leave";
    leave.role = "menuitem";
    leave.textContent = "Trocar de sala";
    leave.onclick = leaveRoom;
    listEl.appendChild(leave);
  }

  function attachTrack(track) {
    if (track.kind === Track.Kind.Video || track.kind === "video") {
      track.attach(videoEl);
      videoEl.play().catch(() => {});
    } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
      track.attach(audioEl);
      applyVolume();
      audioEl.play().catch(() => {});
    }
  }

  function detachTrack(track) {
    if (track.kind === Track.Kind.Video || track.kind === "video") {
      track.detach(videoEl);
      videoEl.removeAttribute("src");
      videoEl.load();
    } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
      track.detach(audioEl);
    }
  }

  room.on(RoomEvent.TrackSubscribed, (track) => {
    attachTrack(track);
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

  applyVolume();
  await room.connect(wsUrl, data.token);
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
    joinError.textContent = e.message || "falha ao entrar";
    joinBtn.disabled = false;
    throw e;
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = normalizeRoom(roomInput.value);
  if (!roomName) {
    joinError.textContent = "digite o código da sala";
    return;
  }
  enter(roomName).catch(() => {});
});

const saved = normalizeRoom(sessionStorage.getItem(ROOM_KEY));
if (saved) {
  roomInput.value = saved;
  enter(saved).catch(() => {
    sessionStorage.removeItem(ROOM_KEY);
  });
}
