/* =========================
   CONFIG SUPABASE
========================= */
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co"; // <-- ton URL
const SUPABASE_ANON_KEY = "REPLACE_ME"; // <-- mets ta clé anon ici

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================
   UI HELPERS
========================= */
const $ = (id) => document.getElementById(id);

const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];

function toast(msg, type="") {
  const t = $("toast");
  t.className = "toast " + (type || "");
  t.textContent = msg;
}

function setOcrProgress(pct, label="") {
  $("ocrBar").style.width = `${Math.max(0, Math.min(100, pct))}%`;
  $("ocrStatus").textContent = label || "OCR…";
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function onlyDigits(s) {
  return (s || "").replace(/[^\d]/g, "");
}

/* =========================
   RÈGLES MÉTIER
========================= */

// règle: I -> 1 si contexte numérique (ref, grammage, quantités)
function ITo1_ifNumericContext(s) {
  if (!s) return s;
  return s.replace(/I/g, "1");
}

function normalizeRef(raw) {
  // exemples: "E19I" -> "E191"
  let s = normalizeSpaces(raw).toUpperCase();
  s = ITo1_ifNumericContext(s);
  // enlève espaces internes
  s = s.replace(/\s+/g, "");
  // garde seulement A-Z0-9
  s = s.replace(/[^A-Z0-9]/g, "");
  // format attendu : 1 lettre + 3 chiffres (E191)
  const m = s.match(/^([A-Z])(\d{3})$/);
  return m ? (m[1] + m[2]) : s; // si pas conforme, on renvoie quand même pour correction manuelle
}

function normalizeSleeve(raw) {
  let s = normalizeSpaces(raw).toUpperCase();
  s = s.replace(/\s+/g, "");
  if (s === "MC" || s === "ML") return s;
  // tolérances OCR
  if (s === "M C") return "MC";
  if (s === "M L") return "ML";
  // si OCR sort un truc proche
  if (s.includes("MC")) return "MC";
  if (s.includes("ML")) return "ML";
  return "";
}

function normalizeColor(raw) {
  // on garde la casse “title-ish” mais sans sur-normaliser
  let s = normalizeSpaces(raw);
  // fixes OCR fréquents
  s = s.replace(/Darc?k\s*Grey/i, "Dark Grey");
  s = s.replace(/Urban\s*Orange/i, "Urban Orange");
  return s;
}

function normalizeDesignation(raw) {
  let s = normalizeSpaces(raw);
  if (!s) return "";
  // corrections rapides
  s = s.replace(/T\s*s\s*h\s*i\s*r\s*t/i, "Tshirt");
  s = s.replace(/T\s*shirt/i, "Tshirt");
  return s;
}

function parseSizesFromText(text) {
  // essaie de repérer "L 50", "XL 13", etc.
  const out = {};
  SIZES.forEach(k => out[k] = 0);

  const upper = (text || "").toUpperCase();
  // tolérance: "X L" -> "XL", etc.
  const cleaned = upper.replace(/\s+/g, " ");

  // patterns: "XL 13" / "XL: 13" / "XL=13"
  for (const size of SIZES) {
    const re = new RegExp(`\\b${size.replace("3XL","3XL").replace("4XL","4XL")}\\b\\s*[:=]?\\s*(\\d{1,4})`, "g");
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      out[size] = Math.max(out[size], parseInt(m[1], 10) || 0);
    }
  }

  // fallback: certaines écritures collées ex "L50"
  for (const size of SIZES) {
    const re2 = new RegExp(`\\b${size}\\s*(\\d{1,4})\\b`, "g");
    let m2;
    while ((m2 = re2.exec(cleaned)) !== null) {
      out[size] = Math.max(out[size], parseInt(m2[1], 10) || 0);
    }
  }

  return out;
}

/* =========================
   CAM + OCR
========================= */
let stream = null;

async function startCamera() {
  const video = $("video");
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  });
  video.srcObject = stream;
  await video.play();

  $("btnCapture").disabled = false;
  $("btnStopCam").disabled = false;
  toast("Caméra OK. Cadre l’étiquette puis clique Scanner.", "ok");
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  $("video").srcObject = null;
  $("btnCapture").disabled = true;
  $("btnStopCam").disabled = true;
  toast("Caméra arrêtée.", "");
}

function captureFrame() {
  // capture temporaire dans canvas (pas d’upload photo)
  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

async function runOCR(canvas) {
  setOcrProgress(1, "OCR démarré…");

  const worker = await Tesseract.createWorker("eng"); // eng lit bien lettres/chiffres/couleurs
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:-= /"
  });

  let lastPct = 1;
  worker.logger = (m) => {
    if (m.status === "recognizing text") {
      const pct = Math.round((m.progress || 0) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        setOcrProgress(pct, `OCR… ${pct}%`);
      }
    }
  };

  const { data } = await worker.recognize(canvas);
  await worker.terminate();

  setOcrProgress(100, "OCR terminé.");
  return data.text || "";
}

