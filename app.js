/* ========= CONFIG SUPABASE =========
   Mets ici TA clé anon "Project API keys > anon public"
   (NE JAMAIS mettre la service_role dans un site public)
==================================== */
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

/* ====== DOM ====== */
const $ = (id) => document.getElementById(id);

const authCard = $("authCard");
const appCard  = $("appCard");

const authName = $("authName");
const authPin  = $("authPin");
const authPin2 = $("authPin2");
const btnSignup= $("btnSignup");
const btnLogin = $("btnLogin");
const authMsg  = $("authMsg");

const userChip = $("userChip");
const userName = $("userName");
const btnLogout= $("btnLogout");

const btnScan  = $("btnScan");
const btnClear = $("btnClear");
const btnSubmit= $("btnSubmit");
const fileScan = $("fileScan");
const scanMsg  = $("scanMsg");

const designation = $("designation");
const reference   = $("reference");
const grammage    = $("grammage");
const couleur     = $("couleur");
const codeCarton  = $("codeCarton");

const btnMC = $("btnMC");
const btnML = $("btnML");

const totalCartonEl = $("totalCarton");
const diagBox = $("diagBox");

let supa = null;
let currentUser = null;
let manchesValue = ""; // "MC" | "ML"

/* ====== INIT ====== */
document.addEventListener("DOMContentLoaded", async () => {
  safeDiag("Init…");

  // 1) Vérif SDK Supabase
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    setMsg(authMsg, "Supabase SDK non chargé. Vérifie <script supabase-js> dans index.html", true);
    return;
  }
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith("COLLE_")) {
    setMsg(authMsg, "Colle ta clé Supabase anon public dans app.js (SUPABASE_ANON_KEY).", true);
    return;
  }

  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setMsg(authMsg, "Prêt. Tu peux te connecter ou t’inscrire.", false);

  // Restore session (localStorage)
  const saved = localStorage.getItem("inv_user");
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      enterApp();
    } catch {}
  }

  // Events
  btnSignup.addEventListener("click", onSignup);
  btnLogin.addEventListener("click", onLogin);
  btnLogout.addEventListener("click", logout);

  btnScan.addEventListener("click", () => fileScan.click());
  fileScan.addEventListener("change", onFileSelected);

  btnClear.addEventListener("click", clearForm);
  btnSubmit.addEventListener("click", submitInventory);

  btnMC.addEventListener("click", () => setManches("MC"));
  btnML.addEventListener("click", () => setManches("ML"));

  document.querySelectorAll('input[data-size]').forEach(inp => {
    inp.addEventListener("input", updateTotal);
  });

  updateTotal();
});

/* ====== UI Helpers ====== */
function setMsg(el, text, isError=false, isOk=false){
  el.textContent = text || "";
  el.className = "msg" + (isError ? " err" : isOk ? " ok" : "");
}

function safeDiag(line){
  if (!diagBox) return;
  const t = new Date().toISOString().replace("T"," ").slice(0,19);
  diagBox.textContent += `[${t}] ${line}\n`;
}

function enterApp(){
  authCard.classList.add("hidden");
  appCard.classList.remove("hidden");
  userChip.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
  userName.textContent = currentUser?.name || "—";
  setMsg(scanMsg, "Prêt. Clique sur Scanner 📸", false);
}

function logout(){
  localStorage.removeItem("inv_user");
  currentUser = null;
  authCard.classList.remove("hidden");
  appCard.classList.add("hidden");
  userChip.classList.add("hidden");
  btnLogout.classList.add("hidden");
  setMsg(authMsg, "Déconnecté.", false);
}

function setManches(v){
  manchesValue = v;
  btnMC.classList.toggle("active", v==="MC");
  btnML.classList.toggle("active", v==="ML");
}

/* ====== AUTH ====== */
function normalizeName(s){
  return (s || "").trim().replace(/\s+/g, " ");
}

