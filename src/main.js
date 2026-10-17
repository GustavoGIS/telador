import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Room, RoomEvent, Track, VideoQuality } from "livekit-client";
import { t } from "./i18n.js";

const ROOM_KEY = "telador.room";
const RECENT_KEY = "telador.recentRooms";
const FAV_KEY = "telador.favorites";
const VOL_KEY = "telador.volumes";
const AUTO_KEY = "telador.autoEnter";
const VIEW_KEY = "telador.viewMode";
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const CROWD_N = 10;
const IDLE_MS = 3200;
const HIDDEN_DETACH_MS = 15000;

const qs = new URLSearchParams(location.search);
const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
const livekitHost = import.meta.env.VITE_LIVEKIT_HOST;
const inDiscord = location.hostname.endsWith("discordsays.com");
const forceWatch =
  qs.has("watch") || qs.has("sala") || qs.get("mode") === "watch";

document.body.classList.add(inDiscord ? "mode-discord" : "mode-web");

const landingEl = document.getElementById("landing");
const gateEl = document.getElementById("gate");
const formEl = document.getElementById("join-form");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const joinError = document.getElementById("join-error");
const recentEl = document.getElementById("recent");
const favoritesEl = document.getElementById("favorites");
const recentClear = document.getElementById("recent-clear");
const autoEnterEl = document.getElementById("auto-enter");
const connectingEl = document.getElementById("connecting");
const errorScreen = document.getElementById("error-screen");
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
const leaveBtn = document.getElementById("leave-btn");
const muteBtn = document.getElementById("mute-btn");
const copyBtn = document.getElementById("copy-btn");
const pipBtn = document.getElementById("pip-btn");
const cinemaBtn = document.getElementById("cinema-btn");
const statsBtn = document.getElementById("stats-btn");
const diagBtn = document.getElementById("diag-btn");
const favBtn = document.getElementById("fav-btn");
const qrBtn = document.getElementById("qr-btn");
const menuCloseBtn = document.getElementById("menu-close");
const webMuteBtn = document.getElementById("web-mute");
const webFavBtn = document.getElementById("web-fav");
const webLeaveBtn = document.getElementById("web-leave");
const webFitBtn = document.getElementById("web-fit");
const webFillBtn = document.getElementById("web-fill");
const webFsBtn = document.getElementById("web-fs");
const masterVolEl = document.getElementById("master-volume");
const barDot = document.getElementById("bar-dot");
const barLive = document.getElementById("bar-live");
const barRoom = document.getElementById("bar-room");
const audioMeter = document.getElementById("audio-meter");
const waitingEl = document.getElementById("waiting");
const hudEl = document.getElementById("hud");
const hudRoom = document.getElementById("hud-room");
const hudViewers = document.getElementById("hud-viewers");
const hudStats = document.getElementById("hud-stats");
const liveDot = document.getElementById("live-dot");
const liveText = document.getElementById("live-text");
const overlayWho = document.getElementById("overlay-who");
const toastEl = document.getElementById("toast");
const reconnectEl = document.getElementById("reconnect");

let sdkReady;
let discordSdk = null;
let livekitRoom = null;
let activeTarget = null;
let currentRoomName = null;
let currentAudioTrack = null;
let currentVideoTrack = null;
let audioSourceName = null;
let muted = false;
let cinema = false;
let showStats = false;
let renderScheduled = false;
let toastTimer = 0;
let statsTimer = 0;
let meterTimer = 0;
let idleTimer = 0;
let hiddenDetachTimer = 0;
let menuSignature = "";
let videoPausedForHidden = false;
let videoDetachedHidden = false;
let crowdToastShown = false;
let lastError = null;
let audioCtx = null;
let analyser = null;
let meterData = null;
const volumes = loadJson(VOL_KEY, {});

let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragLastX = 0;
let dragLastY = 0;

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function apiBase() {
  return inDiscord ? "/.proxy/api" : "/api";
}

function livekitWsUrl() {
  if (inDiscord && clientId) {
    return `wss://${clientId}.discordsays.com/.proxy/livekit`;
  }
  return `wss://${livekitHost}`;
}