/* =========================
   EXTRACTION CHAMPS (OCR -> formulaire)
========================= */
function extractFieldsFromOcr(ocrText) {
  const raw = ocrText || "";
  const lines = raw.split("\n").map(l => normalizeSpaces(l)).filter(Boolean);
  const up = lines.map(l => l.toUpperCase());

  // Heuristiques simples (V1 rapide)
  // - ref: cherche pattern lettre + 3 chiffres (avec I possible)
  // - grammage: nombre 2-3 chiffres, souvent 150-300
  // - manches: MC/ML
  // - couleur: ligne “longue” non numérique (ex Dark Grey)
  // - designation: première ligne “mot” type Tshirt

  let designation = "";
  let ref = "";
  let grammage = "";
  let manches = "";
  let couleur = "";

  // ref
  for (const l of lines) {
    const candidate = normalizeRef(l);
    if (/^[A-Z]\d{3}$/.test(candidate)) { ref = candidate; break; }
  }

  // manches
  for (const l of lines) {
    const s = normalizeSleeve(l);
    if (s === "MC" || s === "ML") { manches = s; break; }
  }

  // grammage
  // on prend le premier nombre 2-3 chiffres plausible
  for (const l of lines) {
    const x = ITo1_ifNumericContext(l);
    const m = x.match(/\b(1\d{2}|2\d{2}|3\d{2})\b/); // 100-399
    if (m) { grammage = m[1]; break; }
  }

  // designation: première ligne “texte” sans trop de chiffres
  for (const l of lines) {
    if (!/\d/.test(l) && l.length >= 3 && l.length <= 20) {
      designation = normalizeDesignation(l);
      break;
    }
  }

  // couleur: ligne qui contient des lettres et espaces, pas trop courte, pas “REFERENCE”
  for (const l of lines) {
    const u = l.toUpperCase();
    if (
      /[A-Z]/i.test(l) &&
      !/REFERENCE|RÉF|DESIGNATION|GRAMMAGE|QUANTIT|TAILLE|TOTAL|MANCHES/i.test(u) &&
      !/^\w\d{3}$/.test(normalizeRef(l)) &&
      l.length >= 4
    ) {
      // évite de prendre "TSHIRT"
      if (!/^TSHIRT|T-SHIRT|POLO|CHEMISE$/i.test(l)) {
        couleur = normalizeColor(l);
        break;
      }
    }
  }

  // tailles
  const tailles = parseSizesFromText(raw);

  return { designation, ref, grammage, couleur, manches, tailles, raw };
}

function fillForm(fields) {
  if (fields.designation) $("designation").value = fields.designation;
  if (fields.ref) $("ref").value = fields.ref;
  if (fields.grammage) $("grammage").value = fields.grammage;
  if (fields.couleur) $("couleur").value = fields.couleur;
  if (fields.manches) setSleeve(fields.manches);

  // tailles
  for (const k of SIZES) {
    const el = document.querySelector(`[data-size="${k}"]`);
    if (el) el.value = fields.tailles?.[k] ? String(fields.tailles[k]) : "";
  }

  $("ocrRaw").textContent = fields.raw || "";
  calcTotal();
  toast("Champs pré-remplis. Corrige si besoin puis Valider & Envoyer.", "ok");
}

/* =========================
   LOGIN SIMPLE (nom + PIN)
========================= */
let currentUser = null;

async function loginOrCreate(name, pin) {
  const n = normalizeSpaces(name);
  const p = (pin || "").trim();

  if (!n) throw new Error("Nom requis.");
  if (!/^\d{6}$/.test(p)) throw new Error("PIN doit être 6 chiffres.");

  // cherche user
  const { data: existing, error: e1 } = await sb
    .from("app_users")
    .select("*")
    .eq("name", n)
    .limit(1);

  if (e1) throw e1;

  if (existing && existing.length) {
    const user = existing[0];
    if (String(user.pin) !== p) throw new Error("PIN incorrect.");
    return user;
  }

  // create
  const { data: created, error: e2 } = await sb
    .from("app_users")
    .insert({ name: n, pin: p })
    .select()
    .single();

  if (e2) throw e2;
  return created;
}