function pinOk(pin){
  return /^\d{6}$/.test(pin || "");
}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function onSignup(){
  try{
    const name = normalizeName(authName.value);
    const pin  = (authPin.value || "").trim();
    const pin2 = (authPin2.value || "").trim();

    if (!name) return setMsg(authMsg, "Nom requis.", true);
    if (!pinOk(pin)) return setMsg(authMsg, "PIN invalide (6 chiffres).", true);
    if (pin !== pin2) return setMsg(authMsg, "Confirmation PIN différente.", true);

    setMsg(authMsg, "Inscription…", false);

    // Check existing
    const { data: existing, error: e1 } = await supa
      .from("app_users")
      .select("id,name")
      .ilike("name", name)
      .limit(1);

    if (e1) return setMsg(authMsg, `Erreur app_users: ${e1.message}`, true);
    if (existing && existing.length) return setMsg(authMsg, "Ce nom existe déjà. Utilise Connecter.", true);

    const pin_hash = await sha256Hex(pin);

    // Insert (essaie pin_hash, sinon fallback pin si colonne différente)
    let ins = await supa.from("app_users").insert({ name, pin_hash }).select("id,name").single();
    if (ins.error && /column .*pin_hash/i.test(ins.error.message)) {
      ins = await supa.from("app_users").insert({ name, pin }).select("id,name").single();
    }
    if (ins.error) return setMsg(authMsg, `Inscription KO: ${ins.error.message}`, true);

    currentUser = { id: ins.data.id, name: ins.data.name };
    localStorage.setItem("inv_user", JSON.stringify(currentUser));

    setMsg(authMsg, "Inscription OK ✅", false, true);
    enterApp();
  } catch(err){
    setMsg(authMsg, `Erreur inscription: ${err?.message || err}`, true);
  }
}

async function onLogin(){
  try{
    const name = normalizeName(authName.value);
    const pin  = (authPin.value || "").trim();

    if (!name) return setMsg(authMsg, "Nom requis.", true);
    if (!pinOk(pin)) return setMsg(authMsg, "PIN invalide (6 chiffres).", true);

    setMsg(authMsg, "Connexion…", false);

    // Récupère user (essaie pin_hash, sinon pin)
    let q = await supa.from("app_users").select("id,name,pin_hash,pin").ilike("name", name).limit(1);
    if (q.error) return setMsg(authMsg, `Erreur app_users: ${q.error.message}`, true);

    const u = q.data?.[0];
    if (!u) return setMsg(authMsg, "Utilisateur introuvable. Utilise Inscrire.", true);

    if (u.pin_hash) {
      const pin_hash = await sha256Hex(pin);
      if (pin_hash !== u.pin_hash) return setMsg(authMsg, "PIN incorrect.", true);
    } else if (u.pin) {
      if (String(u.pin) !== pin) return setMsg(authMsg, "PIN incorrect.", true);
    } else {
      return setMsg(authMsg, "Schéma app_users inattendu (pas de pin/pin_hash).", true);
    }

    currentUser = { id: u.id, name: u.name };
    localStorage.setItem("inv_user", JSON.stringify(currentUser));

    setMsg(authMsg, "Connexion OK ✅", false, true);
    enterApp();
  } catch(err){
    setMsg(authMsg, `Erreur connexion: ${err?.message || err}`, true);
  }
}

/* ====== TOTAL ====== */
function toIntSafe(v){
  if (v === "" || v == null) return 0;
  const n = parseInt(String(v).replace(/[^\d]/g,""), 10);
  return Number.isFinite(n) ? n : 0;
}

function updateTotal(){
  let total = 0;
  document.querySelectorAll('input[data-size]').forEach(inp => {
    total += toIntSafe(inp.value);
  });
  totalCartonEl.textContent = String(total);
}

/* ====== CLEAR ====== */
function clearForm(){
  designation.value = "";
  reference.value = "";
  grammage.value = "";
  couleur.value = "";
  codeCarton.value = "";
  setManches("");
  document.querySelectorAll('input[data-size]').forEach(inp => inp.value = "");
  updateTotal();
  setMsg(scanMsg, "Vidé. Tu peux Scanner 📸", false);
}

