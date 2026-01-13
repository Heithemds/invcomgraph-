/* =========================
   CONFIG SUPABASE (A REMPLACER)
   ========================= */
const SUPABASE_URL = "https://TONPROJET.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

/* =========================
   INIT
   ========================= */
let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim());
} catch (e) {
  console.error(e);
  alert("Supabase init failed: " + e.message);
}

/* =========================
   UI HELPERS
   ========================= */
const $ = (id) => document.getElementById(id);

function setMsg(el, text, type) {
  el.classList.remove("ok", "err");
  if (type) el.classList.add(type);
  el.textContent = text || "";
}

function normalizeName(name) {
  return (name || "").trim();
}

function isPin6(pin) {
  return /^\d{6}$/.test((pin || "").trim());
}

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}

/* =========================
   SESSION LOCAL
   ========================= */
function setSessionUser(name) {
  localStorage.setItem("inv_user", name);
  $("whoami").textContent = `Connecté: ${name}`;
  $("btnLogout").hidden = false;
}

function clearSessionUser() {
  localStorage.removeItem("inv_user");
  $("whoami").textContent = "Non connecté";
  $("btnLogout").hidden = true;
}

function getSessionUser() {
  return localStorage.getItem("inv_user");
}

/* =========================
   DIAGNOSTICS
   ========================= */
async function runDiagnostics() {
  const out = $("diagOut");
  const diag = [];
  diag.push("URL: " + SUPABASE_URL);
  diag.push("Anon key length: " + (SUPABASE_ANON_KEY || "").length);

  // test select
  try {
    const { data, error } = await supabase.from("app_users").select("id").limit(1);
    if (error) diag.push("DB test: ERROR -> " + error.message);
    else diag.push("DB test: OK -> rows " + (data?.length ?? 0));
  } catch (e) {
    diag.push("DB test: EXCEPTION -> " + e.message);
  }

  out.textContent = diag.join("\n");
}

/* =========================
   AUTH - REGISTER / LOGIN
   ========================= */
async function registerUser() {
  const msg = $("authMsg");
  setMsg(msg, "", null);

  const name = normalizeName($("name").value);
  const pin = $("pin").value.trim();
  const pin2 = $("pin2").value.trim();

  if (!name) return setMsg(msg, "Nom obligatoire.", "err");
  if (!isPin6(pin)) return setMsg(msg, "PIN invalide : 6 chiffres obligatoires.", "err");
  if (pin2 !== pin) return setMsg(msg, "Confirmation PIN incorrecte.", "err");

  // check existing
  const { data: existing, error: e1 } = await supabase
    .from("app_users")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (e1) return setMsg(msg, "Erreur DB: " + e1.message, "err");
  if (existing) return setMsg(msg, "Ce nom existe déjà. Utilise 'Se connecter'.", "err");

  const pin_hash = await sha256(pin);

  const { error: e2 } = await supabase
    .from("app_users")
    .insert([{ name, pin_hash }]);

  if (e2) return setMsg(msg, "Inscription impossible: " + e2.message, "err");

  setSessionUser(name);
  setMsg(msg, "Inscription OK ✅ Connecté.", "ok");
}

async function loginUser() {
  const msg = $("authMsg");
  setMsg(msg, "", null);

  const name = normalizeName($("name").value);
  const pin = $("pin").value.trim();

  if (!name) return setMsg(msg, "Nom obligatoire.", "err");
  if (!isPin6(pin)) return setMsg(msg, "PIN invalide : 6 chiffres obligatoires.", "err");

  const { data: user, error: e1 } = await supabase
    .from("app_users")
    .select("id, pin_hash")
    .eq("name", name)
    .maybeSingle();

  if (e1) return setMsg(msg, "Erreur DB: " + e1.message, "err");
  if (!user) return setMsg(msg, "Nom inconnu. Clique 'S’inscrire'.", "err");

  const ok = user.pin_hash === (await sha256(pin));
  if (!ok) return setMsg(msg, "PIN incorrect.", "err");

  setSessionUser(name);
  setMsg(msg, "Connexion OK ✅", "ok");
}

