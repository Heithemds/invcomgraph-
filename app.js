/* ===========================
   Inventaire Atelier — app.js
   - Supabase (centralisé)
   - Auth simple (app_users)
   - OCR par zones (Tesseract + crops)
   =========================== */

/* ====== CONFIG ====== */
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co"; // <-- mets ton URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";            // <-- mets ton anon key (public)

const LS_SESSION_KEY = "inv_atelier_session_v1";

/* ====== HELPERS DOM ====== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setText(sel, txt) {
  const el = $(sel);
  if (el) el.textContent = txt;
}

function setValue(sel, val) {
  const el = $(sel);
  if (el) el.value = val ?? "";
}

function getValue(sel) {
  const el = $(sel);
  return el ? (el.value ?? "").trim() : "";
}

function show(el, yes = true) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

function toast(msg) {
  // simple fallback (tu peux remplacer par un toast UI)
  alert(msg);
}

/* ====== SUPABASE INIT ====== */
let sb = null;

function initSupabase() {
  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase SDK non chargé (check <script supabase-js> dans index.html)");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("TONPROJET")) {
      throw new Error("Config Supabase manquante (URL / ANON KEY).");
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (e) {
    console.error(e);
    toast("Supabase init failed: " + e.message);
    return false;
  }
}

/* ====== CRYPTO (hash PIN) ====== */
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeName(name) {
  return (name || "").trim();
}

function isPin6(pin) {
  return /^\d{6}$/.test(pin);
}

/* ====== SESSION ====== */
function saveSession(session) {
  localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(LS_SESSION_KEY);
}

function setLoggedUI(session) {
  // Adapte selon tes sections HTML (ex: #authSection, #appSection)
  const authSection = $("#authSection");
  const appSection = $("#appSection");
  const userBadge = $("#userBadge");      // ex: affiche "Mouna"
  const btnLogout = $("#btnLogout");

  if (session?.user) {
    show(authSection, false);
    show(appSection, true);
    if (userBadge) userBadge.textContent = session.user.name;
    if (btnLogout) btnLogout.disabled = false;
  } else {
    show(authSection, true);
    show(appSection, false);
    if (userBadge) userBadge.textContent = "";
    if (btnLogout) btnLogout.disabled = true;
  }
}

/* ====== DB: app_users ======
   Tables attendues:
   - app_users: id(uuid), name(text unique), pin_hash(text), created_at(timestamp default now())
   - inventory_counts: id(uuid), designation text, ref text, grammage int, couleur text, manches text,
     carton_code text, tailles_json jsonb, counted_by uuid (ou text), created_at timestamp default now()
*/

async function registerUser(name, pin, pin2) {
  name = normalizeName(name);
  if (!name) return toast("Nom requis.");
  if (!isPin6(pin)) return toast("PIN doit contenir 6 chiffres.");
  if (pin !== pin2) return toast("Confirmation PIN incorrecte.");

  const pin_hash = await sha256(pin);

  // Vérifier existence
  const { data: existing, error: e1 } = await sb
    .from("app_users")
    .select("id,name")
    .eq("name", name)
    .maybeSingle();

  if (e1) {
    console.error(e1);
    return toast("Erreur lecture app_users: " + e1.message);
  }
  if (existing) return toast("Utilisateur existe déjà. Utilise Connexion.");

  // Créer
  const { data, error } = await sb
    .from("app_users")
    .insert([{ name, pin_hash }])
    .select("id,name")
    .single();

  if (error) {
    console.error(error);
    return toast("Inscription échouée: " + error.message);
  }

  const session = { user: { id: data.id, name: data.name } };
  saveSession(session);
  setLoggedUI(session);
}

async function loginUser(name, pin) {
  name = normalizeName(name);
  if (!name) return toast("Nom requis.");
  if (!isPin6(pin)) return toast("PIN doit contenir 6 chiffres.");

  const pin_hash = await sha256(pin);

  const { data, error } = await sb
    .from("app_users")
    .select("id,name,pin_hash")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    console.error(error);
    return toast("Connexion échouée: " + error.message);
  }
  if (!data) return toast("Utilisateur introuvable. Fais Inscription.");

  if (data.pin_hash !== pin_hash) return toast("PIN incorrect.");

  const session = { user: { id: data.id, name: data.name } };
  saveSession(session);
  setLoggedUI(session);
}

function logout() {
  clearSession();
  setLoggedUI(null);
}

/* ====== INVENTORY FORM ====== */
function readSizes() {
  // Inputs attendus: <input data-size="XS"> etc
  const sizes = {};
  $$("[data-size]").forEach(inp => {
    const key = inp.getAttribute("data-size");
    const raw = (inp.value ?? "").trim();
    if (raw === "") return;
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) sizes[key] = n;
  });
  return sizes;
}

