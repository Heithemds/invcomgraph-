
// =====================
// CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://pzagcexmeqwfznxskmxu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YWdjZXhtZXF3ZnpueHNrbXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjAwNzUsImV4cCI6MjA4MzgzNjA3NX0.tDwHz-sgowrbifeAZr3UItwn3Ue-B4d9wifXP4oisLY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================
// UI HELPERS
// =====================
const $ = (id) => document.getElementById(id);

const toastEl = $("toast");
function toast(msg, type="ok"){
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=> toastEl.className="toast", 2600);
}

function setDiag(msg){
  $("diagBox").textContent = msg;
}

function onlyDigits6(s){
  return (s || "").replace(/\D/g,"").slice(0,6);
}

function normalizeRef(ref){
  // règle: I = 1
  let r = (ref || "").trim().toUpperCase();
  r = r.replace(/I/g, "1");
  return r;
}

function intOrNull(v){
  if(v === null || v === undefined) return null;
  const s = String(v).trim();
  if(s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

// =====================
// SESSION LOCAL (appareil)
// =====================
const LS_KEY = "inv_atelier_session_v1"; // { name }
function getSession(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }catch{ return null; }
}
function setSession(sess){
  localStorage.setItem(LS_KEY, JSON.stringify(sess));
  refreshSessionUI();
}
function clearSession(){
  localStorage.removeItem(LS_KEY);
  refreshSessionUI();
}

// =====================
// UI ELEMENTS
// =====================
const authCard = $("authCard");
const entryCard = $("entryCard");
const whoami = $("whoami");
const sessionPill = $("sessionPill");
const btnLogout = $("btnLogout");

const authName = $("authName");
const authPin = $("authPin");
const authPin2 = $("authPin2");
const confirmWrap = $("confirmWrap");
const btnRegister = $("btnRegister");
const btnLogin = $("btnLogin");

// Entry fields
const designation = $("designation");
const grammage = $("grammage");
const ref = $("ref");
const couleur = $("couleur");
const cartonCode = $("cartonCode");

const mMC = $("mMC");
const mML = $("mML");

const btnCalc = $("btnCalc");
const btnSubmit = $("btnSubmit");
const btnReset = $("btnReset");
const totalEl = $("total");
const sizesGrid = $("sizesGrid");

// Sizes list (ajoute si besoin)
const SIZES = ["XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"];

let selectedManches = "MC";

// =====================
// BUILD SIZES GRID
// =====================
const sizeInputs = {};
function buildSizes(){
  sizesGrid.innerHTML = "";
  SIZES.forEach(sz=>{
    const wrap = document.createElement("div");
    wrap.className = "sizeItem";
    wrap.innerHTML = `
      <div class="sizeTag">${sz}</div>
      <input inputmode="numeric" placeholder="0" data-size="${sz}" />
    `;
    const inp = wrap.querySelector("input");
    inp.addEventListener("input", ()=>{
      inp.value = (inp.value || "").replace(/[^\d]/g,"");
      calcTotal();
    });
    sizeInputs[sz] = inp;
    sizesGrid.appendChild(wrap);
  });
}
buildSizes();

// =====================
// MANCHES SWITCH
// =====================
function setManches(v){
  selectedManches = v;
  mMC.classList.toggle("active", v==="MC");
  mML.classList.toggle("active", v==="ML");
}
mMC.addEventListener("click", ()=> setManches("MC"));
mML.addEventListener("click", ()=> setManches("ML"));
setManches("MC");

// =====================
// TOTAL
// =====================
function calcTotal(){
  let sum = 0;
  for(const sz of SIZES){
    const n = intOrNull(sizeInputs[sz].value);
    if(Number.isFinite(n)) sum += n;
  }
  totalEl.textContent = String(sum);
  return sum;
}
btnCalc.addEventListener("click", ()=>{
  const t = calcTotal();
  toast(`Total calculé : ${t}`, "ok");
});

// =====================
// AUTH: REGISTER / LOGIN
// =====================
authPin.addEventListener("input", ()=> authPin.value = onlyDigits6(authPin.value));
authPin2.addEventListener("input", ()=> authPin2.value = onlyDigits6(authPin2.value));

btnRegister.addEventListener("click", async ()=>{
  try{
    const name = (authName.value || "").trim();
    const pin = onlyDigits6(authPin.value);
    const pin2 = onlyDigits6(authPin2.value);

    if(!name) return toast("Nom obligatoire.", "bad");
    if(pin.length !== 6) return toast("PIN doit faire 6 chiffres.", "bad");

    // afficher champ confirmation si pas visible
    confirmWrap.style.display = "block";
    if(pin2.length !== 6) return toast("Confirme le PIN (6 chiffres).", "bad");
    if(pin !== pin2) return toast("PIN et confirmation ne correspondent pas.", "bad");

    const pin_hash = await sha256Hex(`${name.toLowerCase()}::${pin}`);

    // vérifier si existe déjà
    const { data: existing, error: e1 } = await supabase
      .from("app_users")
      .select("id,name")
      .eq("name", name)
      .maybeSingle();

    if(e1) throw e1;
    if(existing) return toast("Ce nom existe déjà. Utilise Se connecter.", "bad");

    const { error: e2 } = await supabase
      .from("app_users")
      .insert([{ name, pin_hash }]);

    if(e2) throw e2;

    setSession({ name });
    toast("Utilisateur créé. Connecté.", "ok");
  }catch(err){
    setDiag(String(err?.message || err));
    toast(`Erreur inscription: ${err?.message || err}`, "bad");
  }
});

btnLogin.addEventListener("click", async ()=>{
  try{
    const name = (authName.value || "").trim();
    const pin = onlyDigits6(authPin.value);

    confirmWrap.style.display = "none";
    authPin2.value = "";

    if(!name) return toast("Nom obligatoire.", "bad");
    if(pin.length !== 6) return toast("PIN doit faire 6 chiffres.", "bad");

    const pin_hash = await sha256Hex(`${name.toLowerCase()}::${pin}`);

    const { data, error } = await supabase
      .from("app_users")
      .select("id,name,pin_hash")
      .eq("name", name)
      .maybeSingle();

    if(error) throw error;
    if(!data) return toast("Nom inconnu. Fais S’inscrire.", "bad");

    if(data.pin_hash !== pin_hash){
      return toast("PIN incorrect.", "bad");
    }

    setSession({ name });
    toast("Connexion OK.", "ok");
  }catch(err){
    setDiag(String(err?.message || err));
    toast(`Erreur connexion: ${err?.message || err}`, "bad");
  }
});

btnLogout.addEventListener("click", ()=>{
  clearSession();
  toast("Déconnecté.", "ok");
});

// =====================
// RESET CARTON
// =====================
function resetCarton(){
  designation.value = "";
  grammage.value = "";
  ref.value = "";
  couleur.value = "";
  cartonCode.value = "";
  setManches("MC");
  for(const sz of SIZES) sizeInputs[sz].value = "";
  calcTotal();
}
btnReset.addEventListener("click", ()=>{
  resetCarton();
  toast("Nouveau carton prêt.", "ok");
});

// Auto normalize ref as user types
ref.addEventListener("input", ()=>{
  const pos = ref.selectionStart;
  const before = ref.value;
  const after = normalizeRef(before);
  if(after !== before){
    ref.value = after;
    ref.setSelectionRange(pos, pos);
  }
});

// =====================
// SUBMIT CARTON => inventory_counts (central)
// =====================
btnSubmit.addEventListener("click", async ()=>{
  try{
    const sess = getSession();
    if(!sess?.name) return toast("Connecte-toi d’abord.", "bad");

    const payload = {
      designation: (designation.value || "").trim() || null,
      grammage: intOrNull(grammage.value),
      ref: normalizeRef(ref.value),
      couleur: (couleur.value || "").trim() || null,
      manches: selectedManches,
      carton_code: (cartonCode.value || "").trim() || null,
      counted_by: sess.name,
      tailles_json: {}
    };

    if(!payload.ref) return toast("Référence obligatoire.", "bad");
    // tailles_json: seulement tailles saisies
    let hasQty = false;
    for(const sz of SIZES){
      const n = intOrNull(sizeInputs[sz].value);
      if(Number.isFinite(n) && n > 0){
        payload.tailles_json[sz] = n;
        hasQty = true;
      }
    }
    if(!hasQty) return toast("Saisis au moins une quantité.", "bad");

    // total calcul (info)
    const total = calcTotal();

    const { error } = await supabase
      .from("inventory_counts")
      .insert([payload]);

    if(error) throw error;

    toast(`Envoyé ✅ Total ${total}`, "ok");
    resetCarton();
  }catch(err){
    setDiag(String(err?.message || err));
    toast(`Erreur envoi: ${err?.message || err}`, "bad");
  }
});

// =====================
// SESSION UI
// =====================
function refreshSessionUI(){
  const sess = getSession();
  const on = !!sess?.name;

  authCard.style.display = on ? "none" : "block";
  entryCard.style.display = on ? "block" : "none";

  btnLogout.disabled = !on;
  sessionPill.textContent = on ? `Connecté: ${sess.name}` : "Hors connexion";
  whoami.textContent = on ? sess.name : "";

  if(!on){
    // garder confirm caché par défaut
    confirmWrap.style.display = "none";
    authPin2.value = "";
  }
}
refreshSessionUI();

// =====================
// DIAGNOSTIC CONNECTIVITY
// =====================
(async function boot(){
  try{
    const { error } = await supabase.from("app_users").select("id").limit(1);
    if(error) throw error;
    setDiag("Supabase OK. Tables accessibles.");
  }catch(err){
    setDiag("Supabase KO: " + (err?.message || err));
    toast("Supabase non accessible (clé/URL/politiques).", "bad");
  }
})();