/* =========================
   INVENTORY FORM
   ========================= */
let manches = "MC";

function setManches(v) {
  manches = v;
  $("mMC").classList.toggle("active", v === "MC");
  $("mML").classList.toggle("active", v === "ML");
}

function computeTotal() {
  const ids = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];
  let total = 0;
  for (const id of ids) {
    const n = parseInt($(id).value || "0", 10);
    if (!Number.isNaN(n) && n > 0) total += n;
  }
  $("totalCarton").textContent = String(total);
  return total;
}

function collectTaillesJson() {
  const ids = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];
  const obj = {};
  for (const id of ids) {
    const v = ($(id).value || "").trim();
    if (v !== "" && v !== "0") obj[id] = v; // stocke uniquement ce qui est présent
  }
  return obj;
}

function normalizeRef(ref) {
  // règle: accepte I comme 1 (si quelqu’un écrit E19I -> E191)
  // et met en MAJ
  return (ref || "")
    .trim()
    .toUpperCase()
    .replace(/I/g, "1");
}

async function sendInventory() {
  const invMsg = $("invMsg");
  setMsg(invMsg, "", null);

  const user = getSessionUser();
  if (!user) return setMsg(invMsg, "Tu dois te connecter avant d’envoyer.", "err");

  const designation = ($("designation").value || "").trim();
  const grammage = ($("grammage").value || "").trim();
  const ref = normalizeRef($("ref").value);
  const couleur = ($("couleur").value || "").trim();
  const carton_code = ($("carton_code").value || "").trim();

  if (!designation) return setMsg(invMsg, "Désignation obligatoire.", "err");
  if (!ref) return setMsg(invMsg, "Référence obligatoire.", "err");
  if (!couleur) return setMsg(invMsg, "Couleur obligatoire.", "err");
  if (!["MC","ML"].includes(manches)) return setMsg(invMsg, "Manches: MC ou ML seulement.", "err");

  const tailles_json = collectTaillesJson();
  const total = computeTotal();
  if (total <= 0) return setMsg(invMsg, "Aucune quantité saisie.", "err");

  // Insert record
  const payload = {
    designation,
    grammage: grammage || null,
    ref,
    couleur,
    manches,
    carton_code: carton_code || null,
    tailles_json,
    total_carton: total,
    counted_by: user
  };

  const { error } = await supabase.from("inventory_counts").insert([payload]);
  if (error) return setMsg(invMsg, "Envoi impossible: " + error.message, "err");

  setMsg(invMsg, "Enregistré ✅ (base centralisée).", "ok");

  // reset quantités pour aller vite
  ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"].forEach(id => $(id).value = "");
  computeTotal();
}

/* =========================
   BOOT
   ========================= */
function wire() {
  // Auth buttons
  $("btnRegister").addEventListener("click", registerUser);
  $("btnLogin").addEventListener("click", loginUser);
  $("btnLogout").addEventListener("click", () => {
    clearSessionUser();
    setMsg($("authMsg"), "Déconnecté.", "ok");
  });

  // Manches
  $("mMC").addEventListener("click", () => setManches("MC"));
  $("mML").addEventListener("click", () => setManches("ML"));

  // Totals
  $("btnCalc").addEventListener("click", computeTotal);
  $("btnSend").addEventListener("click", sendInventory);

  // Auto total recalcul
  ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"].forEach(id => {
    $(id).addEventListener("input", computeTotal);
  });

  // Diagnostics open
  document.querySelector(".diag").addEventListener("toggle", (e) => {
    if (e.target.open) runDiagnostics();
  });

  // Restore session
  const saved = getSessionUser();
  if (saved) setSessionUser(saved);

  setManches("MC");
  computeTotal();
}

wire();