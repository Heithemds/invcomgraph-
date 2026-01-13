// ============================
// 1) CONFIG SUPABASE (à remplir)
// ============================
// ⚠️ Mets ici ton URL et ta clé "anon (public)" (Supabase → Project Settings → API)
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co";      // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

let sb = null;
let currentUser = null;

const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];

const $ = (id) => document.getElementById(id);

function toast(msg, type="ok"){
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.add("hidden"), 2400);
}

function setHint(id, msg, type=""){
  const el = $(id);
  el.textContent = msg || "";
  el.className = `hint ${type}`.trim();
}

function normalizeSpaces(s){
  return String(s||"").trim().replace(/\s+/g," ");
}

// règle métier: I = 1
function normalizeRef(ref){
  return normalizeSpaces(ref).toUpperCase().replace(/I/g, "1");
}

function toIntOrZero(v){
  if(v === null || v === undefined) return 0;
  const s = String(v).trim();
  if(!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function loadSession(){
  try{
    const raw = localStorage.getItem("inv_session");
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function saveSession(user){
  localStorage.setItem("inv_session", JSON.stringify({
    name:user.name,
    id:user.id,
    ts: Date.now()
  }));
}

function clearSession(){
  localStorage.removeItem("inv_session");
}

function pushLocalHistory(entry){
  const key = "inv_local_history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.unshift({ ...entry, ts: Date.now() });
  localStorage.setItem(key, JSON.stringify(list.slice(0, 60)));
  renderLocalHistory();
}

function renderLocalHistory(){
  const key = "inv_local_history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const box = $("localHistory");
  if(!list.length){
    box.innerHTML = `<div class="item">Aucun enregistrement local.</div>`;
    return;
  }
  box.innerHTML = list.map(x=>{
    const d = new Date(x.ts);
    const t = d.toLocaleString();
    return `<div class="item"><b>${x.ref}</b> • ${x.couleur} • ${x.manches} • total ${x.total} • <span>${t}</span></div>`;
  }).join("");
}

function showApp(){
  $("cardLogin").classList.add("hidden");
  $("cardApp").classList.remove("hidden");
  $("btnLogout").classList.remove("hidden");
  $("whoami").textContent = currentUser?.name || "—";
  renderLocalHistory();
}

function showLogin(){
  $("cardApp").classList.add("hidden");
  $("cardLogin").classList.remove("hidden");
  $("btnLogout").classList.add("hidden");
}

function bindManches(){
  const btns = [...document.querySelectorAll(".segbtn")];
  btns.forEach(b=>{
    b.addEventListener("click", ()=>{
      btns.forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      $("manches").value = b.dataset.manches;
    });
  });
}

function readTaillesJson(){
  const obj = {};
  for(const s of SIZES){
    const v = toIntOrZero($(`t_${s}`).value);
    if(v > 0) obj[s] = v;
  }
  return obj;
}

function calcTotal(){
  const t = readTaillesJson();
  let total = 0;
  for(const k in t) total += t[k];
  $("totalCarton").textContent = String(total);
  return total;
}

// ============================
// 2) DB: LOGIN / CREATE USER
// ============================

async function loginOrCreate(name, pin, pin2){
  const n = normalizeSpaces(name);
  const p = String(pin||"").trim();
  const p2 = String(pin2||"").trim();

  if(!n) throw new Error("Nom requis.");
  if(!/^\d{6}$/.test(p)) throw new Error("PIN doit être 6 chiffres.");

  const { data: existing, error: e1 } = await sb
    .from("app_users")
    .select("*")
    .eq("name", n)
    .limit(1);

  if(e1) throw e1;

  // utilisateur existe -> connexion
  if(existing && existing.length){
    const user = existing[0];
    if(String(user.pin) !== p) throw new Error("PIN incorrect.");
    return user;
  }

  // utilisateur nouveau -> confirmation obligatoire
  if(!/^\d{6}$/.test(p2)) throw new Error("Confirme le PIN (6 chiffres) pour créer le nouvel utilisateur.");
  if(p !== p2) throw new Error("PIN et confirmation ne correspondent pas.");

  const { data: created, error: e2 } = await sb
    .from("app_users")
    .insert({ name: n, pin: p })
    .select()
    .single();

  if(e2) throw e2;
  return created;
}

// ============================
// 3) DB: INSERT INVENTORY COUNT
// ============================

async function insertInventoryCount(payload){
  const { data, error } = await sb
    .from("inventory_counts")
    .insert(payload)
    .select()
    .single();

  if(error) throw error;
  return data;
}

// ============================
// 4) INIT
// ============================

function initSupabase(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY ||
     SUPABASE_URL.includes("COLLE_ICI") || SUPABASE_ANON_KEY.includes("COLLE_ICI")){
    setHint("loginHint", "Configure d’abord SUPABASE_URL + SUPABASE_ANON_KEY dans app.js", "bad");
    return false;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

function clearForm(){
  $("designation").value = "";
  $("ref").value = "";
  $("grammage").value = "";
  $("couleur").value = "";
  $("carton_code").value = "";
  $("manches").value = "";
  document.querySelectorAll(".segbtn").forEach(b=>b.classList.remove("active"));
  for(const s of SIZES) $(`t_${s}`).value = "";
  $("totalCarton").textContent = "0";
}

document.addEventListener("DOMContentLoaded", async ()=>{
  bindManches();

  // boutons
  $("btnCalc").addEventListener("click", ()=>{
    calcTotal();
    toast("Total calculé", "ok");
  });

  $("btnLogout").addEventListener("click", ()=>{
    currentUser = null;
    clearSession();
    showLogin();
    toast("Déconnecté", "ok");
  });

  $("btnLogin").addEventListener("click", async ()=>{
    try{
      setHint("loginHint","");
      setHint("appHint","");

      if(!initSupabase()) return;

      const name = $("loginName").value;
      const pin = $("loginPin").value;
      const pin2 = $("loginPin2").value;

      const user = await loginOrCreate(name, pin, pin2);
      currentUser = user;
      saveSession(user);

      showApp();
      toast(`Connecté: ${user.name}`, "ok");
    }catch(e){
      setHint("loginHint", e?.message || String(e), "bad");
      toast(e?.message || "Erreur", "bad");
    }
  });

  $("btnSend").addEventListener("click", async ()=>{
    try{
      setHint("appHint","");

      if(!sb) {
        if(!initSupabase()) return;
      }
      if(!currentUser){
        throw new Error("Non connecté.");
      }

      const designation = normalizeSpaces($("designation").value);
      const ref = normalizeRef($("ref").value);
      const grammage = toIntOrZero($("grammage").value);
      const couleur = normalizeSpaces($("couleur").value);
      const manches = normalizeSpaces($("manches").value).toUpperCase();
      const carton_code = normalizeSpaces($("carton_code").value);

      if(!designation) throw new Error("Désignation requise.");
      if(!ref) throw new Error("Référence requise.");
      if(!couleur) throw new Error("Couleur requise.");
      if(!(manches === "MC" || manches === "ML")) throw new Error("Manches: choisir MC ou ML.");

      const tailles_json = readTaillesJson();
      const total = calcTotal();
      if(total <= 0) throw new Error("Quantités: total doit être > 0.");

      // Payload DB
      const payload = {
        carton_code: carton_code || null,
        designation,
        ref,
        grammage: grammage || null,
        couleur,
        manches,
        tailles_json,
        counted_by: currentUser.name
      };

      await insertInventoryCount(payload);

      pushLocalHistory({ ref, couleur, manches, total });
      toast("Enregistré en base ✅", "ok");
      clearForm();

    }catch(e){
      setHint("appHint", e?.message || String(e), "bad");
      toast(e?.message || "Erreur", "bad");
    }
  });

  // auto session
  const sess = loadSession();
  if(sess){
    // session locale: on affiche l’app directement, le nom suffit côté UI
    // (la vraie vérif PIN se fait uniquement à la connexion)
    currentUser = { name: sess.name, id: sess.id };
    showApp();
  }else{
    showLogin();
  }
});