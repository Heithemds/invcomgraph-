/***********************
 * CONFIG
 ***********************/
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***********************
 * UTIL
 ***********************/
const $ = (id) => document.getElementById(id);

function normName(s){
  return (s || "").trim();
}

function isValidPin(pin){
  return /^\d{6}$/.test(pin);
}

// Hash simple côté client (pas parfait, mais OK pour votre besoin "atelier")
// Pour plus solide: RPC côté serveur ou auth. Là on vise vitesse.
async function sha256(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function onlyIntOrEmpty(v){
  const s = (v || "").toString().trim();
  if(s === "") return "";
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : "";
}

function setMsg(el, text, cls){
  el.className = "msg " + (cls || "");
  el.textContent = text || "";
}

function normalizeRef(ref){
  // règle anti confusion: I = 1
  // et suppression espaces
  return (ref || "")
    .trim()
    .toUpperCase()
    .replaceAll(" ", "")
    .replaceAll("I", "1");
}

/***********************
 * SESSION (local)
 ***********************/
const SESSION_KEY = "inv_session_v1";

function setSession(session){
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function getSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function clearSession(){
  localStorage.removeItem(SESSION_KEY);
}

/***********************
 * UI refs
 ***********************/
const viewLogin = $("viewLogin");
const viewApp = $("viewApp");

const loginName = $("loginName");
const loginPin = $("loginPin");
const btnLogin = $("btnLogin");
const loginMsg = $("loginMsg");

const userBadge = $("userBadge");
const btnLogout = $("btnLogout");

const f_designation = $("f_designation");
const f_ref = $("f_ref");
const f_grammage = $("f_grammage");
const f_couleur = $("f_couleur");
const f_carton = $("f_carton");
const btnMC = $("btnMC");
const btnML = $("btnML");

const btnCalcTotal = $("btnCalcTotal");
const totalCartonEl = $("totalCarton");
const btnSave = $("btnSave");
const saveMsg = $("saveMsg");

const filterRef = $("filterRef");
const filterCouleur = $("filterCouleur");
const filterManches = $("filterManches");
const btnRefresh = $("btnRefresh");
const btnExportCsv = $("btnExportCsv");
const stockMsg = $("stockMsg");
const stockTableBody = $("stockTable").querySelector("tbody");

let manchesSelected = "MC";

/***********************
 * MANCHES selector
 ***********************/
function setManches(val){
  manchesSelected = val;
  btnMC.classList.toggle("active", val === "MC");
  btnML.classList.toggle("active", val === "ML");
}
btnMC.addEventListener("click", () => setManches("MC"));
btnML.addEventListener("click", () => setManches("ML"));
setManches("MC");

/***********************
 * LOGIN FLOW
 ***********************/
async function loginOrRegister(){
  setMsg(loginMsg, "", "");
  const name = normName(loginName.value);
  const pin = (loginPin.value || "").trim();

  if(!name){
    setMsg(loginMsg, "Nom requis.", "bad");
    return;
  }
  if(!isValidPin(pin)){
    setMsg(loginMsg, "PIN invalide (6 chiffres).", "bad");
    return;
  }

  const pin_hash = await sha256(pin);

  // 1) check user exists
  const { data: existing, error: e1 } = await db
    .from("app_users")
    .select("id,name,pin_hash")
    .eq("name", name)
    .maybeSingle();

  if(e1){
    setMsg(loginMsg, "Erreur DB (lecture user).", "bad");
    console.error(e1);
    return;
  }

  if(!existing){
    // create
    const { error: e2 } = await db
      .from("app_users")
      .insert({ name, pin_hash });

    if(e2){
      setMsg(loginMsg, "Erreur DB (création user).", "bad");
      console.error(e2);
      return;
    }

    setSession({ name });
    showApp(name);
    setMsg(loginMsg, "Utilisateur créé. Connexion OK.", "ok");
    return;
  }

  // verify pin
  if(existing.pin_hash !== pin_hash){
    setMsg(loginMsg, "PIN incorrect.", "bad");
    return;
  }

  setSession({ name });
  showApp(name);
  setMsg(loginMsg, "Connexion OK.", "ok");
}

btnLogin.addEventListener("click", loginOrRegister);
loginPin.addEventListener("keydown", (e) => {
  if(e.key === "Enter") loginOrRegister();
});

/***********************
 * APP VIEW
 ***********************/
function showApp(name){
  viewLogin.classList.add("hidden");
  viewApp.classList.remove("hidden");
  userBadge.textContent = name;
  userBadge.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
  setMsg(saveMsg, "", "");
  setMsg(stockMsg, "", "");
  refreshStock();
}

function showLogin(){
  viewApp.classList.add("hidden");
  viewLogin.classList.remove("hidden");
  userBadge.classList.add("hidden");
  btnLogout.classList.add("hidden");
}

btnLogout.addEventListener("click", () => {
  clearSession();
  showLogin();
});

/***********************
 * TOTAL CALC
 ***********************/
function getTaillesJson(){
  const map = {
    "XS": onlyIntOrEmpty($("q_xs").value),
    "S":  onlyIntOrEmpty($("q_s").value),
    "M":  onlyIntOrEmpty($("q_m").value),
    "L":  onlyIntOrEmpty($("q_l").value),
    "XL": onlyIntOrEmpty($("q_xl").value),
    "XXL": onlyIntOrEmpty($("q_xxl").value),
    "3XL": onlyIntOrEmpty($("q_3xl").value),
    "4XL": onlyIntOrEmpty($("q_4xl").value),
    "5XL": onlyIntOrEmpty($("q_5xl").value),
    "6XL": onlyIntOrEmpty($("q_6xl").value),
    "7XL": onlyIntOrEmpty($("q_7xl").value),
    "8XL": onlyIntOrEmpty($("q_8xl").value),
  };

  // enlever vides
  const cleaned = {};
  for(const k of Object.keys(map)){
    if(map[k] !== "" && map[k] !== "0"){
      cleaned[k] = map[k];
    }
  }
  return cleaned;
}

function calcTotal(){
  const tailles = getTaillesJson();
  let total = 0;
  for(const k in tailles){
    const n = parseInt(tailles[k], 10);
    if(Number.isFinite(n)) total += n;
  }
  totalCartonEl.textContent = String(total);
  return { total, tailles };
}

btnCalcTotal.addEventListener("click", () => {
  const { total } = calcTotal();
  setMsg(saveMsg, `Total calculé: ${total}`, "ok");
});

/***********************
 * SAVE CARTON -> inventory_counts
 ***********************/
async function saveCarton(){
  setMsg(saveMsg, "", "");
  const session = getSession();
  if(!session?.name){
    setMsg(saveMsg, "Session expirée. Reconnecte-toi.", "bad");
    showLogin();
    return;
  }

  // validations
  const designation = (f_designation.value || "").trim();
  const refRaw = (f_ref.value || "").trim();
  const ref = normalizeRef(refRaw);
  const grammage = (f_grammage.value || "").trim();
  const couleur = (f_couleur.value || "").trim();
  const carton_code = (f_carton.value || "").trim();

  if(!ref){
    setMsg(saveMsg, "Référence requise.", "bad");
    return;
  }
  if(!couleur){
    setMsg(saveMsg, "Couleur requise.", "bad");
    return;
  }
  if(!["MC","ML"].includes(manchesSelected)){
    setMsg(saveMsg, "Manches invalides (MC/ML).", "bad");
    return;
  }

  const { total, tailles } = calcTotal();
  if(total <= 0){
    setMsg(saveMsg, "Aucune quantité saisie. (Total = 0)", "warn");
    return;
  }

  const payload = {
    carton_code: carton_code || null,
    designation: designation || null,
    ref,
    grammage: grammage || null,
    couleur,
    manches: manchesSelected,
    tailles_json: tailles,
    total_carton: total,
    counted_by: session.name
  };

  const { error } = await db.from("inventory_counts").insert(payload);

  if(error){
    setMsg(saveMsg, "Erreur DB (insertion).", "bad");
    console.error(error);
    return;
  }

  setMsg(saveMsg, "✅ Carton enregistré en base.", "ok");
  clearForm();
  refreshStock();
}

btnSave.addEventListener("click", saveCarton);

function clearForm(){
  f_designation.value = "";
  f_ref.value = "";
  f_grammage.value = "";
  f_couleur.value = "";
  f_carton.value = "";
  setManches("MC");

  const ids = ["q_xs","q_s","q_m","q_l","q_xl","q_xxl","q_3xl","q_4xl","q_5xl","q_6xl","q_7xl","q_8xl"];
  ids.forEach(id => $(id).value = "");
  totalCartonEl.textContent = "0";
}

/***********************
 * STOCK VIEW
 ***********************/
async function refreshStock(){
  setMsg(stockMsg, "Chargement...", "");
  stockTableBody.innerHTML = "";

  let q = db.from("stock_total").select("*").limit(500);

  const r = normalizeRef(filterRef.value || "");
  if(r) q = q.ilike("ref", `%${r}%`);

  const c = (filterCouleur.value || "").trim();
  if(c) q = q.ilike("couleur", `%${c}%`);

  const m = filterManches.value;
  if(m) q = q.eq("manches", m);

  const { data, error } = await q;

  if(error){
    setMsg(stockMsg, "Erreur DB (lecture stock_total).", "bad");
    console.error(error);
    return;
  }

  if(!data || data.length === 0){
    setMsg(stockMsg, "Aucune ligne.", "warn");
    return;
  }

  for(const row of data){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="mono">${row.ref || ""}</span></td>
      <td>${row.couleur || ""}</td>
      <td><strong>${row.manches || ""}</strong></td>
      <td><strong>${row.taille || ""}</strong></td>
      <td><strong>${row.qte ?? ""}</strong></td>
    `;
    stockTableBody.appendChild(tr);
  }

  setMsg(stockMsg, `✅ ${data.length} lignes`, "ok");
}

btnRefresh.addEventListener("click", refreshStock);

/***********************
 * EXPORT CSV (stock_total)
 ***********************/
function toCsv(rows){
  const headers = ["ref","couleur","manches","taille","qte"];
  const escape = (v) => {
    const s = (v ?? "").toString();
    if(s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"','""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ];
  return lines.join("\n");
}

btnExportCsv.addEventListener("click", async () => {
  setMsg(stockMsg, "Export en cours...", "");
  let q = db.from("stock_total").select("*").limit(2000);

  const r = normalizeRef(filterRef.value || "");
  if(r) q = q.ilike("ref", `%${r}%`);

  const c = (filterCouleur.value || "").trim();
  if(c) q = q.ilike("couleur", `%${c}%`);

  const m = filterManches.value;
  if(m) q = q.eq("manches", m);

  const { data, error } = await q;

  if(error){
    setMsg(stockMsg, "Erreur export (lecture).", "bad");
    console.error(error);
    return;
  }

  const csv = toCsv(data || []);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock_total_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  setMsg(stockMsg, "✅ CSV généré.", "ok");
});

/***********************
 * BOOT
 ***********************/
(function boot(){
  // petite touche mono
  const style = document.createElement("style");
  style.textContent = `.mono{font-family: var(--mono); font-size: 13px;}`;
  document.head.appendChild(style);

  const session = getSession();
  if(session?.name){
    showApp(session.name);
  } else {
    showLogin();
  }
})();