function calcTotal(sizesObj) {
  return Object.values(sizesObj).reduce((a, b) => a + (Number(b) || 0), 0);
}

function getManches() {
  // boutons radio / toggle: #btnMC #btnML ou select #manches
  const sel = $("#manches");
  if (sel) return (sel.value || "").trim();

  const mc = $("#btnMC");
  const ml = $("#btnML");
  // si tu as un système de "selected" class
  if (mc?.classList.contains("selected")) return "MC";
  if (ml?.classList.contains("selected")) return "ML";

  // fallback: checkbox
  const mcChk = $("#mc");
  const mlChk = $("#ml");
  if (mcChk?.checked) return "MC";
  if (mlChk?.checked) return "ML";

  return "";
}

function setManches(val) {
  const sel = $("#manches");
  if (sel) {
    sel.value = val;
    return;
  }
  const mc = $("#btnMC");
  const ml = $("#btnML");
  if (mc && ml) {
    mc.classList.toggle("selected", val === "MC");
    ml.classList.toggle("selected", val === "ML");
  }
}

async function submitInventory() {
  const session = loadSession();
  if (!session?.user?.id) return toast("Connecte-toi d'abord.");

  const designation = getValue("#designation");
  const ref = getValue("#ref");
  const grammageRaw = getValue("#grammage");
  const couleur = getValue("#couleur");
  const manches = getManches();
  const carton_code = getValue("#cartonCode");

  const tailles_json = readSizes();
  const total = calcTotal(tailles_json);

  const grammage = grammageRaw ? parseInt(grammageRaw, 10) : null;
  if (grammageRaw && Number.isNaN(grammage)) return toast("Grammage invalide.");

  if (!ref) return toast("Référence obligatoire.");
  if (!manches) return toast("Manches obligatoire (MC ou ML).");
  if (total <= 0) return toast("Aucune quantité saisie.");

  const payload = {
    designation: designation || null,
    ref,
    grammage,
    couleur: couleur || null,
    manches,
    carton_code: carton_code || null,
    tailles_json,
    counted_by: session.user.id
  };

  const { error } = await sb.from("inventory_counts").insert([payload]);

  if (error) {
    console.error(error);
    return toast("Envoi échoué: " + error.message);
  }

  toast("Enregistré ✅");
  // reset quantités (option)
  $$("[data-size]").forEach(inp => (inp.value = ""));
  setText("#totalCarton", "0");
}

/* ====== OCR PAR ZONES ======
   Principe:
   - on prend une photo
   - on "crop" des rectangles fixes (en %) -> zones texte
   - Tesseract sur chaque crop
   - on remplit les champs
   NOTE: il faut une étiquette TOUJOURS cadrée pareil (verticale, A5)
*/

function ensureTesseract() {
  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    toast("Tesseract non chargé (check <script tesseract> dans index.html)");
    return false;
  }
  return true;
}

