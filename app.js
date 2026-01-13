/* ========= CONFIG =========
   ⚠️ Remplace par TES valeurs.
   Conseil: rotate la anon key sur Supabase.
*/
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ========= UI helpers ========= */
const $ = (id) => document.getElementById(id);
const toast = (msg) => {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("toast--show");
  setTimeout(() => t.classList.remove("toast--show"), 1800);
};
const setStatus = (msg, kind = "") => {
  const el = $("statusLine");
  el.className = "status " + (kind ? `status--${kind}` : "");
  el.textContent = msg || "";
};

/* ========= Session local ========= */
const SESSION_KEY = "inv_session_v1";
const HISTORY_KEY = "inv_history_v1";

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  renderSession();
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  renderSession();
}

function addHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20)));
  renderHistory();
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

/* ========= Normalisation règles =========
  - REF : accepte I comme 1 (ex: 19I -> 191)
  - Uppercase + trim
*/
function normalizeRef(v) {
  if (!v) return "";
  return String(v).trim().toUpperCase().replace(/I/g, "1");
}
function normalizeText(v) {
  return (v ?? "").toString().trim();
}
function normalizeSleeve(v) {
  const x = (v ?? "").toString().trim().toUpperCase();
  return (x === "MC" || x === "ML") ? x : "";
}

/* ========= Tailles ========= */
const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];

function buildSizesUI() {
  const grid = $("sizesGrid");
  grid.innerHTML = "";
  for (const s of SIZES) {
    const cell = document.createElement("div");
    cell.className = "sizeCell";
    cell.innerHTML = `
      <div class="sizeCell__top">
        <span class="badge">${s}</span>
        <span class="micro">Qté</span>
      </div>
      <input data-size="${s}" inputmode="numeric" type="number" min="0" placeholder="0" />
    `;
    grid.appendChild(cell);
  }

  // navigation clavier (Entrée = next)
  const inputs = [...grid.querySelectorAll("input[data-size]")];
  inputs.forEach((inp, idx) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) next.focus();
        else $("sendBtn").focus();
      }
    });
    inp.addEventListener("input", () => calcTotal());
  });
}

function getSizesJson() {
  const out = {};
  const inputs = document.querySelectorAll("input[data-size]");
  inputs.forEach((i) => {
    const size = i.getAttribute("data-size");
    const val = i.value === "" ? "" : String(Math.max(0, parseInt(i.value, 10) || 0));
    // on garde "" pour "vide", sinon "nombre"
    out[size] = val;
  });
  return out;
}

function calcTotal() {
  const sizes = getSizesJson();
  let sum = 0;
  for (const k of Object.keys(sizes)) {
    const n = parseInt(sizes[k], 10);
    if (!Number.isNaN(n)) sum += n;
  }
  $("totalCarton").textContent = String(sum);
  return sum;
}

/* ========= Manches toggle ========= */
function initSleeves() {
  const buttons = document.querySelectorAll(".seg__btn");
  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      buttons.forEach((x) => x.classList.remove("seg__btn--active"));
      b.classList.add("seg__btn--active");
      $("manches").value = b.dataset.sleeve;
    });
  });
}

/* ========= Tabs ========= */
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("tab--active"));
      t.classList.add("tab--active");
      const name = t.dataset.tab;
      document.querySelectorAll(".tabPanel").forEach((p) => p.classList.remove("tabPanel--active"));
      $(`tab-${name}`).classList.add("tabPanel--active");
    });
  });
}

/* ========= Render ========= */
function renderSession() {
  const s = loadSession();
  const pill = $("sessionPill");
  const logout = $("logoutBtn");

  if (!s) {
    pill.textContent = "Non connecté";
    logout.disabled = true;
    $("loginCard").style.opacity = "1";
    $("entryCard").style.opacity = ".55";
    $("entryCard").style.pointerEvents = "none";
    setStatus("Connecte-toi pour saisir.", "");
    return;
  }

  pill.textContent = `Connecté : ${s.name}`;
  logout.disabled = false;
  $("loginCard").style.opacity = ".75";
  $("entryCard").style.opacity = "1";
  $("entryCard").style.pointerEvents = "auto";
  setStatus(`Prêt. Saisis un carton (compteur: ${s.name}).`, "");
}

function renderHistory() {
  const list = loadHistory();
  const wrap = $("historyList");
  if (!list.length) {
    wrap.innerHTML = `<div class="micro">Aucun carton enregistré sur cet appareil pour l’instant.</div>`;
    return;
  }
  wrap.innerHTML = list.map((it) => `
    <div class="item">
      <div class="item__top">
        <div class="item__title">${it.ref} • ${it.couleur || "—"} • ${it.manches || "—"}</div>
        <div class="micro">${it.total} pcs</div>
      </div>
      <div class="item__meta">
        ${it.when} • par <b>${it.counted_by}</b> ${it.carton_code ? `• carton: ${it.carton_code}` : ""}
      </div>
    </div>
  `).join("");
}