/* ====== SUBMIT INVENTORY ====== */
async function submitInventory(){
  try{
    if (!currentUser) return setMsg(scanMsg, "Non connecté.", true);

    const rec = cleanRef(reference.value);
    const des = cleanFree(designation.value);
    const col = cleanFree(couleur.value);
    const gsm = cleanDigits(grammage.value);
    const code = cleanFree(codeCarton.value);

    if (!rec) return setMsg(scanMsg, "Référence requise.", true);
    if (!manchesValue) return setMsg(scanMsg, "Choisis MC ou ML.", true);

    const tailles = {};
    document.querySelectorAll('input[data-size]').forEach(inp => {
      const k = inp.getAttribute("data-size");
      const q = toIntSafe(inp.value);
      if (q > 0) tailles[k] = q;
    });

    const total = Object.values(tailles).reduce((a,b)=>a+b,0);

    const payload = {
      designation: des,
      ref: rec,
      couleur: col,
      grammage: gsm ? parseInt(gsm,10) : null,
      manches: manchesValue,
      code_carton: code || null,
      tailles_json: tailles,
      total_carton: total,
      counted_by: currentUser.name
    };

    setMsg(scanMsg, "Envoi…", false);

    const { error } = await supa.from("inventory_counts").insert(payload);
    if (error) return setMsg(scanMsg, `Envoi KO: ${error.message}`, true);

    setMsg(scanMsg, "Enregistré ✅", false, true);
    clearForm();
  } catch(err){
    setMsg(scanMsg, `Erreur envoi: ${err?.message || err}`, true);
  }
}

/* ====== SCAN & OCR ====== */
async function onFileSelected(){
  const file = fileScan.files?.[0];
  fileScan.value = ""; // reset
  if (!file) return;

  try{
    setMsg(scanMsg, "Photo reçue. Recadrage…", false);

    // createImageBitmap respecte l’orientation EXIF (super important sur mobile)
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });

    // 1) Draw to canvas
    const base = document.createElement("canvas");
    base.width = bmp.width;
    base.height = bmp.height;
    const bctx = base.getContext("2d", { willReadFrequently:true });
    bctx.drawImage(bmp, 0, 0);

    // 2) Auto-crop sur le cadre noir de l’étiquette
    const cropped = autoCropToLabelFrame(base);
    setMsg(scanMsg, "OCR… (patiente 5-15s selon le téléphone)", false);

    // 3) OCR par zones (sur l’image recadrée)
    const W = cropped.width, H = cropped.height;

    // ZONES (à partir du cadre complet)
    // Ajustées pour éviter les libellés imprimés (on vise la zone écrite)
    const zones = {
      designation: { x:0.18, y:0.12, w:0.50, h:0.12 },
      grammage:    { x:0.74, y:0.12, w:0.22, h:0.12 },
      reference:   { x:0.10, y:0.28, w:0.86, h:0.12 },
      couleur:     { x:0.18, y:0.44, w:0.50, h:0.10 },
      manches:     { x:0.77, y:0.44, w:0.18, h:0.10 }
    };

    const des = await ocrZone(cropped, zones.designation, { mode:"free" });
    const gsm = await ocrZone(cropped, zones.grammage,    { mode:"digits" });
    const ref = await ocrZone(cropped, zones.reference,   { mode:"ref" });
    const col = await ocrZone(cropped, zones.couleur,     { mode:"free" });
    const man = await ocrZone(cropped, zones.manches,     { mode:"manches" });

    // Fill fields
    if (des) designation.value = des;
    if (gsm) grammage.value = gsm;
    if (ref) reference.value = ref;
    if (col) couleur.value = col;

    if (man === "MC" || man === "ML") setManches(man);

    updateTotal();
    setMsg(scanMsg, "Scan OK. Vérifie/corrige puis Valider & Envoyer.", false, true);
  } catch(err){
    setMsg(scanMsg, `Scan KO: ${err?.message || err}`, true);
  }
}

/* ====== OCR utils ====== */
async function ocrZone(canvas, z, opt){
  const rect = {
    x: Math.round(z.x * canvas.width),
    y: Math.round(z.y * canvas.height),
    w: Math.round(z.w * canvas.width),
    h: Math.round(z.h * canvas.height),
  };

  // Extract zone into subcanvas + upscale (aide beaucoup l’OCR)
  const sub = document.createElement("canvas");
  sub.width = rect.w * 2;
  sub.height = rect.h * 2;
  const sctx = sub.getContext("2d", { willReadFrequently:true });

  // simple preprocessing: grayscale + contrast via draw then threshold
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, sub.width, sub.height);

  // threshold
  const img = sctx.getImageData(0,0,sub.width, sub.height);
  const d = img.data;
  for (let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const gray = (r*0.299 + g*0.587 + b*0.114);
    const v = gray < 170 ? 0 : 255; // ajustable
    d[i]=d[i+1]=d[i+2]=v;
  }
  sctx.putImageData(img,0,0);

  // OCR
  const lang = "eng"; // léger; ok pour chiffres/lettres
  const cfg = {
    tessedit_pageseg_mode: 6
  };

  let whitelist = null;
  if (opt?.mode === "digits") whitelist = "0123456789";
  if (opt?.mode === "ref") whitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
  if (opt?.mode === "manches") whitelist = "MCL";
  if (whitelist) cfg.tessedit_char_whitelist = whitelist;

  const res = await Tesseract.recognize(sub, lang, { logger: () => {} , ...cfg });
  const raw = (res?.data?.text || "").replace(/\n/g," ").trim();

  // Clean according to mode
  if (opt?.mode === "digits") return cleanDigits(raw);
  if (opt?.mode === "ref") return cleanRef(raw);
  if (opt?.mode === "manches") return cleanManches(raw);
  return cleanFree(raw);
}