/* =========================
   DB INSERT INVENTORY
========================= */
function readSizesFromUI() {
  const tailles = {};
  for (const k of SIZES) {
    const el = document.querySelector(`[data-size="${k}"]`);
    let v = (el?.value || "").trim();
    v = ITo1_ifNumericContext(v);
    v = onlyDigits(v);
    tailles[k] = v ? parseInt(v, 10) : 0;
  }
  return tailles;
}

function calcTotal() {
  const tailles = readSizesFromUI();
  const sum = Object.values(tailles).reduce((a,b)=>a+(b||0),0);
  $("totalCarton").textContent = String(sum);
  return sum;
}

async function sendToDb() {
  if (!currentUser) throw new Error("Non connecté.");

  const designation = normalizeSpaces($("designation").value);
  const ref = normalizeRef($("ref").value);
  const grammage = onlyDigits(ITo1_ifNumericContext($("grammage").value));
  const couleur = normalizeColor($("couleur").value);
  const manches = normalizeSleeve($("manches").value || "");
  const carton_code = normalizeSpaces($("cartonCode").value);

  if (!ref) throw new Error("Référence requise.");
  if (!couleur) throw new Error("Couleur requise.");
  if (!(manches === "MC" || manches === "ML")) throw new Error("Manches doit être MC ou ML.");

  const tailles_json = readSizesFromUI();
  const total = calcTotal();
  if (total <= 0) throw new Error("Total carton = 0. Rien à envoyer.");

  const payload = {
    designation: designation || null,
    grammage: grammage ? parseInt(grammage, 10) : null,
    ref,
    couleur,
    manches,
    carton_code: carton_code || null,
    tailles_json,
    counted_by: currentUser.name
  };

  const { error } = await sb.from("inventory_counts").insert(payload);
  if (error) throw error;

  toast(`OK envoyé. Compté par: ${currentUser.name}`, "ok");
}

/* =========================
   UI INIT
========================= */
function buildSizesGrid() {
  const grid = $("sizesGrid");
  grid.innerHTML = "";
  for (const k of SIZES) {
    const div = document.createElement("div");
    div.className = "size";
    div.innerHTML = `
      <div class="k">${k}</div>
      <input data-size="${k}" inputmode="numeric" placeholder="0" />
    `;
    grid.appendChild(div);
  }
}

function setSleeve(v) {
  const val = (v || "").toUpperCase();
  $("manches").value = val;

  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sleeve === val);
  });
}

function showApp() {
  $("cardLogin").classList.add("hidden");
  $("cardApp").classList.remove("hidden");
  $("btnLogout").classList.remove("hidden");
}

function showLogin() {
  $("cardLogin").classList.remove("hidden");
  $("cardApp").classList.add("hidden");
  $("btnLogout").classList.add("hidden");
  currentUser = null;
}

/* =========================
   EVENTS
========================= */
window.addEventListener("DOMContentLoaded", () => {
  buildSizesGrid();
  setSleeve("");

  // sleeve buttons
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => setSleeve(btn.dataset.sleeve));
  });

  // calc
  $("btnCalc").addEventListener("click", calcTotal);
  $("sizesGrid").addEventListener("input", () => calcTotal());

  // login
  $("btnLogin").addEventListener("click", async () => {
    try {
      $("loginHint").textContent = "";
      const name = $("loginName").value;
      const pin = $("loginPin").value;
      const user = await loginOrCreate(name, pin);
      currentUser = user;
      showApp();
      toast(`Connecté: ${currentUser.name}`, "ok");
    } catch (e) {
      $("loginHint").textContent = e.message || String(e);
      toast(e.message || "Erreur connexion", "bad");
    }
  });

  $("btnLogout").addEventListener("click", () => {
    stopCamera();
    showLogin();
    toast("Déconnecté.", "");
  });

  // camera
  $("btnStartCam").addEventListener("click", async () => {
    try {
      await startCamera();
    } catch (e) {
      toast("Caméra refusée ou indisponible.", "bad");
    }
  });

  $("btnStopCam").addEventListener("click", () => stopCamera());

  // capture + OCR
  $("btnCapture").addEventListener("click", async () => {
    try {
      const canvas = captureFrame();
      setOcrProgress(1, "Capture OK. OCR…");

      const text = await runOCR(canvas);
      const fields = extractFieldsFromOcr(text);
      fillForm(fields);

      // on stoppe caméra si tu veux économiser
      // stopCamera();
    } catch (e) {
      toast("OCR échoué. Re-cadre l’étiquette, meilleure lumière.", "bad");
    }
  });

  // send
  $("btnSend").addEventListener("click", async () => {
    try {
      await sendToDb();
    } catch (e) {
      toast(e.message || "Erreur envoi", "bad");
    }
  });

  toast("Prêt. Connecte-toi puis scanne une étiquette.", "");
});