function normalizeRoom(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function setReconnect(msg) {
  if (!msg) {
    reconnectEl.classList.add("hidden");
    reconnectEl.textContent = "";
    return;
  }
  reconnectEl.textContent = msg;
  reconnectEl.classList.remove("hidden");
}

function fillStaticCopy() {
  document.getElementById("landing-title").textContent = t.landingTitle;
  document.getElementById("landing-body").textContent = t.landingBody;
  document.getElementById("landing-watch").textContent = t.landingCtaWatch;
  document.getElementById("landing-salas").textContent = t.landingCtaSalas;
  document.getElementById("landing-app").textContent = t.landingCtaApp;
  document.getElementById("gate-title").textContent = t.gateTitle;
  document.getElementById("gate-hint").textContent = t.gateHint;
  roomInput.placeholder = t.gatePlaceholder;
  joinBtn.textContent = t.gateEnter;
  document.getElementById("auto-label").textContent = t.gateAuto;
  document.getElementById("recent-title").textContent = t.recentTitle;
  document.getElementById("fav-title").textContent = t.favTitle;
  recentClear.textContent = t.recentClear;
  document.getElementById("connecting-label").textContent = t.gateConnecting;
  document.getElementById("waiting-title").textContent = t.waitingTitle;
  document.getElementById("waiting-body").textContent = t.waitingBody;
  document.getElementById("error-title").textContent = t.errorTitle;
  document.getElementById("error-retry").textContent = t.errorRetry;
  document.getElementById("error-back").textContent = t.errorBack;
  document.getElementById("hud-room-label").textContent = t.room;
  document.getElementById("sec-room").textContent = t.menuRoom;
  document.getElementById("sec-view").textContent = t.menuView;
  document.getElementById("sec-broadcasters").textContent = t.menuBroadcasters;
  document.getElementById("menu-hint").textContent = t.menuHint;
  document.getElementById("menu-shortcuts").textContent = t.menuShortcuts;
  document.getElementById("zoom-label").textContent = t.zoom;
  zoomFitBtn.textContent = t.fit;
  zoomFillBtn.textContent = t.fill;
  if (webFitBtn) webFitBtn.textContent = t.fit;
  if (webFillBtn) webFillBtn.textContent = t.fill;
  document.getElementById("copy-label").textContent = t.copyCode;
  document.getElementById("pip-label").textContent = t.pip;
  document.getElementById("cinema-label").textContent = t.cinemaOn;
  document.getElementById("stats-label").textContent = t.stats;
  document.getElementById("diag-label").textContent = t.diagCopy;
  document.getElementById("fav-label").textContent = t.favorite;
  document.getElementById("leave-label").textContent = t.leave;
  document.getElementById("mute-label").textContent = t.soundOn;
  menuCloseBtn?.setAttribute("aria-label", t.menuClose);
  toggleEl.setAttribute("aria-label", t.menuMore);
  webFsBtn?.setAttribute("aria-label", t.fullscreen);
  updateFavBtn();
  syncMuteUi();
}

function recentRooms() {
  const list = loadJson(RECENT_KEY, []);
  return Array.isArray(list) ? list.map(normalizeRoom).filter(Boolean) : [];
}

function favRooms() {
  const list = loadJson(FAV_KEY, []);
  return Array.isArray(list) ? list.map(normalizeRoom).filter(Boolean) : [];
}

function isFav(name) {
  return favRooms().includes(name);
}

function toggleFav(name) {
  if (!name) return;
  const list = favRooms();
  saveJson(
    FAV_KEY,
    isFav(name) ? list.filter((r) => r !== name) : [name, ...list].slice(0, 8)
  );
  updateFavBtn();
  renderRecent();
}

function updateFavBtn() {
  const on = Boolean(currentRoomName && isFav(currentRoomName));
  for (const btn of [favBtn, webFavBtn]) {
    if (!btn) continue;
    btn.classList.toggle("is-on", on);
    btn.title = on ? t.unfavorite : t.favorite;
    btn.setAttribute("aria-label", on ? t.unfavorite : t.favorite);
  }
  const favLabel = document.getElementById("fav-label");
  if (favLabel) favLabel.textContent = on ? t.unfavorite : t.favorite;
}

function pushRecent(name) {
  saveJson(RECENT_KEY, [name, ...recentRooms().filter((r) => r !== name)].slice(0, 6));
  renderRecent();
}

function removeRecent(name) {
  saveJson(
    RECENT_KEY,
    recentRooms().filter((r) => r !== name)
  );
  renderRecent();
}

function renderChipList(el, names, asFav) {
  el.innerHTML = "";
  for (const name of names) {
    const chip = document.createElement("div");
    chip.className = "chip" + (asFav || isFav(name) ? " fav" : "");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "go";
    go.textContent = name;
    go.onclick = () => {
      roomInput.value = name;
      enter(name).catch(() => {});
    };
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.setAttribute("aria-label", t.recentRemove);
    x.textContent = "×";
    x.onclick = (e) => {
      e.stopPropagation();
      if (asFav) {
        toggleFav(name);
      } else {
        removeRecent(name);
      }
    };
    chip.append(go, x);
    el.appendChild(chip);
  }
}

function renderRecent() {
  renderChipList(favoritesEl, favRooms(), true);
  renderChipList(
    recentEl,
    recentRooms().filter((n) => !isFav(n)),
    false
  );
}

async function ensureSdk() {
  if (!inDiscord) return;
  if (!sdkReady) {
    discordSdk = new DiscordSDK(clientId);
    sdkReady = discordSdk.ready().then(async () => {
      // P6: qualidade conforme layout Discord (PIP/grid/focused)
      try {
        const handler = (update) => {
          const mode = update?.layout_mode;
          applyLayoutQuality(mode);
        };
        if (discordSdk.subscribeToLayoutModeUpdatesCompat) {
          discordSdk.subscribeToLayoutModeUpdatesCompat(handler);
        } else {
          discordSdk.subscribe("ACTIVITY_LAYOUT_MODE_UPDATE", handler);
        }
      } catch {
        /* clientes antigos */
      }
    });
  }
  await sdkReady;
}

/** Prioridade: sempre camada máxima (1080p). Layout Discord não reduz qualidade. */
function preferMaxVideoQuality(room = livekitRoom) {
  if (!room) return;
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === Track.Kind.Video && pub.setVideoQuality) {
        try {
          pub.setVideoQuality(VideoQuality.HIGH);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function applyLayoutQuality(_mode) {
  preferMaxVideoQuality();
}

function bumpIdle() {
  document.body.classList.remove("idle-chrome");
  clearTimeout(idleTimer);
  if (!controlsEl.classList.contains("visible") || cinema) return;
  idleTimer = setTimeout(() => {
    if (!menuEl.classList.contains("open")) {
      document.body.classList.add("idle-chrome");
    }
  }, IDLE_MS);
}

function setConnecting(on) {
  connectingEl.classList.toggle("hidden", !on);
  joinBtn.classList.toggle("hidden", on);
}

function showError(msg, roomAttempt) {
  lastError = { msg, roomAttempt };
  document.getElementById("error-body").textContent = msg;
  errorScreen.classList.remove("hidden");
  gateEl.classList.add("hidden");
}

function hideError() {
  errorScreen.classList.add("hidden");
  lastError = null;
}

function warmupLivekit() {
  // P9: aquecer DNS/TLS do host LiveKit
  const host = inDiscord && clientId
    ? `${clientId}.discordsays.com`
    : livekitHost;
  if (!host) return;
  try {
    fetch(`https://${host}/`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function startMeter(track) {
  stopMeter();
  try {
    const stream = track?.mediaStream;
    if (!stream) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    meterData = new Uint8Array(analyser.frequencyBinCount);
    meterTimer = setInterval(() => {
      if (!analyser || !audioMeter) return;
      analyser.getByteFrequencyData(meterData);
      let sum = 0;
      for (let i = 0; i < meterData.length; i++) sum += meterData[i];
      const avg = sum / meterData.length / 255;
      const pct = Math.min(100, Math.round(avg * 140));
      audioMeter.querySelector("i").style.width = pct + "%";
    }, 80); // P7: UI meter ~12 Hz
  } catch {
    /* ignore */
  }
}

function stopMeter() {
  clearInterval(meterTimer);
  meterTimer = 0;
  try {
    audioCtx?.close();
  } catch {
    /* ignore */
  }
  audioCtx = null;
  analyser = null;
  if (audioMeter) audioMeter.querySelector("i").style.width = "0%";
}

function copyDiagnostics() {
  const payload = {
    room: currentRoomName,
    activeTarget,
    participants: livekitRoom ? participantCount() : 0,
    video: videoEl.videoWidth
      ? `${videoEl.videoWidth}x${videoEl.videoHeight}`
      : null,
    muted,
    cinema,
    inDiscord,
    ua: navigator.userAgent,
    href: location.href,
    time: new Date().toISOString(),
  };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(
    () => toast(t.diagCopied),
    () => toast(t.copyFail)
  );
}

function maybeCrowdToast() {
  const n = participantCount();
  if (n >= CROWD_N && !crowdToastShown) {
    crowdToastShown = true;
    toast(t.crowdToast);
  }
  if (n < CROWD_N) crowdToastShown = false;
}

function applyPreferredView() {
  panX = 0;
  panY = 0;
  if ((localStorage.getItem(VIEW_KEY) || "fill") === "fit") setZoom(1);
  else setZoom(fillZoom());
}

function getVolume(name) {
  return volumes[name] ?? 0.8;
}

function applyVolume(name) {
  const key = name || activeTarget || audioSourceName;
  const v = muted ? 0 : key ? getVolume(key) : 0.8;
  audioEl.volume = Math.max(0, Math.min(1, v));
  audioEl.muted = muted || v <= 0;
  try {
    currentAudioTrack?.setVolume?.(muted ? 0 : v);
  } catch {
    /* ignore */
  }
  syncMuteUi();
  syncMasterVolume();
}

function syncMuteUi() {
  const label = muted ? t.soundOff : t.soundOn;
  for (const btn of [muteBtn, webMuteBtn]) {
    if (!btn) continue;
    btn.classList.toggle("is-muted", muted);
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }
  const muteLabel = document.getElementById("mute-label");
  if (muteLabel) muteLabel.textContent = label;
}

function syncMasterVolume() {
  if (!masterVolEl) return;
  const key = audioSourceName || activeTarget;
  const v = key ? getVolume(key) : Number(masterVolEl.value) / 100 || 0.8;
  masterVolEl.value = String(Math.round((muted ? 0 : v) * 100));
}

function setMuted(next) {
  muted = next;
  applyVolume();
  if (!muted) unlockAudio();
}

function unlockAudio() {
  if (!muted) applyVolume();
  audioEl.play().catch(() => {});
}

function setMenuOpen(open) {
  menuEl.classList.toggle("open", open);
  toggleEl.classList.toggle("open", open);
  toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    controlsEl.classList.add("force");
    unlockAudio();
  } else {
    controlsEl.classList.remove("force");
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function containScale() {
  const vw = videoEl.videoWidth || 1920;
  const vh = videoEl.videoHeight || 1080;
  return Math.min((stageEl.clientWidth || 1) / vw, (stageEl.clientHeight || 1) / vh);
}

function coverScale() {
  const vw = videoEl.videoWidth || 1920;
  const vh = videoEl.videoHeight || 1080;
  return Math.max((stageEl.clientWidth || 1) / vw, (stageEl.clientHeight || 1) / vh);
}

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
  panX = clamp(panX, -(sw * (zoom - 1)) / 2, (sw * (zoom - 1)) / 2);
  panY = clamp(panY, -(sh * (zoom - 1)) / 2, (sh * (zoom - 1)) / 2);
}

function applyView() {
  clampPan();
  videoEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomEl.value = String(Math.round(zoom * 100));
  stageEl.classList.toggle("can-pan", zoom > 1);
  stageEl.classList.toggle("panning", dragging);
}

function setZoom(next, keepCenter = true) {
  const prev = zoom;
  zoom = clamp(next, ZOOM_MIN, ZOOM_MAX);
  if (!keepCenter && prev > 0) {
    panX *= zoom / prev;
    panY *= zoom / prev;
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
  try {
    currentVideoTrack?.detach(videoEl);
  } catch {
    /* ignore */
  }
  try {
    currentAudioTrack?.detach(audioEl);
  } catch {
    /* ignore */
  }
  currentVideoTrack = null;
  currentAudioTrack = null;
  audioSourceName = null;
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

function isBroadcaster(p) {
  if (!p) return false;
  if (p.metadata === "broadcaster") return true;
  try {
    const meta = JSON.parse(p.metadata || "{}");
    if (meta.role === "broadcaster") return true;
  } catch {
    /* ignore */
  }
  if (p.isScreenShareEnabled) return true;
  for (const pub of p.trackPublications.values()) {
    if (
      pub.source === Track.Source.ScreenShare ||
      pub.source === Track.Source.ScreenShareAudio
    ) {
      return true;
    }
  }
  return false;
}

function hasLiveVideo() {
  return Boolean(currentVideoTrack && !currentVideoTrack.isMuted);
}

function participantCount() {
  if (!livekitRoom) return 0;
  return 1 + livekitRoom.remoteParticipants.size;
}

function updateHud() {
  const live = hasLiveVideo();
  waitingEl.classList.toggle("visible", Boolean(livekitRoom) && !live);
  hudEl.classList.toggle("visible", Boolean(livekitRoom) && inDiscord);
  hudRoom.textContent = currentRoomName || "—";
  hudViewers.textContent = `${t.viewers}: ${participantCount()}`;
  liveDot.className = "dot " + (live ? "live" : "wait");
  liveText.textContent = live ? t.live : t.waiting;
  overlayWho.textContent = activeTarget ? activeTarget : "";
  stageEl.classList.toggle("show-overlay", live);
  if (barDot) barDot.className = "dot " + (live ? "live" : "wait");
  if (barLive) barLive.textContent = live ? t.live : t.waiting;
  if (barRoom) barRoom.textContent = currentRoomName || "—";
  maybeCrowdToast();
  updateFavBtn();
  syncMasterVolume();
}

let statsFrameSample = { frames: 0, at: 0 };

function updateStats() {
  if (!showStats || !videoEl.videoWidth) {
    hudStats.classList.add("hidden");
    return;
  }
  hudStats.classList.remove("hidden");
  let fpsLabel = "";
  try {
    const q = videoEl.getVideoPlaybackQuality?.();
    if (q) {
      const now = performance.now();
      const df = q.totalVideoFrames - statsFrameSample.frames;
      const dt = (now - statsFrameSample.at) / 1000;
      if (statsFrameSample.at && dt > 0.4) {
        fpsLabel = ` · ${Math.round(df / dt)}fps`;
      }
      statsFrameSample = { frames: q.totalVideoFrames, at: now };
    }
  } catch {
    /* ignore */
  }
  const trackFps = currentVideoTrack?.mediaStreamTrack?.getSettings?.()?.frameRate;
  if (!fpsLabel && trackFps) fpsLabel = ` · ~${Math.round(trackFps)}fps`;
  hudStats.textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}${fpsLabel}`;
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderMenu();
    updateHud();
    updateStats();
  });
}

function broadcasterSignature() {
  if (!livekitRoom) return "";
  const parts = [];
  for (const p of livekitRoom.remoteParticipants.values()) {
    if (!isBroadcaster(p)) continue;
    parts.push(
      `${p.identity}|${p.name}|${p.isScreenShareEnabled ? 1 : 0}|${activeTarget === p.name ? 1 : 0}`
    );
  }
  return parts.sort().join(";") + `|m:${muted}|c:${cinema}|s:${showStats}`;
}

function renderMenu() {
  const sig = broadcasterSignature();
  // Evita reconstruir sliders se nada relevante mudou (P3)
  if (sig === menuSignature && listEl.childElementCount) {
    roomLabel.textContent = currentRoomName ? `${t.room}: ${currentRoomName}` : "";
    return;
  }
  menuSignature = sig;

  listEl.innerHTML = "";
  roomLabel.textContent = currentRoomName ? `${t.room}: ${currentRoomName}` : "";
  if (!livekitRoom) return;

  let count = 0;
  for (const p of livekitRoom.remoteParticipants.values()) {
    if (!isBroadcaster(p)) continue;
    count++;
    const item = document.createElement("div");
    item.className = "item" + (activeTarget === p.name ? " active" : "");

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.role = "menuitem";
    const live = p.isScreenShareEnabled;
    pick.innerHTML = `<span class="live-mark${live ? " on" : ""}" aria-hidden="true"></span><span>${escapeHtml(p.name)}<div class="meta">${live ? t.transmitting : t.connected}</div></span>`;
    pick.onclick = () => {
      activeTarget = p.name;
      applyVolume(p.name);
      unlockAudio();
      send({ type: "present", target: p.name });
      toast(`${t.requestSent} ${p.name}`);
      menuSignature = "";
      scheduleRender();
    };

    const volRow = document.createElement("div");
    volRow.className = "volume-row";
    const label = document.createElement("span");
    label.textContent = t.volume;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(getVolume(p.name) * 100));
    slider.setAttribute("aria-label", `${t.volume} ${p.name}`);
    const onVol = () => {
      volumes[p.name] = Number(slider.value) / 100;
      saveJson(VOL_KEY, volumes);
      if (activeTarget === p.name || audioSourceName === p.name || !audioSourceName) {
        muted = false;
        applyVolume(p.name);
        if (volumes[p.name] > 0) unlockAudio();
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
    empty.textContent = t.noBroadcaster;
    listEl.appendChild(empty);
  }
}

function preferScreenShare(publication) {
  const source = publication?.source;
  if (source === Track.Source.Camera || source === Track.Source.Microphone) return false;
  return true;
}

function attachTrack(track, publication, participant) {
  if (!preferScreenShare(publication)) return;

  if (track.kind === Track.Kind.Video || track.kind === "video") {
    if (publication?.setVideoQuality) {
      try {
        publication.setVideoQuality(VideoQuality.HIGH);
      } catch {
        /* ignore */
      }
    }
    if (currentVideoTrack && currentVideoTrack !== track) {
      try {
        currentVideoTrack.detach(videoEl);
      } catch {
        /* ignore */
      }
    }
    currentVideoTrack = track;
    videoDetachedHidden = false;
    track.attach(videoEl);
    if (!videoPausedForHidden) videoEl.play().catch(() => {});
    const applyPref = () => applyPreferredView();
    if (videoEl.videoWidth) applyPref();
    else videoEl.addEventListener("loadedmetadata", applyPref, { once: true });
  } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
    if (currentAudioTrack && currentAudioTrack !== track) {
      try {
        currentAudioTrack.detach(audioEl);
      } catch {
        /* ignore */
      }
    }
    currentAudioTrack = track;
    audioSourceName = participant?.name || activeTarget || audioSourceName;
    track.attach(audioEl);
    applyVolume(audioSourceName);
    unlockAudio();
    startMeter(track);
  }
  updateHud();
}

function detachTrack(track) {
  if (track.kind === Track.Kind.Video || track.kind === "video") {
    track.detach(videoEl);
    if (currentVideoTrack === track) currentVideoTrack = null;
  } else if (track.kind === Track.Kind.Audio || track.kind === "audio") {
    track.detach(audioEl);
    if (currentAudioTrack === track) {
      currentAudioTrack = null;
      audioSourceName = null;
      stopMeter();
    }
  }
  updateHud();
}

function remountParticipant(participant) {
  if (!participant) return;
  for (const pub of participant.trackPublications.values()) {
    if (!pub.track || !pub.isSubscribed) continue;
    try {
      pub.track.detach();
    } catch {
      /* ignore */
    }
    attachTrack(pub.track, pub, participant);
  }
  toast(t.sourceUpdated);
  menuSignature = "";
  scheduleRender();
}

function onData(payload, participant, _kind, topic) {
  if (topic !== "telador") return;
  let msg;
  try {
    msg = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return;
  }
  if (msg.type === "source-switch") remountParticipant(participant);
}

function bindRoomEvents(room) {
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    attachTrack(track, publication, participant);
    menuSignature = "";
    scheduleRender();
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    detachTrack(track);
    menuSignature = "";
    scheduleRender();
  });
  room.on(RoomEvent.DataReceived, onData);
  room.on(RoomEvent.ParticipantMetadataChanged, (_md, participant) => {
    if (String(participant?.metadata || "").includes("teladorSwitch")) {
      remountParticipant(participant);
    } else {
      menuSignature = "";
      scheduleRender();
    }
  });
  for (const ev of [
    RoomEvent.ParticipantConnected,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished,
    RoomEvent.TrackUnpublished,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
  ]) {
    room.on(ev, () => {
      menuSignature = "";
      scheduleRender();
    });
  }
  room.on(RoomEvent.Reconnecting, () => setReconnect(t.reconnecting));
  room.on(RoomEvent.Reconnected, () => {
    setReconnect("");
    toast(t.reconnected);
  });
  room.on(RoomEvent.Disconnected, () => {
    setReconnect("");
    toast(t.disconnected);
    updateHud();
  });
}

async function disconnectLivekit() {
  const room = livekitRoom;
  livekitRoom = null;
  activeTarget = null;
  currentRoomName = null;
  menuSignature = "";
  if (room) {
    try {
      await room.disconnect();
    } catch {
      /* ignore */
    }
  }
  clearMedia();
  stopMeter();
  setMenuOpen(false);
  updateHud();
}

async function leaveRoom() {
  if (livekitRoom && !confirm(t.leaveConfirm)) return;
  sessionStorage.removeItem(ROOM_KEY);
  await disconnectLivekit();
  stopMeter();
  crowdToastShown = false;
  controlsEl.classList.remove("visible");
  document.body.classList.remove("idle-chrome");
  hideError();
  gateEl.classList.remove("hidden");
  joinBtn.disabled = false;
  setConnecting(false);
  joinError.textContent = "";
  roomInput.focus();
}

async function connectToRoom(roomName) {
  const sdkPromise = ensureSdk();
  const tokenUrl = `${apiBase()}/token?role=viewer&name=espectador&room=${encodeURIComponent(roomName)}`;
  const tokenPromise = fetch(tokenUrl).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      const err = new Error(data.error || t.gateErrorFail);
      if (res.status === 404) err.message = t.emptyRoomInvalid;
      throw err;
    }
    return data;
  });

  await disconnectLivekit();
  const [, data] = await Promise.all([sdkPromise, tokenPromise]);

  // adaptiveStream OFF: no painel pequeno do Discord ele pedia resolução baixa
  // e o zoom ficava mole. Queremos sempre o bitstream 1080p30 do transmissor.
  const room = new Room({
    adaptiveStream: false,
    dynacast: true,
  });

  bindRoomEvents(room);
  applyVolume();
  await room.connect(livekitWsUrl(), data.token);
  preferMaxVideoQuality(room);

  livekitRoom = room;
  currentRoomName = roomName;

  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.isSubscribed && pub.track) attachTrack(pub.track, pub, p);
    }
  }
  scheduleRender();
}

async function enter(roomName) {
  joinError.textContent = "";
  joinBtn.disabled = true;
  setConnecting(true);
  hideError();
  try {
    await connectToRoom(roomName);
    sessionStorage.setItem(ROOM_KEY, roomName);
    pushRecent(roomName);
    gateEl.classList.add("hidden");
    controlsEl.classList.add("visible");
    landingEl.classList.add("hidden");
    setConnecting(false);
    joinBtn.disabled = false;
    bumpIdle();
    toast(`${t.entered} ${roomName}`);
  } catch (e) {
    await disconnectLivekit();
    setConnecting(false);
    joinBtn.disabled = false;
    joinError.textContent = e.message || t.gateErrorFail;
    showError(e.message || t.gateErrorFail, roomName);
    controlsEl.classList.remove("visible");
    throw e;
  }
}

function setCinema(on) {
  cinema = on;
  document.body.classList.toggle("cinema", cinema);
  cinemaBtn?.classList.toggle("is-on", cinema);
  if (cinema) setMenuOpen(false);
}

function setStats(on) {
  showStats = on;
  statsBtn?.classList.toggle("is-on", showStats);
  if (showStats) {
    updateStats();
    clearInterval(statsTimer);
    statsTimer = setInterval(updateStats, 1500);
  } else {
    clearInterval(statsTimer);
    hudStats.classList.add("hidden");
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  } catch {
    toast(t.pipFail);
  }
}

async function togglePip() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    if (!videoEl.srcObject && !videoEl.src) throw new Error("no video");
    await videoEl.requestPictureInPicture();
  } catch {
    toast(t.pipFail);
  }
}

function showLanding() {
  landingEl.classList.remove("hidden");
  gateEl.classList.add("hidden");
  controlsEl.classList.remove("visible");
}

function showGate() {
  landingEl.classList.add("hidden");
  gateEl.classList.remove("hidden");
}

// —— eventos UI ——
fillStaticCopy();
autoEnterEl.checked = localStorage.getItem(AUTO_KEY) === "1";
autoEnterEl.addEventListener("change", () => {
  localStorage.setItem(AUTO_KEY, autoEnterEl.checked ? "1" : "0");
});

document.getElementById("landing-watch").onclick = () => {
  history.replaceState({}, "", "?watch=1");
  showGate();
  roomInput.focus();
};

recentClear.onclick = () => {
  saveJson(RECENT_KEY, []);
  renderRecent();
};

zoomEl.addEventListener("input", () => setZoom(Number(zoomEl.value) / 100));
function syncViewSeg() {
  const mode = localStorage.getItem(VIEW_KEY) || "fill";
  zoomFitBtn?.classList.toggle("on", mode === "fit");
  zoomFillBtn?.classList.toggle("on", mode === "fill");
  webFitBtn?.classList.toggle("on", mode === "fit");
  webFillBtn?.classList.toggle("on", mode === "fill");
}

zoomFitBtn.onclick = (e) => {
  e.stopPropagation();
  localStorage.setItem(VIEW_KEY, "fit");
  panX = 0;
  panY = 0;
  setZoom(1);
  syncViewSeg();
};
zoomFillBtn.onclick = (e) => {
  e.stopPropagation();
  localStorage.setItem(VIEW_KEY, "fill");
  panX = 0;
  panY = 0;
  setZoom(fillZoom());
  syncViewSeg();
};

stageEl.addEventListener(
  "wheel",
  (e) => {
    if (!controlsEl.classList.contains("visible")) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), false);
  },
  { passive: false }
);

stageEl.addEventListener("pointerdown", (e) => {
  if (!controlsEl.classList.contains("visible") || e.button !== 0 || zoom <= 1) return;
  dragging = true;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  stageEl.setPointerCapture(e.pointerId);
  applyView();
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
  if (!controlsEl.classList.contains("visible")) return;
  panX = 0;
  panY = 0;
  setZoom(zoom > 1.05 ? 1 : fillZoom());
});

window.addEventListener("resize", () => {
  applyView();
  preferMaxVideoQuality();
});

// P2 + P8: pausar; se ficar oculto bastante, detach do vídeo
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (currentVideoTrack) {
      videoPausedForHidden = true;
      videoEl.pause();
      stageEl.classList.add("paused-vis");
      clearTimeout(hiddenDetachTimer);
      hiddenDetachTimer = setTimeout(() => {
        if (!document.hidden || !currentVideoTrack) return;
        try {
          currentVideoTrack.detach(videoEl);
          videoDetachedHidden = true;
        } catch {
          /* ignore */
        }
      }, HIDDEN_DETACH_MS);
    }
  } else {
    clearTimeout(hiddenDetachTimer);
    videoPausedForHidden = false;
    stageEl.classList.remove("paused-vis");
    if (videoDetachedHidden && currentVideoTrack) {
      try {
        currentVideoTrack.attach(videoEl);
        videoDetachedHidden = false;
      } catch {
        /* ignore */
      }
    }
    videoEl.play().catch(() => {});
    unlockAudio();
  }
});

toggleEl.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(!menuEl.classList.contains("open"));
  bumpIdle();
});

document.addEventListener("click", (e) => {
  if (!controlsEl.contains(e.target)) setMenuOpen(false);
});

document.addEventListener("pointermove", bumpIdle);
document.addEventListener("keydown", bumpIdle);

leaveBtn.onclick = () => leaveRoom();
webLeaveBtn && (webLeaveBtn.onclick = () => leaveRoom());
muteBtn.onclick = () => setMuted(!muted);
webMuteBtn && (webMuteBtn.onclick = () => setMuted(!muted));
menuCloseBtn && (menuCloseBtn.onclick = () => setMenuOpen(false));
webFitBtn && (webFitBtn.onclick = () => zoomFitBtn.click());
webFillBtn && (webFillBtn.onclick = () => zoomFillBtn.click());
webFsBtn && (webFsBtn.onclick = () => toggleFullscreen());
webFavBtn &&
  (webFavBtn.onclick = () => {
    if (currentRoomName) toggleFav(currentRoomName);
  });

masterVolEl?.addEventListener("input", () => {
  const key = audioSourceName || activeTarget || currentRoomName || "default";
  const v = Number(masterVolEl.value) / 100;
  volumes[key] = v;
  if (activeTarget) volumes[activeTarget] = v;
  if (audioSourceName) volumes[audioSourceName] = v;
  saveJson(VOL_KEY, volumes);
  if (v > 0) muted = false;
  applyVolume(key);
  if (v > 0) unlockAudio();
});

copyBtn.onclick = async () => {
  try {
    await navigator.clipboard.writeText(currentRoomName || "");
    toast(t.copied);
  } catch {
    toast(t.copyFail);
  }
};
pipBtn.onclick = () => togglePip();
cinemaBtn.onclick = () => setCinema(!cinema);
statsBtn.onclick = () => setStats(!showStats);
diagBtn.onclick = () => copyDiagnostics();
favBtn.onclick = () => {
  if (currentRoomName) toggleFav(currentRoomName);
};
qrBtn.onclick = () => {
  if (!currentRoomName) return;
  const url = `${location.origin}/?watch=1&sala=${encodeURIComponent(currentRoomName)}`;
  const qr =
    "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" +
    encodeURIComponent(url);
  window.open(qr, "_blank", "noopener,noreferrer");
};

// Q10: scroll no volume
listEl.addEventListener(
  "wheel",
  (e) => {
    const slider = e.target.closest('input[type="range"]');
    if (!slider || !listEl.contains(slider)) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    slider.value = String(clamp(Number(slider.value) + delta, 0, 100));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  },
  { passive: false }
);

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = normalizeRoom(roomInput.value);
  if (!roomName) {
    joinError.textContent = t.gateErrorEmpty;
    return;
  }
  enter(roomName).catch(() => {});
});

roomInput.addEventListener("focus", warmupLivekit);

document.getElementById("error-retry").onclick = () => {
  const room = lastError?.roomAttempt || normalizeRoom(roomInput.value);
  hideError();
  gateEl.classList.remove("hidden");
  if (room) enter(room).catch(() => {});
};
document.getElementById("error-back").onclick = () => {
  hideError();
  gateEl.classList.remove("hidden");
};

document.addEventListener("keydown", (e) => {
  if (!controlsEl.classList.contains("visible")) return;
  if (e.key === "Escape") setMenuOpen(false);
  if (e.key === "+" || e.key === "=") setZoom(zoom * 1.1, false);
  if (e.key === "-" || e.key === "_") setZoom(zoom / 1.1, false);
  if (e.key.toLowerCase() === "m") setMuted(!muted);
  if (e.key.toLowerCase() === "c") setCinema(!cinema);
  if (e.key.toLowerCase() === "f" && !inDiscord) toggleFullscreen();
});

renderRecent();
syncViewSeg();

// Boot: Q7 deep link ?sala= na landing também força watch
const fromQuery = normalizeRoom(qs.get("sala"));
if (inDiscord || forceWatch || fromQuery) {
  showGate();
  const saved = normalizeRoom(sessionStorage.getItem(ROOM_KEY));
  const auto = localStorage.getItem(AUTO_KEY) === "1";
  ensureSdk()
    .then(() => {
      if (fromQuery) {
        roomInput.value = fromQuery;
        return enter(fromQuery);
      }
      if (saved && auto) {
        roomInput.value = saved;
        return enter(saved);
      }
      if (saved) roomInput.value = saved;
    })
    .catch(() => {});
} else {
  showLanding();
}