/* ========= DB calls ========= */
async function ensureUser(name, pin) {
  // Table: app_users(name text unique, pin text)
  // 1) try select
  const { data: found, error: e1 } = await db
    .from("app_users")
    .select("id,name,pin")
    .eq("name", name)
    .maybeSingle();

  if (e1) throw e1;

  if (!found) {
    // create
    const { data: created, error: e2 } = await db
      .from("app_users")
      .insert({ name, pin })
      .select("id,name,pin")
      .single();
    if (e2) throw e2;
    return created;
  }

  // check pin
  if (String(found.pin) !== String(pin)) {
    throw new Error("PIN incorrect pour ce nom.");
  }
  return found;
}

async function insertCount(payload) {
  // Table: inventory_counts(...)
  const { error } = await db.from("inventory_counts").insert(payload);
  if (error) throw error;
}

async function loadStockTotals(filterText = "") {
  // View/table: stock_total(ref, couleur, manches, taille, qte_total)
  const q = db.from("stock_total").select("ref,couleur,manches,taille,qte_total");

  // simple filter: contains on ref or couleur
  const f = normalizeText(filterText);
  let req = q;
  if (f) {
    // Supabase OR filter
    req = req.or(`ref.ilike.%${f}%,couleur.ilike.%${f}%`);
  }

  const { data, error } = await req.order("ref", { ascending: true }).limit(500);
  if (error) throw error;
  return data || [];
}

function renderStockTable(rows) {
  const tbody = $("stockTable").querySelector("tbody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.ref ?? ""}</td>
      <td>${r.couleur ?? ""}</td>
      <td>${r.manches ?? ""}</td>
      <td>${r.taille ?? ""}</td>
      <td><b>${r.qte_total ?? 0}</b></td>
    </tr>
  `).join("");

  $("stockMeta").textContent = `Lignes: ${rows.length} (max 500).`;
}

/* ========= Events ========= */
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const rawName = $("name").value;
  const rawPin = $("pin").value;

  const name = normalizeText(rawName);
  const pin = String(rawPin || "").trim();

  if (!name) return setStatus("Nom requis.", "bad");
  if (!/^\d{6}$/.test(pin)) return setStatus("PIN doit être 6 chiffres.", "bad");

  try {
    const user = await ensureUser(name, pin);
    saveSession({ id: user.id, name: user.name });
    toast("Connexion OK");
    $("ref").focus();
  } catch (err) {
    setStatus(err.message || "Erreur connexion.", "bad");
  }
});

$("logoutBtn").addEventListener("click", () => {
  clearSession();
  toast("Déconnecté");
});

$("calcBtn").addEventListener("click", () => {
  const t = calcTotal();
  toast(`Total carton: ${t}`);
});

$("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const s = loadSession();
  if (!s) return setStatus("Non connecté.", "bad");

  // fields
  const designation = normalizeText($("designation").value);
  const grammageRaw = $("grammage").value;
  const grammage = grammageRaw === "" ? null : Math.max(0, parseInt(grammageRaw, 10) || 0);

  const ref = normalizeRef($("ref").value);
  const couleur = normalizeText($("couleur").value);
  const manches = normalizeSleeve($("manches").value);
  const carton_code = normalizeText($("carton_code").value) || null;

  if (!ref) return setStatus("Référence requise.", "bad");
  if (!manches) return setStatus("Manches: choisir MC ou ML.", "bad");

  const tailles_json = getSizesJson();
  const total = calcTotal();

  if (total <= 0) {
    return setStatus("Total = 0. Saisis au moins une quantité.", "bad");
  }

  const payload = {
    carton_code,
    designation: designation || null,
    ref,
    grammage,
    couleur: couleur || null,
    manches,
    tailles_json,      // jsonb
    counted_by: s.name // texte
  };

  try {
    $("sendBtn").disabled = true;
    setStatus("Envoi en cours…", "");

    await insertCount(payload);

    // Historique local
    addHistory({
      ref,
      couleur,
      manches,
      carton_code,
      total,
      counted_by: s.name,
      when: new Date().toLocaleString("fr-FR")
    });

    setStatus("Carton enregistré ✔", "ok");
    toast("Enregistré ✔");

    // reset quantités seulement (gagne du temps)
    document.querySelectorAll("input[data-size]").forEach(i => i.value = "");
    $("totalCarton").textContent = "0";

    // garde ref/couleur/grammage si tu veux… ou reset complet :
    // $("designation").value = "";
    // $("ref").value = "";
    // $("couleur").value = "";
    // $("grammage").value = "";

    // refresh stock (optionnel)
    try {
      const rows = await loadStockTotals($("stockFilter").value);
      renderStockTable(rows);
    } catch {}

    $("ref").focus();
  } catch (err) {
    setStatus(err.message || "Erreur envoi.", "bad");
  } finally {
    $("sendBtn").disabled = false;
  }
});

/* ========= Stock panel ========= */
$("refreshStockBtn").addEventListener("click", async () => {
  try {
    setStatus("Chargement stock…", "");
    const rows = await loadStockTotals($("stockFilter").value);
    renderStockTable(rows);
    setStatus("Stock chargé.", "ok");
  } catch (err) {
    setStatus(err.message || "Erreur stock.", "bad");
  }
});

$("stockFilter").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("refreshStockBtn").click();
  }
});

/* ========= Init ========= */
function init() {
  buildSizesUI();
  initSleeves();
  initTabs();
  renderSession();
  renderHistory();

  // Auto: si session, pré-charge stock
  const s = loadSession();
  if (s) $("refreshStockBtn").click();
}
init();
