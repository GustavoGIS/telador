const adminEl = document.getElementById("admin");
const nameEl = document.getElementById("name");
const createBtn = document.getElementById("create");
const listEl = document.getElementById("list");
const msgEl = document.getElementById("msg");
const countEl = document.getElementById("count");
const healthEl = document.getElementById("health");
const qrCard = document.getElementById("qr-card");
const qrImg = document.getElementById("qr-img");
const qrName = document.getElementById("qr-name");
const qrUrl = document.getElementById("qr-url");

const ADMIN_KEY = "telador.adminKey";

function showQr(name) {
  const url = `${location.origin}/?watch=1&sala=${encodeURIComponent(name)}`;
  qrCard.classList.remove("hidden");
  qrName.textContent = name;
  qrUrl.textContent = url;
  qrImg.src =
    "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=" +
    encodeURIComponent(url);
}

adminEl.value = sessionStorage.getItem(ADMIN_KEY) || "";
adminEl.addEventListener("change", () => {
  sessionStorage.setItem(ADMIN_KEY, adminEl.value);
});

function setMsg(text, kind) {
  msgEl.textContent = text || "";
  msgEl.className = "msg" + (kind ? " " + kind : "");
}

function pill(label, ok) {
  const el = document.createElement("div");
  el.className = "pill";
  el.innerHTML = `<span class="dot ${ok ? "live" : "wait"}"></span><span>${label}</span>`;
  return el;
}

async function refreshHealth() {
  healthEl.innerHTML = "";
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    healthEl.append(
      pill(data.livekit ? "LiveKit ok" : "LiveKit falhou", Boolean(data.livekit)),
      pill(`${data.rooms ?? 0} salas no registry`, true)
    );
    if (!data.ok) {
      healthEl.append(pill("API com alerta", false));
    }
  } catch {
    healthEl.append(pill("Health indisponível", false));
  }
}

async function refresh() {
  const adminKey = adminEl.value;
  if (!adminKey) {
    countEl.textContent = "0 / 5 salas";
    listEl.innerHTML =
      "<li><span class='meta'>Informe a chave admin para ver as salas</span></li>";
    return;
  }
  const res = await fetch(
    `/api/rooms?adminKey=${encodeURIComponent(adminKey)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "falha ao listar");

  const rooms = data.rooms || [];
  const max = data.max || 5;
  countEl.textContent = `${rooms.length} / ${max} salas`;
  listEl.innerHTML = "";

  if (rooms.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = "<span class='meta'>Nenhuma sala criada</span>";
    listEl.appendChild(li);
    return;
  }

  for (const name of rooms) {
    const li = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = name;

    const ops = document.createElement("div");
    ops.className = "ops";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "ghost";
    copy.textContent = "Copiar";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(name);
        setMsg(`Código "${name}" copiado.`, "ok");
      } catch {
        setMsg("Não foi possível copiar.", "error");
      }
    };

    const open = document.createElement("button");
    open.type = "button";
    open.className = "ghost";
    open.textContent = "Abrir";
    open.onclick = () => {
      location.href = `/?watch=1&sala=${encodeURIComponent(name)}`;
    };

    const qr = document.createElement("button");
    qr.type = "button";
    qr.className = "ghost";
    qr.textContent = "QR";
    qr.onclick = () => showQr(name);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Apagar";
    del.onclick = () => removeRoom(name);

    ops.append(copy, open, qr, del);
    li.append(code, ops);
    listEl.appendChild(li);
  }
}

async function createRoom() {
  setMsg("");
  createBtn.disabled = true;
  try {
    sessionStorage.setItem(ADMIN_KEY, adminEl.value);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminKey: adminEl.value,
        name: nameEl.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "falha ao criar");
    nameEl.value = "";
    setMsg(
      `Sala "${data.name}" criada. Use no Transmissor e na Activity.`,
      "ok"
    );
    await refresh();
    await refreshHealth();
  } catch (e) {
    setMsg(e.message, "error");
  } finally {
    createBtn.disabled = false;
  }
}

async function removeRoom(name) {
  if (!confirm(`Apagar a sala "${name}"?`)) return;
  setMsg("");
  try {
    const res = await fetch("/api/rooms", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminKey: adminEl.value,
        name,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "falha ao apagar");
    setMsg(`Sala "${name}" apagada.`, "ok");
    await refresh();
    await refreshHealth();
  } catch (e) {
    setMsg(e.message, "error");
  }
}

createBtn.addEventListener("click", createRoom);
nameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createRoom();
});
adminEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") refresh().catch((err) => setMsg(err.message, "error"));
});
adminEl.addEventListener("blur", () => {
  refresh().catch((err) => setMsg(err.message, "error"));
});

refreshHealth();
refresh().catch((e) => setMsg(e.message, "error"));