function cleanFree(s){
  return (s || "")
    .replace(/[|]/g,"")
    .replace(/\s+/g," ")
    .trim()
    .slice(0, 60);
}

function cleanDigits(s){
  const out = (s || "").replace(/[^\d]/g,"").trim();
  // évite le “1” seul quand c’est un bruit
  if (out.length === 1) return "";
  return out.slice(0, 4);
}

function cleanRef(s){
  return (s || "")
    .toUpperCase()
    .replace(/\s+/g,"")
    .replace(/[^A-Z0-9-]/g,"")
    .replace(/I/g,"1") // ton règle
    .slice(0, 20);
}

function cleanManches(s){
  const t = (s || "").toUpperCase().replace(/[^A-Z]/g,"");
  if (t.includes("MC")) return "MC";
  if (t.includes("ML")) return "ML";
  // parfois l'OCR sort juste "M"
  if (t === "M") return "";
  return "";
}

/* ====== AUTO CROP (cadre noir) ======
   On cherche la zone la plus "noire" (traits du cadre),
   puis on recadre. Ça stabilise les zones OCR.
===================================== */
function autoCropToLabelFrame(canvas){
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  const { width:W, height:H } = canvas;

  // Downscale pour analyse rapide
  const s = 0.25; // 25% suffit
  const w = Math.max(200, Math.round(W*s));
  const h = Math.max(200, Math.round(H*s));

  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d", { willReadFrequently:true });
  tctx.drawImage(canvas, 0,0, W,H, 0,0, w,h);

  const img = tctx.getImageData(0,0,w,h);
  const d = img.data;

  // helper: count dark pixels in a column/row (sampling)
  const colDarkRatio = (x) => {
    let dark=0, total=0;
    for (let y=0;y<h;y+=2){
      const i = (y*w + x)*4;
      const gray = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
      if (gray < 140) dark++;
      total++;
    }
    return dark/total;
  };

  const rowDarkRatio = (y) => {
    let dark=0, total=0;
    for (let x=0;x<w;x+=2){
      const i = (y*w + x)*4;
      const gray = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
      if (gray < 140) dark++;
      total++;
    }
    return dark/total;
  };

  // seuils (cadre épais => ratio noir assez haut)
  const TH_COL = 0.12;
  const TH_ROW = 0.10;

  let left=0, right=w-1, top=0, bottom=h-1;

  for (let x=0;x<w;x++){
    if (colDarkRatio(x) > TH_COL) { left=x; break; }
  }
  for (let x=w-1;x>=0;x--){
    if (colDarkRatio(x) > TH_COL) { right=x; break; }
  }
  for (let y=0;y<h;y++){
    if (rowDarkRatio(y) > TH_ROW) { top=y; break; }
  }
  for (let y=h-1;y>=0;y--){
    if (rowDarkRatio(y) > TH_ROW) { bottom=y; break; }
  }

  // padding
  const pad = 8;
  left   = Math.max(0, left - pad);
  top    = Math.max(0, top - pad);
  right  = Math.min(w-1, right + pad);
  bottom = Math.min(h-1, bottom + pad);

  const cw = right-left;
  const ch = bottom-top;

  // Si crop incohérent, on retourne l'image originale
  if (cw < w*0.4 || ch < h*0.4) return canvas;

  // convert back to full-res coords
  const scaleX = W / w;
  const scaleY = H / h;

  const X = Math.round(left * scaleX);
  const Y = Math.round(top * scaleY);
  const CW = Math.round(cw * scaleX);
  const CH = Math.round(ch * scaleY);

  const out = document.createElement("canvas");
  out.width = CW;
  out.height = CH;
  out.getContext("2d").drawImage(canvas, X, Y, CW, CH, 0, 0, CW, CH);

  return out;
}