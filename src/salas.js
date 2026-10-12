const adminEl = document.getElementById("admin");
const nameEl = document.getElementById("name");
const createBtn = document.getElementById("create");
const listEl = document.getElementById("list");
const msgEl = document.getElementById("msg");
const countEl = document.getElementById("count");

const ADMIN_KEY = "telador.adminKey";

adminEl.value = sessionStorage.getItem(ADMIN_KEY) || "";
adminEl.addEventListener("change", () => {
  sessionStorage.setItem(ADMIN_KEY, adminEl.value);
});

function setMsg(text, kind) {
  msgEl.textContent = text || "";
  msgEl.className = "msg" + (kind ? " " + kind : "");
}

async function refresh() {
  const adminKey = adminEl.value;
  if (!adminKey) {
    countEl.textContent = `0 / 5 salas`;
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

    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Apagar";
    del.onclick = () => removeRoom(name);

    li.append(code, del);
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
    setMsg(`Sala "${data.name}" criada. Use esse nome como key.`, "ok");
    await refresh();
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

refresh().catch((e) => setMsg(e.message, "error"));
