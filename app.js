import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/**
 * CONFIG SUPABASE
 * Remplace les 2 lignes ci-dessous par tes infos.
 * (URL du projet + anon key)
 */
const SUPABASE_URL = "COLLE_TON_SUPABASE_URL_ICI";
const SUPABASE_ANON_KEY = "COLLE_TON_SUPABASE_ANON_KEY_ICI";

// Table cible
const TABLE = "inventory";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === UI refs ===
const netDot = document.getElementById("netDot");
const netTxt = document.getElementById("netTxt");

const comptePar = document.getElementById("comptePar");
const otherNameWrap = document.getElementById("otherNameWrap");
const otherName = document.getElementById("otherName");
const whoBadge = document.getElementById("whoBadge");

const cartonCode = document.getElementById("cartonCode");
const designation = document.getElementById("designation");
const grammage = document.getElementById("grammage");
const ref = document.getElementById("ref");
const couleur = document.getElementById("couleur");
const remarque = document.getElementById("remarque");

const btnMC = document.getElementById("btnMC");
const btnML = document.getElementById("btnML");
const manchesBadge = document.getElementById("manchesBadge");

const sizesGrid = document.getElementById("sizesGrid");
const totalBig = document.getElementById("totalBig");

const btnSend = document.getElementById("btnSend");
const btnClear = document.getElementById("btnClear");
const btnLogout = document.getElementById("btnLogout");

const historyList = document.getElementById("historyList");
const histCount = document.getElementById("histCount");

// Toast
const toast = document.getElementById("toast");
const toastIco = document.getElementById("toastIco");
const toastTitle = document.getElementById("toastTitle");
const toastMsg = document.getElementById("toastMsg");
let toastTimer = null;

function showToast(type, title, msg){
  clearTimeout(toastTimer);
  toastIco.className = "ico " + (type || "warn");
  toastTitle.textContent = title || "Info";
  toastMsg.textContent = msg || "";
  toast.classList.add("show");
  toastTimer = setTimeout(()=>toast.classList.remove("show"), 3200);
}

// === Network indicator ===
function updateNet(){
  const ok = navigator.onLine;
  netDot.className = "dot " + (ok ? "ok" : "bad");
  netTxt.textContent = ok ? "En ligne" : "Hors ligne";
}
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);
updateNet();

// === Local user + history ===
const LS_USER = "inv_user_name";
const LS_HISTORY = "inv_history";

function getUser(){ return localStorage.getItem(LS_USER) || ""; }
function setUser(name){
  localStorage.setItem(LS_USER, name);
  whoBadge.textContent = name ? ("Connecté: " + name) : "Non connecté";
}

function getSelectedName(){
  const v = comptePar.value;
  if(v === "__other__") return (otherName.value || "").trim();
  return (v || "").trim();
}

function updateWhoBadge(){
  const nm = getSelectedName() || getUser();
  whoBadge.textContent = nm ? ("Connecté: " + nm) : "Non connecté";
}

comptePar.addEventListener("change", ()=>{
  otherNameWrap.classList.toggle("hidden", comptePar.value !== "__other__");
  const nm = getSelectedName();
  if(nm){
    setUser(nm);
    showToast("ok", "Nom enregistré", nm);
  }
  updateWhoBadge();
});

otherName.addEventListener("input", ()=>{
  const nm = getSelectedName();
  if(nm){
    setUser(nm);
    updateWhoBadge();
  }
});

// restore saved user
const saved = getUser();
if(saved){
  const options = [...comptePar.options].map(o => (o.value || o.textContent));
  if(options.includes(saved)){
    comptePar.value = saved;
  } else {
    comptePar.value = "__other__";
    otherNameWrap.classList.remove("hidden");
    otherName.value = saved;
  }
  setUser(saved);
}
updateWhoBadge();

// === Normalisation REF (I->1, O->0 dans la partie numérique) ===
function normalizeRef(raw){
  let x = (raw || "").toUpperCase().replace(/\s+/g,"");
  if(!x) return x;
  const m = x.match(/^([A-Z]+)(.*)$/);
  if(!m) return x;
  const prefix = m[1];
  let rest = m[2] || "";
  rest = rest.replace(/I/g,"1").replace(/O/g,"0");
  return prefix + rest;
}
ref.addEventListener("blur", ()=>{ ref.value = normalizeRef(ref.value); });

// === Sizes ===
const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL"];
const sizeInputs = new Map();

function buildSizes(){
  sizesGrid.innerHTML = "";
  for(const s of SIZES){
    const box = document.createElement("div");
    box.className = "sizeBox";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = s;

    const inp = document.createElement("input");
    inp.inputMode = "numeric";
    inp.placeholder = "0";
    inp.dataset.size = s;

    inp.addEventListener("input", ()=>{
      inp.value = inp.value.replace(/[^\d]/g,"");
      computeTotal();
    });

    inp.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        focusNextSize(s);
      }
    });

    box.appendChild(k);
    box.appendChild(inp);
    sizesGrid.appendChild(box);
    sizeInputs.set(s, inp);
  }
}

function focusNextSize(current){
  const idx = SIZES.indexOf(current);
  if(idx >= 0 && idx < SIZES.length - 1){
    const nxt = sizeInputs.get(SIZES[idx+1]);
    nxt.focus();
    if(nxt.select) nxt.select();
  } else {
    btnSend.focus();
  }
}