function createCanvasFromImage(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function cropCanvas(srcCanvas, rectPct) {
  const { x, y, w, h } = rectPct;
  const sw = srcCanvas.width, sh = srcCanvas.height;

  const rx = Math.round(x * sw);
  const ry = Math.round(y * sh);
  const rw = Math.round(w * sw);
  const rh = Math.round(h * sh);

  const c = document.createElement("canvas");
  c.width = Math.max(1, rw);
  c.height = Math.max(1, rh);
  const ctx = c.getContext("2d");
  ctx.drawImage(srcCanvas, rx, ry, rw, rh, 0, 0, c.width, c.height);
  return c;
}

async function ocrCanvas(canvas, opts = {}) {
  const {
    lang = "eng",
    whitelist = null
  } = opts;

  const cfg = {};
  if (whitelist) cfg.tessedit_char_whitelist = whitelist;

  const { data } = await window.Tesseract.recognize(canvas, lang, {
    logger: () => {},
    ...cfg
  });

  return (data?.text || "").trim();
}

function cleanText(t) {
  return (t || "")
    .replace(/\s+/g, " ")
    .replace(/[|]/g, "I")
    .trim();
}

function cleanRef(t) {
  // garde lettres+chiffres
  return cleanText(t).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function cleanNumber(t) {
  const m = (t || "").match(/\d+/);
  return m ? m[0] : "";
}

/* Zones en % (à ajuster si ton template change)
   Référence : ton étiquette A5 "ETIQUETTE INVENTAIRE CARTON"
   Les champs manuscrits sont dans les cases à droite.
*/
const ZONES = {
  designation: { x: 0.38, y: 0.16, w: 0.56, h: 0.08 },
  ref:         { x: 0.38, y: 0.26, w: 0.56, h: 0.08 },
  couleur:     { x: 0.38, y: 0.36, w: 0.56, h: 0.08 },
  grammage:    { x: 0.38, y: 0.46, w: 0.56, h: 0.08 },
  manches:     { x: 0.38, y: 0.56, w: 0.56, h: 0.08 }
};

async function scanLabelFromFile(file) {
  const session = loadSession();
  if (!session?.user?.id) return toast("Connecte-toi d'abord.");
  if (!ensureTesseract()) return;

  setText("#scanStatus", "Scan en cours…");

  const img = new Image();
  img.src = URL.createObjectURL(file);

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const { canvas } = createCanvasFromImage(img);

  // OCR zone par zone (plus fiable qu’un OCR global)
  try {
    const cDesignation = cropCanvas(canvas, ZONES.designation);
    const cRef = cropCanvas(canvas, ZONES.ref);
    const cCouleur = cropCanvas(canvas, ZONES.couleur);
    const cGrammage = cropCanvas(canvas, ZONES.grammage);
    const cManches = cropCanvas(canvas, ZONES.manches);

    const [tDesignation, tRef, tCouleur, tGrammage, tManches] = await Promise.all([
      ocrCanvas(cDesignation, { lang: "eng" }),
      ocrCanvas(cRef,         { lang: "eng", whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-" }),
      ocrCanvas(cCouleur,     { lang: "eng" }),
      ocrCanvas(cGrammage,    { lang: "eng", whitelist: "0123456789" }),
      ocrCanvas(cManches,     { lang: "eng", whitelist: "MCLmcl" })
    ]);

    const designation = cleanText(tDesignation);
    const ref = cleanRef(tRef);
    const couleur = cleanText(tCouleur);
    const grammage = cleanNumber(tGrammage);

    // manches : détecte MC / ML
    const m = cleanText(tManches).toUpperCase();
    let manches = "";
    if (m.includes("MC")) manches = "MC";
    if (m.includes("ML")) manches = "ML";

    // Remplissage UI
    if (designation) setValue("#designation", designation);
    if (ref) setValue("#ref", ref);
    if (couleur) setValue("#couleur", couleur);
    if (grammage) setValue("#grammage", grammage);
    if (manches) setManches(manches);

    setText("#scanStatus", "Scan OK. Vérifie/corrige puis Valider & Envoyer.");
  } catch (e) {
    console.error(e);
    setText("#scanStatus", "Scan échoué. Essaie lumière forte + étiquette bien cadrée.");
    toast("OCR échoué: " + e.message);
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/* ====== BIND UI ====== */
function bindUI() {
  // Auth buttons
  $("#btnRegister")?.addEventListener("click", async () => {
    if (!sb && !initSupabase()) return;
    const name = getValue("#regName");
    const pin = getValue("#regPin");
    const pin2 = getValue("#regPin2");
    await registerUser(name, pin, pin2);
  });

  $("#btnLogin")?.addEventListener("click", async () => {
    if (!sb && !initSupabase()) return;
    const name = getValue("#loginName");
    const pin = getValue("#loginPin");
    await loginUser(name, pin);
  });

  $("#btnLogout")?.addEventListener("click", () => logout());

  // Manches toggle (option)
  $("#btnMC")?.addEventListener("click", () => setManches("MC"));
  $("#btnML")?.addEventListener("click", () => setManches("ML"));

  // Total carton live
  const updateTotal = () => {
    const total = calcTotal(readSizes());
    setText("#totalCarton", String(total));
  };
  $$("[data-size]").forEach(inp => inp.addEventListener("input", updateTotal));

  // Submit inventory
  $("#btnSubmit")?.addEventListener("click", async () => {
    if (!sb && !initSupabase()) return;
    await submitInventory();
  });

  // Scanner
  // input file attendu: <input id="scanInput" type="file" accept="image/*" capture="environment">
  $("#scanBtn")?.addEventListener("click", () => $("#scanInput")?.click());

  $("#scanInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await scanLabelFromFile(file);
    e.target.value = ""; // reset
  });
}

/* ====== BOOT ====== */
(function boot() {
  // init supabase (non bloquant : si config manquante, il alerte)
  initSupabase();

  bindUI();

  // Restaurer session si existe
  const session = loadSession();
  setLoggedUI(session);

  // Check “SDK loaded” pour éviter les surprises
  if (!window.supabase?.createClient) {
    console.warn("Supabase SDK absent: vérifie index.html");
  }
  if (!window.Tesseract?.recognize) {
    console.warn("Tesseract absent: vérifie index.html");
  }
})();