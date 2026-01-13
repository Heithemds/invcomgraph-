/* =========================
   CONFIG — À REMPLACER
========================= */
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

/* =========================
   INIT
========================= */
let sb = null;
try {
  if (!window.supabase?.createClient) throw new Error("Supabase SDK non chargé");
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  alert("Supabase init failed: " + e.message);
}

const $ = (id) => document.getElementById(id);

const authCard = $("authCard");
const appCard  = $("appCard");

const authName = $("authName");
const authPin  = $("authPin");
const btnRegister = $("btnRegister");
const btnLogin = $("btnLogin");
const authMsg = $("authMsg");

const whoami = $("whoami");
const btnLogout = $("btnLogout");

const btnOpenCamera = $("btnOpenCamera");
const photoInput = $("photoInput");
const btnClear = $("btnClear");
const btnSubmit = $("btnSubmit");

const scanStatus = $("scanStatus");
const saveMsg = $("saveMsg");

const designation = $("designation");
const grammage = $("grammage");
const ref = $("ref");
const couleur = $("couleur");
const carton_code = $("carton_code");
const manchesHidden = $("manches");
const totalCarton = $("totalCarton");

const segBtns = Array.from(document.querySelectorAll(".segbtn"));
const sizeInputs = Array.from(document.querySelectorAll('input[data-size]'));

const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];

/* =========================
   HELPERS
========================= */
function setMsg(el, text, kind = "") {
  el.textContent = text || "";
  el.classList.remove("ok","err");
  if (kind) el.classList.add(kind);
}
function normName(n) {
  return (n || "").trim();
}
function normPin(p) {
  return (p || "").replace(/\D/g,"").slice(0,6);
}
function normalizeIas1(s) {
  // règle demandée: I = 1
  return (s || "").replace(/I/g, "1").replace(/l/g, "1");
}
function onlyDigits(s) {
  return (s || "").replace(/\D/g,"");
}
function toIntSafe(v) {
  const n = parseInt((v||"").toString().replace(/[^\d]/g,""), 10);
  return Number.isFinite(n) ? n : 0;
}
function computeTotal() {
  const t = sizeInputs.reduce((acc, inp) => acc + toIntSafe(inp.value), 0);
  totalCarton.textContent = String(t);
}
sizeInputs.forEach(i => i.addEventListener("input", computeTotal));

segBtns.forEach(b=>{
  b.addEventListener("click", ()=>{
    segBtns.forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    manchesHidden.value = b.dataset.manches;
  });
});
// default active MC
segBtns.find(b=>b.dataset.manches==="MC")?.classList.add("active");

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function setSession(user) {
  localStorage.setItem("inv_user", JSON.stringify(user));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem("inv_user")||"null"); }
  catch { return null; }
}
function clearSession() {
  localStorage.removeItem("inv_user");
}

/* =========================
   UI STATE
========================= */
function showApp(userName) {
  authCard.classList.add("hidden");
  appCard.classList.remove("hidden");
  whoami.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
  whoami.textContent = "👤 " + userName;
}
function showAuth() {
  authCard.classList.remove("hidden");
  appCard.classList.add("hidden");
  whoami.classList.add("hidden");
  btnLogout.classList.add("hidden");
}

/* =========================
   AUTH: REGISTER & LOGIN
========================= */
async function registerUser() {
  setMsg(authMsg, "", "");
  const name = normName(authName.value);
  const pin = normPin(authPin.value);

  if (!name) return setMsg(authMsg, "Nom obligatoire.", "err");
  if (pin.length !== 6) return setMsg(authMsg, "PIN doit être 6 chiffres.", "err");

  btnRegister.disabled = true;
  btnLogin.disabled = true;

  try {
    // check exists
    const { data: exists, error: e1 } = await sb
      .from("app_users")
      .select("id,name,pin_hash")
      .eq("name", name)
      .maybeSingle();

    if (e1) throw e1;
    if (exists) return setMsg(authMsg, "Ce nom existe déjà. Utilise 'Connecter'.", "err");

    const pin_hash = await sha256(pin);

    const { data, error } = await sb
      .from("app_users")
      .insert([{ name, pin_hash }])
      .select("id,name")
      .single();

    if (error) throw error;

    setSession({ id: data.id, name: data.name });
    setMsg(authMsg, "Compte créé. Connexion OK.", "ok");
    showApp(data.name);
  } catch (e) {
    setMsg(authMsg, "Erreur inscription: " + (e.message || e.toString()), "err");
  } finally {
    btnRegister.disabled = false;
    btnLogin.disabled = false;
  }
}