function computeTotal(){
  let t = 0;
  for(const s of SIZES){
    const v = parseInt(sizeInputs.get(s).value || "0", 10);
    t += (Number.isFinite(v) ? v : 0);
  }
  totalBig.textContent = String(t);
  return t;
}

buildSizes();
computeTotal();

// === Manches ===
let manches = "";
function setManches(v){
  manches = v;
  btnMC.classList.toggle("active", v === "MC");
  btnML.classList.toggle("active", v === "ML");
  manchesBadge.textContent = "MANCHES: " + (v || "—");
}
btnMC.addEventListener("click", ()=>setManches("MC"));
btnML.addEventListener("click", ()=>setManches("ML"));

// === History local ===
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function loadHistory(){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function saveHistory(arr){
  localStorage.setItem(LS_HISTORY, JSON.stringify(arr.slice(0, 30)));
  renderHistory();
}

function pushHistory(item){
  const arr = loadHistory();
  arr.unshift(item);
  saveHistory(arr);
}

function renderHistory(){
  const arr = loadHistory();
  histCount.textContent = String(arr.length);
  historyList.innerHTML = "";

  if(arr.length === 0){
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="left">
        <div class="a">Aucune saisie</div>
        <div class="b">Les dernières saisies apparaîtront ici.</div>
      </div>
      <div class="right"><span class="badge">—</span></div>
    `;
    historyList.appendChild(li);
    return;
  }

  for(const it of arr){
    const li = document.createElement("li");
    const a = `${it.ref} • ${it.couleur} • ${it.manches}`;
    const b = `${it.compte_par} • ${it.carton_code || "—"} • ${new Date(it.created_at).toLocaleString()}`;
    li.innerHTML = `
      <div class="left">
        <div class="a">${escapeHtml(a)}</div>
        <div class="b">${escapeHtml(b)}</div>
      </div>
      <div class="right">
        <div style="font-weight:900; font-size:16px;">${it.total}</div>
        <div class="badge">Envoyé</div>
      </div>
    `;
    historyList.appendChild(li);
  }
}
renderHistory();

// === Reset form ===
function resetForm(keepUser=true){
  cartonCode.value = "";
  designation.value = "";
  grammage.value = "";
  ref.value = "";
  couleur.value = "";
  remarque.value = "";
  setManches("");

  for(const s of SIZES){
    sizeInputs.get(s).value = "";
  }
  computeTotal();

  if(!keepUser){
    comptePar.value = "";
    otherNameWrap.classList.add("hidden");
    otherName.value = "";
    localStorage.removeItem(LS_USER);
  }
  ref.focus();
}

btnClear.addEventListener("click", ()=>resetForm(true));

btnLogout.addEventListener("click", ()=>{
  resetForm(false);
  updateWhoBadge();
  showToast("warn", "Nom effacé", "Choisis ton nom à nouveau.");
});

// === Send to Supabase ===
btnSend.addEventListener("click", async ()=>{
  const nm = getSelectedName() || getUser();
  if(!nm){
    showToast("bad", "Nom requis", "Choisis un nom (compte_par) avant de valider.");
    comptePar.focus();
    return;
  }

  const refVal = normalizeRef(ref.value);
  if(!refVal){
    showToast("bad", "Référence requise", "Champ REF obligatoire.");
    ref.focus();
    return;
  }

  const colVal = (couleur.value || "").trim();
  if(!colVal){
    showToast("bad", "Couleur requise", "Champ COULEUR obligatoire.");
    couleur.focus();
    return;
  }

  if(!manches){
    showToast("bad", "Manches requises", "Sélectionne MC ou ML.");
    btnMC.focus();
    return;
  }

  const tailles = {};
  let total = 0;
  for(const s of SIZES){
    const v = parseInt(sizeInputs.get(s).value || "0", 10);
    const q = Number.isFinite(v) ? v : 0;
    tailles[s] = q;
    total += q;
  }
  if(total <= 0){
    showToast("bad", "Quantités vides", "Saisis au moins une taille > 0.");
    sizeInputs.get("L").focus();
    return;
  }

  const g = (grammage.value || "").trim();
  const grammageInt = g ? parseInt(g.replace(/[^\d]/g,""), 10) : null;

  const payload = {
    compte_par: nm,
    carton_code: (cartonCode.value || "").trim() || null,
    designation: (designation.value || "").trim() || null,
    ref: refVal,
    grammage: Number.isFinite(grammageInt) ? grammageInt : null,
    couleur: colVal,
    manches: manches,
    tailles_json: tailles,
    total: total,
    remarque: (remarque.value || "").trim() || null,
  };

  try{
    btnSend.disabled = true;
    btnSend.textContent = "Envoi…";

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select("id, created_at");

    if(error){
      if((error.message || "").toLowerCase().includes("duplicate") || error.code === "23505"){
        showToast("bad", "Doublon carton_code", "Ce carton_code existe déjà. Change le code.");
        cartonCode.focus();
      } else {
        showToast("bad", "Erreur Supabase", error.message || "Insertion impossible.");
      }
      return;
    }

    const created_at = data?.[0]?.created_at || new Date().toISOString();
    pushHistory({ ...payload, created_at });
    showToast("ok", "Envoyé", `${payload.ref} • Total ${payload.total} • ${payload.compte_par}`);

    // reset but keep manches
    const keepM = manches;
    resetForm(true);
    setManches(keepM);

  } finally {
    btnSend.disabled = false;
    btnSend.textContent = "Valider & Envoyer";
  }
});

// initial focus
ref.focus();
