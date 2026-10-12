import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent, Track } from "livekit-client";

async function start() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const tokenUrl = "/.proxy/api/token?role=viewer&name=espectador";
  const wsUrl = `wss://${clientId}.discordsays.com/.proxy/livekit`;
  const { token } = await (await fetch(tokenUrl)).json();

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
    if (!document.getElementById("controls").contains(e.target)) {
      setMenuOpen(false);
    }
  });

  function renderMenu() {
    listEl.innerHTML = "";
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
  await room.connect(wsUrl, token);
  renderMenu();
}

start().catch(() => {});