async function loginUser() {
  setMsg(authMsg, "", "");
  const name = normName(authName.value);
  const pin = normPin(authPin.value);

  if (!name) return setMsg(authMsg, "Nom obligatoire.", "err");
  if (pin.length !== 6) return setMsg(authMsg, "PIN doit être 6 chiffres.", "err");

  btnRegister.disabled = true;
  btnLogin.disabled = true;

  try {
    const { data, error } = await sb
      .from("app_users")
      .select("id,name,pin_hash")
      .eq("name", name)
      .single();

    if (error) throw error;

    const pin_hash = await sha256(pin);
    if (pin_hash !== data.pin_hash) {
      return setMsg(authMsg, "PIN incorrect.", "err");
    }

    setSession({ id: data.id, name: data.name });
    setMsg(authMsg, "Connexion OK.", "ok");
    showApp(data.name);
  } catch (e) {
    setMsg(authMsg, "Erreur connexion: " + (e.message || e.toString()), "err");
  } finally {
    btnRegister.disabled = false;
    btnLogin.disabled = false;
  }
}

btnRegister.addEventListener("click", registerUser);
btnLogin.addEventListener("click", loginUser);

btnLogout.addEventListener("click", ()=>{
  clearSession();
  showAuth();
  setMsg(authMsg, "Déconnecté.", "");
});

/* =========================
   CLEAR FORM
========================= */
function clearForm() {
  designation.value = "";
  grammage.value = "";
  ref.value = "";
  couleur.value = "";
  carton_code.value = "";
  manchesHidden.value = "MC";
  segBtns.forEach(x=>x.classList.remove("active"));
  segBtns.find(b=>b.dataset.manches==="MC")?.classList.add("active");
  sizeInputs.forEach(i=>i.value = "");
  computeTotal();
  setMsg(scanStatus, "");
  setMsg(saveMsg, "");
}
btnClear.addEventListener("click", clearForm);

/* =========================
   CAMERA / PHOTO SCAN (OCR)
========================= */
btnOpenCamera.addEventListener("click", ()=>{
  // ouvre la prise de photo
  photoInput.click();
});

photoInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  await scanLabelFromImage(file);
  // reset input to allow scanning same photo again
  photoInput.value = "";
});

async function scanLabelFromImage(file) {
  setMsg(scanStatus, "Scan en cours... (OCR)", "");
  try {
    if (!window.Tesseract) throw new Error("Tesseract non chargé");

    const { data: { text } } = await window.Tesseract.recognize(file, "eng+fra", {
      logger: m => {
        if (m.status === "recognizing text") {
          setMsg(scanStatus, `Scan OCR... ${Math.round((m.progress||0)*100)}%`, "");
        }
      }
    });

    const cleaned = cleanupOCR(text);
    setMsg(scanStatus, "Scan OK. Vérifie/corrige puis Valider & Envoyer.", "ok");

    const parsed = parseLabel(cleaned);

    // apply
    if (parsed.designation) designation.value = parsed.designation;
    if (parsed.grammage) grammage.value = parsed.grammage;
    if (parsed.ref) ref.value = parsed.ref;
    if (parsed.couleur) couleur.value = parsed.couleur;
    if (parsed.manches) {
      manchesHidden.value = parsed.manches;
      segBtns.forEach(x=>x.classList.toggle("active", x.dataset.manches===parsed.manches));
    }

    // sizes
    for (const s of SIZES) {
      const inp = sizeInputs.find(i=>i.dataset.size===s);
      if (inp && parsed.tailles[s] != null) inp.value = String(parsed.tailles[s]);
    }
    computeTotal();
  } catch (e) {
    setMsg(scanStatus, "Erreur scan: " + (e.message || e.toString()), "err");
  }
}

function cleanupOCR(t) {
  let s = (t || "").replace(/\r/g,"\n");
  // normalise
  s = s.replace(/[ ]{2,}/g," ");
  s = s.replace(/\n{2,}/g,"\n");
  // règle I=1 sur zones chiffrées sera appliquée au parsing
  return s.trim();
}

function parseLabel(text) {
  // Heuristique robuste pour ton étiquette
  // On cherche mots clés + lignes proches.
  const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);

  const out = {
    designation: "",
    grammage: "",
    ref: "",
    couleur: "",
    manches: "",
    tailles: {}
  };

  // helper to find line index containing keyword
  const findIdx = (kw) => lines.findIndex(l => l.toUpperCase().includes(kw));

  // DESIGNATION
  {
    const i = findIdx("DESIGNATION");
    if (i >= 0) out.designation = (lines[i+1] || "").slice(0,40);
  }

  // GRAMMAGE
  {
    const i = findIdx("GRAMMAGE");
    if (i >= 0) {
      const cand = normalizeIas1(lines[i+1] || "");
      const g = onlyDigits(cand);
      if (g) out.grammage = g;
    }
  }

  // REFERENCE
  {
    const i = findIdx("RÉFÉRENCE") >= 0 ? findIdx("RÉFÉRENCE") : findIdx("REFERENCE");
    if (i >= 0) {
      let cand = normalizeIas1(lines[i+1] || "");
      cand = cand.replace(/\s/g,"").toUpperCase();
      // garde alphanum
      cand = cand.replace(/[^A-Z0-9]/g,"");
      if (cand) out.ref = cand;
    } else {
      // fallback: cherche pattern type E191
      const p = lines.map(l=>normalizeIas1(l).toUpperCase().replace(/\s/g,""));
      const hit = p.find(l=>/^[A-Z]{1,3}\d{2,5}$/.test(l));
      if (hit) out.ref = hit;
    }
  }

  // COULEUR
  {
    const i = findIdx("COULEUR");
    if (i >= 0) {
      // parfois la ligne contient déjà la valeur
      const next = lines[i+1] || "";
      out.couleur = next.replace(/^[:\- ]+/,"").slice(0,40);
    }
  }

  // MANCHES
  {
    // cherche MC/ML
    const blob = lines.join(" ").toUpperCase();
    if (/\bML\b/.test(blob)) out.manches = "ML";
    else if (/\bMC\b/.test(blob)) out.manches = "MC";
  }

  // QUANTITES PAR TAILLE
  // OCR peut sortir: "L 50 XL 13" etc.
  {
    const blob = normalizeIas1(lines.join(" ").toUpperCase());
    const sizePatterns = [
      ["XS", /\bXS\b\s*([0-9]{1,4})/],
      ["S",  /\bS\b\s*([0-9]{1,4})/],
      ["M",  /\bM\b\s*([0-9]{1,4})/],
      ["L",  /\bL\b\s*([0-9]{1,4})/],
      ["XL", /\bXL\b\s*([0-9]{1,4})/],
      ["XXL",/\bXXL\b\s*([0-9]{1,4})/],
      ["3XL",/\b3XL\b\s*([0-9]{1,4})/],
      ["4XL",/\b4XL\b\s*([0-9]{1,4})/],
      ["5XL",/\b5XL\b\s*([0-9]{1,4})/],
      ["6XL",/\b6XL\b\s*([0-9]{1,4})/],
      ["7XL",/\b7XL\b\s*([0-9]{1,4})/],
      ["8XL",/\b8XL\b\s*([0-9]{1,4})/],
    ];
    for (const [s, re] of sizePatterns) {
      const m = blob.match(re);
      if (m) out.tailles[s] = parseInt(m[1],10);
    }

    // fallback: cherche couples "TAILLE nombre" sur lignes
    for (const l of lines) {
      const L = normalizeIas1(l.toUpperCase());
      for (const s of SIZES) {
        const re = new RegExp(`\\b${s}\\b\\s*([0-9]{1,4})`);
        const m = L.match(re);
        if (m) out.tailles[s] = parseInt(m[1],10);
      }
    }
  }

  // cleanup final
  out.designation = (out.designation||"").trim();
  out.couleur = (out.couleur||"").trim();
  out.ref = (out.ref||"").trim();

  return out;
}

/* =========================
   SAVE COUNT (CENTRAL DB)
========================= */
btnSubmit.addEventListener("click", async ()=>{
  setMsg(saveMsg, "", "");
  const sess = getSession();
  if (!sess?.name) return setMsg(saveMsg, "Pas connecté.", "err");

  // Validate fields minimal
  const d = designation.value.trim();
  const g = onlyDigits(normalizeIas1(grammage.value));
  const r = normalizeIas1(ref.value).replace(/\s/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const c = couleur.value.trim();
  const m = (manchesHidden.value === "ML") ? "ML" : "MC";
  const cc = carton_code.value.trim();

  if (!r) return setMsg(saveMsg, "Référence obligatoire.", "err");
  if (!c) return setMsg(saveMsg, "Couleur obligatoire.", "err");

  // tailles_json
  const tailles = {};
  for (const inp of sizeInputs) {
    const s = inp.dataset.size;
    const v = toIntSafe(inp.value);
    if (v > 0) tailles[s] = v; // on n’envoie que les tailles présentes
  }

  const total = Object.values(tailles).reduce((a,b)=>a+b,0);

  if (total <= 0) return setMsg(saveMsg, "Quantités vides. Mets au moins une taille.", "err");

  btnSubmit.disabled = true;
  try {
    const payload = {
      carton_code: cc || null,
      designation: d || null,
      grammage: g || null,
      ref: r,
      couleur: c,
      manches: m,
      tailles_json: tailles,
      total_carton: total,
      counted_by: sess.name
    };

    const { error } = await sb.from("inventory_counts").insert([payload]);
    if (error) throw error;

    setMsg(saveMsg, "Enregistré ✅ (base centralisée).", "ok");
    clearForm();
  } catch (e) {
    setMsg(saveMsg, "Erreur enregistrement: " + (e.message || e.toString()), "err");
  } finally {
    btnSubmit.disabled = false;
  }
});

/* =========================
   BOOT
========================= */
(function boot(){
  computeTotal();
  const sess = getSession();
  if (sess?.name) showApp(sess.name);
  else showAuth();
})();