(async () => {
"use strict";

/* ============================================================
   IMMOGEST — script.js
   Firebase Auth + Firestore + Storage
   ============================================================ */

/* ============================================================
   1. FIREBASE — Initialisation
   ============================================================ */
let db      = null;
let auth    = null;
let storage = null;
let currentUser = null; // utilisateur Firebase connecté

function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db      = firebase.firestore();
    auth    = firebase.auth();
    storage = firebase.storage();
    console.log("✅ Firebase connecté");
    return true;
  } catch(e) {
    console.error("❌ Firebase:", e);
    return false;
  }
}

function col(name) { return db.collection(name); }

/* ============================================================
   2. IMMEUBLES — Firestore
   ============================================================ */
const DEFAULT_BUILDINGS = [
  "Immeuble A","Immeuble B","Immeuble C",
  "Immeuble D","Immeuble E","Immeuble F",
  "Immeuble G","Immeuble H","Immeuble I"
];
let BUILDINGS = [...DEFAULT_BUILDINGS];

async function loadBuildings() {
  try {
    const snap = await db.doc("config/buildings").get();
    if (snap.exists && Array.isArray(snap.data().list) && snap.data().list.length === 9)
      BUILDINGS = snap.data().list;
  } catch(e) { console.warn("loadBuildings:", e); }
}
async function saveBuildings(arr) {
  BUILDINGS = arr;
  if (db) await db.doc("config/buildings").set({ list: arr });
}

/* ============================================================
   3. DONNÉES EN MÉMOIRE
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

let tasks=[], orders=[], spaces=[], apts=[];
let unsubTasks=null, unsubOrders=null, unsubSpaces=null, unsubApts=null;

function showFirestorePermissionWarning() {
  // Afficher un bandeau d'avertissement si les règles Firestore sont expirées
  if (document.getElementById("firestoreWarning")) return;
  const banner = document.createElement("div");
  banner.id = "firestoreWarning";
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:#dc2626;color:#fff;padding:.75rem 1.5rem;
    display:flex;align-items:center;gap:1rem;font-size:.88rem;font-weight:600;
    box-shadow:0 2px 8px rgba(0,0,0,.3);
  `;
  banner.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation" style="font-size:1.1rem;flex-shrink:0"></i>
    <span>⚠️ Règles Firestore expirées — Va sur 
      <a href="https://console.firebase.google.com/project/immogest-e11ff/firestore/rules" 
         target="_blank" style="color:#fde68a;text-decoration:underline">Firebase Console → Firestore → Règles</a>
      et remets le mode test (30 jours) ou copie les règles indiquées dans le README.
    </span>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;background:rgba(255,255,255,.2);border:none;color:#fff;padding:.3rem .7rem;border-radius:4px;cursor:pointer;font-size:.85rem">✕</button>
  `;
  document.body.prepend(banner);
}

function startListeners() {
  if(unsubTasks)  unsubTasks();
  if(unsubOrders) unsubOrders();
  if(unsubSpaces) unsubSpaces();
  if(unsubApts)   unsubApts();

  const onErr = err => { if(err.code==="permission-denied") showFirestorePermissionWarning(); };

  unsubTasks  = col("tasks" ).onSnapshot(s=>{ tasks  = s.docs.map(d=>({id:d.id,...d.data()})); renderDashboard(); if(document.getElementById("tab-tasks" ).classList.contains("active")) renderTasks();  }, onErr);
  unsubOrders = col("orders").onSnapshot(s=>{ orders = s.docs.map(d=>({id:d.id,...d.data()})); renderDashboard(); if(document.getElementById("tab-orders").classList.contains("active")) renderOrders(); }, onErr);
  unsubSpaces = col("spaces").onSnapshot(s=>{ spaces = s.docs.map(d=>({id:d.id,...d.data()})); renderDashboard(); if(document.getElementById("tab-spaces").classList.contains("active")) renderSpaces(); }, onErr);
  unsubApts   = col("apts"  ).onSnapshot(s=>{ apts   = s.docs.map(d=>({id:d.id,...d.data()})); renderDashboard(); if(document.getElementById("tab-spaces").classList.contains("active")) renderSpaces(); }, onErr);
}

async function fsAdd(col_name, data)              { const {id,...r}=data; await col(col_name).doc(id).set(r); return id; }
async function fsUpdate(col_name, id, data)       { const {id:_,...r}=data; await col(col_name).doc(id).set(r,{merge:true}); }
async function fsDelete(col_name, id)             { await col(col_name).doc(id).delete(); }

/* ============================================================
   4. LABELS
   ============================================================ */
const STATUS_TASK_LABELS  = { todo:"À faire", inprogress:"En cours", done:"Terminé" };
const PRIORITY_LABELS     = { high:"Haute", medium:"Moyenne", low:"Basse" };
const STATUS_ORDER_LABELS = { ordered:"Commandé", pending:"En attente", received:"Reçu" };
const TYPE_SPACE_LABELS   = { indoor:"Intérieur", outdoor:"Extérieur" };

/* ============================================================
   5. INTERFACE — Login / Logout
   ============================================================ */
const loginScreen   = document.getElementById("loginScreen");
const loginForm     = document.getElementById("loginForm");
const registerForm  = document.getElementById("registerForm");
const loginError    = document.getElementById("loginError");
const loginErrorMsg = document.getElementById("loginErrorMsg");
const registerError = document.getElementById("registerError");
const registerErrMsg= document.getElementById("registerErrorMsg");

function showLogin()  { loginScreen.classList.remove("hidden"); }
function hideLogin()  { loginScreen.classList.add("hidden"); }

/** Traduction des erreurs Firebase Auth en français */
function authErrFR(code) {
  const map = {
    "auth/invalid-email":            "Adresse e-mail invalide.",
    "auth/user-not-found":           "Aucun compte avec cet e-mail.",
    "auth/wrong-password":           "Mot de passe incorrect.",
    "auth/email-already-in-use":     "Cet e-mail est déjà utilisé.",
    "auth/weak-password":            "Le mot de passe doit faire au moins 6 caractères.",
    "auth/too-many-requests":        "Trop de tentatives. Réessayez plus tard.",
    "auth/network-request-failed":   "Erreur réseau. Vérifie ta connexion.",
    "auth/invalid-credential":       "Email ou mot de passe incorrect.",
  };
  return map[code] || "Erreur : " + code;
}

/* ---- Basculer entre Connexion ↔ Inscription via liens texte ---- */
function showLoginForm() {
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  loginError.classList.add("hidden");
  document.getElementById("loginEmail").focus();
}
function showRegisterForm() {
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  registerError.classList.add("hidden");
  document.getElementById("registerName").focus();
}

document.getElementById("goToRegister").addEventListener("click", e => {
  e.preventDefault();
  showRegisterForm();
});
document.getElementById("goToLogin").addEventListener("click", e => {
  e.preventDefault();
  showLoginForm();
});

/* ---- Connexion ---- */
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const email = document.getElementById("loginEmail").value.trim();
  const pw    = document.getElementById("loginPassword").value;
  if (!email || !pw) return;

  const btn = loginForm.querySelector(".login-btn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connexion…`;

  try {
    await auth.signInWithEmailAndPassword(email, pw);
    // onAuthStateChanged gère la suite
  } catch(err) {
    loginError.classList.remove("hidden");
    loginErrorMsg.textContent = authErrFR(err.code);
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Se connecter`;
  }
});

/* ---- Toggle visibilité mot de passe connexion ---- */
document.getElementById("loginTogglePw").addEventListener("click", () => {
  const inp = document.getElementById("loginPassword");
  const ico = document.getElementById("loginEyeIcon");
  if(inp.type==="password"){ inp.type="text"; ico.className="fa-solid fa-eye-slash"; }
  else { inp.type="password"; ico.className="fa-solid fa-eye"; }
});

/* ---- Aperçu photo dans le formulaire d'inscription ---- */
let registerAvatarFile = null;
document.getElementById("registerAvatarInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  registerAvatarFile = file;
  const prev = document.getElementById("registerAvatarPreview");
  const reader = new FileReader();
  reader.onload = ev => {
    prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  };
  reader.readAsDataURL(file);
});

/* ---- Inscription ---- */
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  registerError.classList.add("hidden");

  const name    = document.getElementById("registerName").value.trim();
  const email   = document.getElementById("registerEmail").value.trim();
  const pw      = document.getElementById("registerPassword").value;
  const confirm = document.getElementById("registerConfirm").value;

  if (!name)            { showRegisterError("Le nom est obligatoire.");                return; }
  if (!email)           { showRegisterError("L'e-mail est obligatoire.");              return; }
  if (pw.length < 6)   { showRegisterError("Mot de passe trop court (min. 6 car.)."); return; }
  if (pw !== confirm)  { showRegisterError("Les mots de passe ne correspondent pas."); return; }

  const btn = registerForm.querySelector(".login-btn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Création…`;

  try {
    // Créer l'utilisateur Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    const user = cred.user;

    // Mettre à jour le displayName
    await user.updateProfile({ displayName: name });

    // Uploader la photo si choisie
    if (registerAvatarFile) {
      const url = await uploadProfilePhoto(user.uid, registerAvatarFile);
      await user.updateProfile({ photoURL: url });
    }

    // Créer le profil dans Firestore
    await db.doc(`users/${user.uid}`).set({
      name,
      email,
      createdAt: new Date().toISOString()
    });

    showToast(`Compte créé ! Bienvenue ${name} 🎉`, "success");
    // onAuthStateChanged gère la connexion automatique
  } catch(err) {
    showRegisterError(authErrFR(err.code));
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Créer mon compte`;
  }
});

function showRegisterError(msg) {
  registerError.classList.remove("hidden");
  registerErrMsg.textContent = msg;
}

/* ---- Déconnexion ---- */
document.getElementById("navLogout").addEventListener("click", async e => {
  e.preventDefault();
  if (!confirm("Se déconnecter de ImmoGest ?")) return;
  closeMobileSidebar();
  await auth.signOut();
  // onAuthStateChanged affiche le login
});

/* ============================================================
   6. PHOTO DE PROFIL — Firebase Storage
   ============================================================ */
async function uploadProfilePhoto(uid, file) {
  const ext  = file.name.split(".").pop();
  const ref  = storage.ref(`profiles/${uid}/avatar.${ext}`);
  const snap = await ref.put(file);
  return await snap.ref.getDownloadURL();
}

/** Met à jour l'avatar dans la sidebar et l'admin */
function updateAvatarUI(photoURL, name) {
  // Sidebar
  const icon = document.getElementById("sidebarAvatarIcon");
  const img  = document.getElementById("sidebarAvatarImg");
  const nameEl = document.getElementById("sidebarUserName");
  if (nameEl) nameEl.textContent = name || "Concierge";

  if (photoURL) {
    icon.style.display = "none";
    img.src = photoURL;
    img.style.display = "block";
  } else {
    icon.style.display = "";
    img.style.display = "none";
  }

  // Admin panel
  const paIcon = document.getElementById("profileAvatarIcon");
  const paImg  = document.getElementById("profileAvatarImg");
  if (paIcon && paImg) {
    if (photoURL) { paIcon.style.display="none"; paImg.src=photoURL; paImg.style.display="block"; }
    else          { paIcon.style.display=""; paImg.style.display="none"; }
  }
  const pName  = document.getElementById("profileName");
  const pEmail = document.getElementById("profileEmail");
  if (pName  && currentUser) pName.value  = currentUser.displayName || "";
  if (pEmail && currentUser) pEmail.value = currentUser.email || "";
}

/* ============================================================
   7. onAuthStateChanged — Point d'entrée principal
   ============================================================ */
async function startAuthListener() {
  auth.onAuthStateChanged(async user => {
    if (user) {
      // Utilisateur connecté
      currentUser = user;
      hideLogin();
      updateAvatarUI(user.photoURL, user.displayName);
      await initApp();
    } else {
      // Déconnecté
      currentUser = null;
      // Détacher les listeners Firestore
      if(unsubTasks)  unsubTasks();
      if(unsubOrders) unsubOrders();
      if(unsubSpaces) unsubSpaces();
      if(unsubApts)   unsubApts();
      showLogin();
    }
  });
}

/* ============================================================
   8. PROFIL — édition depuis le panneau admin
   ============================================================ */

// Clic sur l'avatar de la sidebar → ouvre l'admin sur la section profil
document.getElementById("userInfoBar").addEventListener("click", () => {
  openAdmin();
});

// Changer la photo depuis l'admin
document.getElementById("profilePhotoInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  showToast("Upload en cours…", "info");
  try {
    const url = await uploadProfilePhoto(currentUser.uid, file);
    await currentUser.updateProfile({ photoURL: url });
    updateAvatarUI(url, currentUser.displayName);
    showToast("Photo de profil mise à jour !", "success");
  } catch(err) {
    showToast("Erreur lors de l'upload : " + err.message, "error");
  }
});

// Sauvegarder nom
document.getElementById("btnSaveProfile").addEventListener("click", async () => {
  const name = document.getElementById("profileName").value.trim();
  if (!name) { showToast("Le nom ne peut pas être vide.", "error"); return; }
  if (!currentUser) return;

  try {
    await currentUser.updateProfile({ displayName: name });
    await db.doc(`users/${currentUser.uid}`).set({ name }, { merge: true });
    updateAvatarUI(currentUser.photoURL, name);
    showToast("Profil mis à jour !", "success");
  } catch(err) {
    showToast("Erreur : " + err.message, "error");
  }
});

/* ============================================================
   7. UTILITAIRES HTML
   ============================================================ */
function escHtml(s){
  if(!s)return"";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function buildingOptions(sel=""){
  return BUILDINGS.map(b=>`<option value="${escHtml(b)}"${b===sel?" selected":""}>${escHtml(b)}</option>`).join("");
}
function taskStatusTag(s) { return `<span class="tag tag-${s}">${STATUS_TASK_LABELS[s]||s}</span>`; }
function priorityTag(p)   { return `<span class="tag tag-${p}">${PRIORITY_LABELS[p]||p}</span>`; }
function orderStatusTag(s){ return `<span class="tag tag-${s}">${STATUS_ORDER_LABELS[s]||s}</span>`; }
function formatDate(str){
  if(!str)return"—";
  try{ return new Date(str).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit",year:"numeric"}); }
  catch{ return str; }
}

/* ============================================================
   8. TOAST
   ============================================================ */
function showToast(msg, type="success"){
  const icons={success:"fa-circle-check",error:"fa-circle-exclamation",info:"fa-circle-info"};
  const c=document.getElementById("toastContainer");
  const t=document.createElement("div");
  t.className=`toast ${type}`;
  t.innerHTML=`<i class="fa-solid ${icons[type]}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>{
    t.style.animation="toastOut .3s cubic-bezier(.4,0,.2,1) forwards";
    setTimeout(()=>t.remove(),300);
  },3000);
}


/* ============================================================
   9. ADMINISTRATION
   ============================================================ */
const adminOverlay = document.getElementById("adminOverlay");

document.getElementById("navAdmin").addEventListener("click", e => {
  e.preventDefault();
  closeMobileSidebar();
  openAdmin();
});
document.getElementById("adminClose").addEventListener("click", closeAdmin);
adminOverlay.addEventListener("click", e => { if(e.target===adminOverlay) closeAdmin(); });

function openAdmin() {
  renderBuildingsRenameGrid();
  // Pré-remplir les champs du profil
  if (currentUser) {
    const n = document.getElementById("profileName");
    const em = document.getElementById("profileEmail");
    if (n)  n.value  = currentUser.displayName || "";
    if (em) em.value = currentUser.email || "";
    updateAvatarUI(currentUser.photoURL, currentUser.displayName);
  }
  adminOverlay.classList.remove("hidden");
}
function closeAdmin() {
  adminOverlay.classList.add("hidden");
}

/** Rendu de la grille de renommage des immeubles */
function renderBuildingsRenameGrid() {
  const grid = document.getElementById("buildingsRenameGrid");
  grid.innerHTML = BUILDINGS.map((b,i) => `
    <div class="building-rename-row">
      <div class="building-rename-index">${i+1}</div>
      <input class="building-rename-input" type="text" value="${escHtml(b)}"
             placeholder="Nom de l'immeuble ${i+1}" maxlength="40"
             data-index="${i}"/>
    </div>`).join("");
}

/** Enregistrer les noms d'immeubles */
document.getElementById("btnSaveBuildings").addEventListener("click", async () => {
  const inputs = document.querySelectorAll(".building-rename-input");
  const newNames = [];
  let hasEmpty = false;
  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (!val) hasEmpty = true;
    newNames.push(val || BUILDINGS[inp.dataset.index]);
  });
  if (hasEmpty) { showToast("Chaque immeuble doit avoir un nom.", "error"); return; }
  saveBuildings(newNames);
  refreshBuildingSelects();
  renderDashboard();
  showToast("Noms des immeubles enregistrés !", "success");
  closeAdmin();
});

/** Réinitialiser les noms */
document.getElementById("btnResetBuildings").addEventListener("click", async () => {
  if (!confirm("Remettre les noms par défaut (Immeuble A … I) ?")) return;
  saveBuildings([...DEFAULT_BUILDINGS]);
  renderBuildingsRenameGrid();
  refreshBuildingSelects();
  renderDashboard();
  showToast("Noms réinitialisés.", "info");
});

/** Réinitialiser toutes les données */
document.getElementById("btnResetAllData").addEventListener("click", async () => {
  if (!confirm("⚠️ Attention ! Cette action supprimera DÉFINITIVEMENT toutes les tâches, commandes, places et appartements.\n\nÊtes-vous sûr ?")) return;
  if (!confirm("Dernière confirmation : supprimer toutes les données ?")) return;

  const deleteCol = async (name) => {
    const snap = await col(name).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  };
  await Promise.all(["tasks","orders","spaces","apts"].map(deleteCol));
  closeAdmin();
  showToast("Toutes les données ont été supprimées.", "info");
});

/** Met à jour tous les <select> d'immeubles dans l'app */
function refreshBuildingSelects() {
  const selects = [
    "filterTaskBuilding","filterOrderBuilding",
    "filterSpaceBuilding"
  ];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">Tous</option>` +
      BUILDINGS.map(b=>`<option value="${escHtml(b)}"${b===current?" selected":""}>${escHtml(b)}</option>`).join("");
  });
  // Mettre à jour le footer
  document.getElementById("footerBuildingCount").textContent = `${BUILDINGS.length} immeubles`;
}

/* ============================================================
   11. NAVIGATION
   ============================================================ */
const TAB_TITLES = {
  dashboard:"Tableau de bord", tasks:"Tâches",
  orders:"Commandes", spaces:"Places & Appartements"
};
document.querySelectorAll(".nav-item[data-tab]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
    closeMobileSidebar();
  });
});
function switchTab(tabId){
  if(!tabId) return;

  // Sécurité : vérifier que l'onglet existe dans le DOM avant d'agir
  const tabEl = document.getElementById(`tab-${tabId}`);
  if(!tabEl) return; // tabId inconnu (ex: lien externe dans la sidebar) → on ignore

  document.querySelectorAll(".nav-item[data-tab]").forEach(l=>l.classList.remove("active"));
  const navEl = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if(navEl) navEl.classList.add("active");

  document.querySelectorAll(".tab-content").forEach(s=>s.classList.remove("active"));
  tabEl.classList.add("active");

  const titleEl = document.getElementById("topbarTitle");
  if(titleEl) titleEl.textContent = TAB_TITLES[tabId] || tabId;

  if(tabId==="dashboard") renderDashboard();
  if(tabId==="tasks")     renderTasks();
  if(tabId==="orders")    renderOrders();
  if(tabId==="spaces")    renderSpaces();
  if(tabId==="compta")    renderCompta();
}

/* -------- Sidebar mobile -------- */
const sidebar   = document.getElementById("sidebar");
const mobileBtn = document.getElementById("mobileMenuBtn");
const backdrop  = document.createElement("div");
backdrop.className="sidebar-backdrop";
document.body.appendChild(backdrop);
mobileBtn.addEventListener("click",()=>{ sidebar.classList.toggle("open"); backdrop.classList.toggle("visible"); });
backdrop.addEventListener("click",closeMobileSidebar);
function closeMobileSidebar(){ sidebar.classList.remove("open"); backdrop.classList.remove("visible"); }

/* ============================================================
   12. DATE
   ============================================================ */
function updateDate(){
  const now=new Date();
  let s=now.toLocaleDateString("fr-CH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const el=document.getElementById("dateDisplay");
  if(el) el.textContent=s.charAt(0).toUpperCase()+s.slice(1);
}
updateDate();

/* ============================================================
   13. MODAL
   ============================================================ */
let modalSaveCallback=null;
const modalOverlay=document.getElementById("modalOverlay");
const modalTitle=document.getElementById("modalTitle");
const modalBody=document.getElementById("modalBody");
const modalSaveBtn=document.getElementById("modalSave");

function openModal(title,html,onSave){
  modalTitle.textContent=title;
  modalBody.innerHTML=html;
  modalSaveCallback=onSave;
  modalOverlay.classList.remove("hidden");
}
function closeModal(){
  modalOverlay.classList.add("hidden");
  modalSaveCallback=null;
  modalBody.innerHTML="";
}
document.getElementById("modalClose").addEventListener("click",closeModal);
document.getElementById("modalCancel").addEventListener("click",closeModal);
modalOverlay.addEventListener("click",e=>{ if(e.target===modalOverlay) closeModal(); });
modalSaveBtn.addEventListener("click", async ()=>{ if(modalSaveCallback) await modalSaveCallback(); });
function mval(id){ const e=document.getElementById(id); return e?e.value.trim():""; }

/* ============================================================
   14. DASHBOARD
   ============================================================ */
function renderDashboard(){
  const el=id=>document.getElementById(id);
  el("kpiPending").textContent    = tasks.filter(t=>t.status==="todo").length;
  el("kpiInProgress").textContent = tasks.filter(t=>t.status==="inprogress").length;
  el("kpiOrders").textContent     = orders.filter(o=>o.status!=="received").length;
  el("kpiSpaces").textContent     = spaces.length;
  el("kpiApts").textContent       = apts.length;
  el("badgeTasks").textContent    = tasks.filter(t=>t.status!=="done").length;
  el("badgeOrders").textContent   = orders.filter(o=>o.status==="ordered"||o.status==="pending").length;

  el("buildingsGrid").innerHTML = BUILDINGS.map(b=>{
    const n=tasks.filter(t=>t.building===b&&t.status!=="done").length;
    return `<div class="building-tile">
      <i class="fa-solid fa-building"></i>
      <div class="bld-name">${escHtml(b)}</div>
      <div class="bld-tasks">${n?`${n} tâche${n>1?"s":""} active${n>1?"s":""}`:"Tout OK ✓"}</div>
    </div>`;
  }).join("");

  const high=tasks.filter(t=>t.priority==="high"&&t.status!=="done");
  const todayEl=el("todayTasks");
  if(!high.length){
    todayEl.innerHTML=`<p class="empty-msg"><i class="fa-regular fa-circle-check"></i>Aucune tâche haute priorité</p>`;
  } else {
    todayEl.innerHTML=high.map(t=>`
      <div class="task-mini">
        <div class="task-mini-dot ${t.priority}"></div>
        <div>
          <div class="task-mini-title">${escHtml(t.title)}</div>
          <div class="task-mini-meta">${escHtml(t.building)} · ${taskStatusTag(t.status)}</div>
        </div>
      </div>`).join("");
  }
}

/* ============================================================
   15. TÂCHES
   ============================================================ */
const filterTaskBuilding=()=>document.getElementById("filterTaskBuilding");
const filterTaskStatus=()=>document.getElementById("filterTaskStatus");
const filterTaskPriority=()=>document.getElementById("filterTaskPriority");
const filterTaskSearch=()=>document.getElementById("filterTaskSearch");

function bindTaskFilters(){
  [filterTaskBuilding(),filterTaskStatus(),filterTaskPriority(),filterTaskSearch()]
    .forEach(e=>{ if(e) e.addEventListener("input",renderTasks); });
}

function getFilteredTasks(){
  let list=[...tasks];
  const b=filterTaskBuilding()?.value||"",
        s=filterTaskStatus()?.value||"",
        p=filterTaskPriority()?.value||"",
        q=(filterTaskSearch()?.value||"").toLowerCase();
  if(b) list=list.filter(t=>t.building===b);
  if(s) list=list.filter(t=>t.status===s);
  if(p) list=list.filter(t=>t.priority===p);
  if(q) list=list.filter(t=>t.title.toLowerCase().includes(q)||(t.description||"").toLowerCase().includes(q));
  const po={high:0,medium:1,low:2};
  list.sort((a,b)=>(po[a.priority]||2)-(po[b.priority]||2));
  return list;
}

function renderTasks(){
  const list=getFilteredTasks();
  const c=document.getElementById("tasksList");
  if(!list.length){
    c.innerHTML=`<div class="card"><p class="empty-msg"><i class="fa-solid fa-list-check"></i>Aucune tâche trouvée</p></div>`;
    return;
  }
  c.innerHTML=list.map(t=>`
    <div class="task-card priority-${t.priority} status-${t.status}">
      <button class="task-status-btn" data-id="${t.id}" title="Changer le statut">
        ${t.status==="done"?'<i class="fa-solid fa-check"></i>':""}
      </button>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}</div>
        <div class="task-meta">
          ${taskStatusTag(t.status)}${priorityTag(t.priority)}
          <span class="tag tag-building"><i class="fa-solid fa-building"></i> ${escHtml(t.building)}</span>
          ${t.description?`<span class="tag tag-building" style="background:transparent;border:none;color:var(--text-light);font-weight:400">${escHtml(t.description)}</span>`:""}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon edit"   data-id="${t.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon delete" data-id="${t.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join("");

  c.querySelectorAll(".task-status-btn").forEach(b=>b.addEventListener("click", async ()=>toggleTaskStatus(b.dataset.id)));
  c.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click", async ()=>editTask(b.dataset.id)));
  c.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click", async ()=>deleteTask(b.dataset.id)));
  document.getElementById("badgeTasks").textContent=tasks.filter(t=>t.status!=="done").length;
}

function toggleTaskStatus(id){
  const t=tasks.find(t=>t.id===id); if(!t)return;
  const c={todo:"inprogress",inprogress:"done",done:"todo"};
  t.status=c[t.status];
  fsUpdate("tasks",t.id,t); renderTasks(); renderDashboard();
  showToast(`Statut : ${STATUS_TASK_LABELS[t.status]}`,"info");
}

function taskFormHTML(t={}){
  return `
    <div class="form-group"><label>Titre *</label>
      <input id="fTitle" type="text" placeholder="Ex : Nettoyer hall d'entrée" value="${escHtml(t.title||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Immeuble</label>
        <select id="fBuilding">${buildingOptions(t.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group"><label>Priorité</label>
        <select id="fPriority">
          <option value="high"   ${t.priority==="high"  ?"selected":""}>🔴 Haute</option>
          <option value="medium" ${t.priority==="medium"?"selected":""}>🟠 Moyenne</option>
          <option value="low"    ${(!t.priority||t.priority==="low")?"selected":""}>🟢 Basse</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Statut</label>
      <select id="fStatus">
        <option value="todo"       ${(!t.status||t.status==="todo")      ?"selected":""}>À faire</option>
        <option value="inprogress" ${t.status==="inprogress"             ?"selected":""}>En cours</option>
        <option value="done"       ${t.status==="done"                   ?"selected":""}>Terminé</option>
      </select>
    </div>
    <div class="form-group"><label>Description</label>
      <textarea id="fDesc" placeholder="Détails supplémentaires…">${escHtml(t.description||"")}</textarea>
    </div>`;
}

document.getElementById("btnAddTask").addEventListener("click", async ()=>{
  openModal("Nouvelle tâche",taskFormHTML(), async ()=>{
    const title=mval("fTitle");
    if(!title){showToast("Le titre est obligatoire.","error");return;}
    const newTask={id:uid(),title,building:mval("fBuilding"),priority:mval("fPriority"),status:mval("fStatus"),description:mval("fDesc")};
    await fsAdd("tasks",newTask); closeModal();
    showToast("Tâche ajoutée !","success");
  });
});
async function editTask(id){
  const t=tasks.find(t=>t.id===id); if(!t)return;
  openModal("Modifier la tâche",taskFormHTML(t), async ()=>{
    const title=mval("fTitle");
    if(!title){showToast("Le titre est obligatoire.","error");return;}
    Object.assign(t,{title,building:mval("fBuilding"),priority:mval("fPriority"),status:mval("fStatus"),description:mval("fDesc")});
    await fsUpdate("tasks",t.id,t); closeModal();
    showToast("Tâche mise à jour.","success");
  });
}
async function deleteTask(id){
  if(!confirm("Supprimer cette tâche ?"))return;
  await fsDelete("tasks",id);
  showToast("Tâche supprimée.","info");
}

/* ============================================================
   16. COMMANDES MULTI-PRODUITS
   ============================================================ */
function bindOrderFilters(){
  [document.getElementById("filterOrderStatus"),
   document.getElementById("filterOrderBuilding"),
   document.getElementById("filterOrderSearch")].forEach(e=>{ if(e) e.addEventListener("input",renderOrders); });
}

function getFilteredOrders(){
  let list=[...orders];
  const st=document.getElementById("filterOrderStatus")?.value||"",
        bl=document.getElementById("filterOrderBuilding")?.value||"",
        q=(document.getElementById("filterOrderSearch")?.value||"").toLowerCase();
  if(st) list=list.filter(o=>o.status===st);
  if(bl) list=list.filter(o=>o.building===bl);
  if(q)  list=list.filter(o=>
    (o.supplier||"").toLowerCase().includes(q)||
    (o.items||[]).some(i=>i.name.toLowerCase().includes(q))||
    (o.notes||"").toLowerCase().includes(q));
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  return list;
}

async function renderOrders(){
  const list=getFilteredOrders();
  const c=document.getElementById("ordersList");
  if(!list.length){
    c.innerHTML=`<div class="card"><p class="empty-msg"><i class="fa-solid fa-box-open"></i>Aucune commande trouvée</p></div>`;
    return;
  }
  c.innerHTML=list.map(o=>{
    const n=(o.items||[]).length;
    const preview=(o.items||[]).slice(0,3).map(i=>escHtml(i.name)).join(", ");
    const more=n>3?` <span style="color:var(--blue);font-weight:600">+${n-3} produit${n-3>1?"s":""}</span>`:"";
    return `
    <div class="order-card status-${o.status}" data-id="${o.id}">
      <div class="order-card-header" data-expand="${o.id}">
        <div class="order-header-main">
          <div class="order-supplier">
            <i class="fa-solid fa-truck"></i>
            ${escHtml(o.supplier||"Fournisseur non précisé")}
          </div>
          <div class="order-meta">
            ${orderStatusTag(o.status)}
            ${o.building?`<span class="tag tag-building"><i class="fa-solid fa-building"></i> ${escHtml(o.building)}</span>`:""}
            <span class="order-date"><i class="fa-regular fa-calendar"></i> ${formatDate(o.date)}</span>
            ${o.notes?`<span style="font-size:.75rem;color:var(--text-light);font-style:italic">${escHtml(o.notes)}</span>`:""}
          </div>
          <div style="margin-top:.4rem;font-size:.82rem;color:var(--text-light)">
            ${preview}${more}
          </div>
        </div>
        <div class="order-card-actions">
          <span class="order-summary-count">${n} produit${n>1?"s":""}</span>
          <button class="btn-icon pdf-btn" data-id="${o.id}" title="Exporter en PDF" style="color:#dc2626"><i class="fa-solid fa-file-pdf"></i></button>
          <button class="btn-icon edit"    data-id="${o.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete"  data-id="${o.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          <button class="order-expand-btn" data-expand="${o.id}" title="Voir les produits">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
      </div>
      <div class="order-products" id="products-${o.id}">
        <div class="order-products-header">
          <span>Produit / Article</span><span>Qté</span><span>Unité</span><span>Notes</span>
        </div>
        ${(o.items||[]).map(it=>`
          <div class="order-product-row">
            <span class="order-product-name">${escHtml(it.name)}</span>
            <span class="order-product-qty">${escHtml(it.qty||"—")}</span>
            <span class="order-product-unit">${escHtml(it.unit||"—")}</span>
            <span class="order-product-notes" title="${escHtml(it.notes||"")}">${escHtml(it.notes||"—")}</span>
          </div>`).join("")}
        ${!n?`<p class="empty-msg" style="padding:1rem"><i class="fa-solid fa-box-open"></i>Aucun produit</p>`:""}
      </div>
    </div>`;
  }).join("");

  c.querySelectorAll("[data-expand]").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      const id=el.dataset.expand;
      const panel=document.getElementById(`products-${id}`);
      const btn=c.querySelector(`.order-expand-btn[data-expand="${id}"]`);
      if(!panel)return;
      panel.classList.toggle("open");
      if(btn) btn.classList.toggle("open");
    });
  });
  c.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click", async e=>{e.stopPropagation(); await editOrder(b.dataset.id);}));
  c.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click", async e=>{e.stopPropagation(); await deleteOrder(b.dataset.id);}));
  c.querySelectorAll(".pdf-btn").forEach(b=>b.addEventListener("click", async e=>{e.stopPropagation(); await exportOrderPDF(b.dataset.id);}));
  document.getElementById("badgeOrders").textContent=orders.filter(o=>o.status==="ordered"||o.status==="pending").length;
}

function orderFormHTML(o={}){
  const today=new Date().toISOString().split("T")[0];
  const items=(o.items&&o.items.length)?o.items:[{id:uid(),name:"",qty:"",unit:"",notes:""}];
  return `
    <div class="form-row">
      <div class="form-group"><label>Fournisseur *</label>
        <input id="fSupplier" type="text" placeholder="Ex : Hornbach, Migros Pro…" value="${escHtml(o.supplier||"")}"/>
      </div>
      <div class="form-group"><label>Date de commande</label>
        <input id="fDate" type="date" value="${o.date||today}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Statut</label>
        <select id="fOStatus">
          <option value="ordered"  ${(!o.status||o.status==="ordered") ?"selected":""}>Commandé</option>
          <option value="pending"  ${o.status==="pending"              ?"selected":""}>En attente</option>
          <option value="received" ${o.status==="received"             ?"selected":""}>Reçu</option>
        </select>
      </div>
      <div class="form-group"><label>Immeuble</label>
        <select id="fOBuilding">
          <option value="">— Général —</option>
          ${buildingOptions(o.building||"")}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Notes générales</label>
      <input id="fNotes" type="text" placeholder="Remarques, délai, référence…" value="${escHtml(o.notes||"")}"/>
    </div>
    <div style="border-top:1.5px solid var(--border);margin:1rem 0 .9rem;padding-top:.9rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <label style="font-size:.8rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0">
          <i class="fa-solid fa-boxes-stacked" style="color:var(--blue)"></i> Produits / Articles
        </label>
        <button type="button" class="btn btn-secondary" id="btnAddProductLine" style="padding:.35rem .8rem;font-size:.8rem">
          <i class="fa-solid fa-plus"></i> Ajouter un produit
        </button>
      </div>
      <div id="productLines">
        ${items.map((it,idx)=>productLineHTML(it,idx)).join("")}
      </div>
    </div>`;
}

function productLineHTML(it={},idx=0){
  const iid=it.id||uid();
  return `<div class="product-line" data-line-id="${iid}" style="
    display:grid;grid-template-columns:2fr 70px 80px 1fr auto;gap:.5rem;
    align-items:center;margin-bottom:.5rem;background:var(--bg);
    padding:.6rem .7rem;border-radius:var(--radius-sm);border:1px solid var(--border)">
    <input class="pl-name" type="text" placeholder="Nom du produit *"
           value="${escHtml(it.name||"")}" style="padding:.45rem .7rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;font-family:inherit;transition:border-color .2s" onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
    <input class="pl-qty" type="text" placeholder="Qté"
           value="${escHtml(it.qty||"")}" style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;font-family:inherit;text-align:center;transition:border-color .2s" onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
    <input class="pl-unit" type="text" placeholder="Unité"
           value="${escHtml(it.unit||"")}" style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;font-family:inherit;transition:border-color .2s" onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
    <input class="pl-notes" type="text" placeholder="Notes"
           value="${escHtml(it.notes||"")}" style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;font-family:inherit;transition:border-color .2s" onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
    <button type="button" class="btn-icon delete remove-product-line" style="flex-shrink:0" title="Supprimer">
      <i class="fa-solid fa-trash"></i>
    </button>
  </div>`;
}

function readProductLines(){
  const lines=[];
  document.querySelectorAll("#productLines .product-line").forEach(div=>{
    const name=div.querySelector(".pl-name").value.trim();
    if(!name)return;
    lines.push({id:div.dataset.lineId||uid(),name,
      qty:  div.querySelector(".pl-qty").value.trim(),
      unit: div.querySelector(".pl-unit").value.trim(),
      notes:div.querySelector(".pl-notes").value.trim()});
  });
  return lines;
}

function bindOrderForm(){
  document.getElementById("btnAddProductLine")?.addEventListener("click",()=>{
    const container=document.getElementById("productLines");
    const idx=container.querySelectorAll(".product-line").length;
    const div=document.createElement("div");
    div.innerHTML=productLineHTML({id:uid()},idx);
    container.appendChild(div.firstElementChild);
    container.lastElementChild.querySelector(".pl-name").focus();
    bindRemoveButtons();
  });
  bindRemoveButtons();
}
function bindRemoveButtons(){
  document.querySelectorAll(".remove-product-line").forEach(btn=>{
    btn.onclick=()=>{
      const lines=document.querySelectorAll("#productLines .product-line");
      if(lines.length<=1){showToast("Il faut au moins un produit.","error");return;}
      btn.closest(".product-line").remove();
    };
  });
}

document.getElementById("btnAddOrder").addEventListener("click", async ()=>{
  openModal("Nouvelle commande",orderFormHTML(), async ()=>{
    const supplier=mval("fSupplier");
    if(!supplier){showToast("Le fournisseur est obligatoire.","error");return;}
    const items=readProductLines();
    if(!items.length){showToast("Ajoutez au moins un produit.","error");return;}
    const newOrder={id:uid(),supplier,date:mval("fDate"),status:mval("fOStatus"),building:mval("fOBuilding"),notes:mval("fNotes"),items};
    await fsAdd("orders",newOrder); closeModal();
    showToast("Commande ajoutée !","success");
  });
  setTimeout(bindOrderForm,0);
});
async function editOrder(id){
  const o=orders.find(o=>o.id===id); if(!o)return;
  openModal("Modifier la commande",orderFormHTML(o), async ()=>{
    const supplier=mval("fSupplier");
    if(!supplier){showToast("Le fournisseur est obligatoire.","error");return;}
    const items=readProductLines();
    if(!items.length){showToast("Ajoutez au moins un produit.","error");return;}
    Object.assign(o,{supplier,date:mval("fDate"),status:mval("fOStatus"),building:mval("fOBuilding"),notes:mval("fNotes"),items});
    await fsUpdate("orders",o.id,o); closeModal();
    showToast("Commande mise à jour.","success");
  });
  setTimeout(bindOrderForm,0);
}
async function deleteOrder(id){
  if(!confirm("Supprimer cette commande ?"))return;
  await fsDelete("orders",id);
  showToast("Commande supprimée.","info");
}

/* ============================================================
   17. PLACES & APPARTEMENTS
   ============================================================ */
function bindSpaceFilter(){
  const el=document.getElementById("filterSpaceBuilding");
  if(el) el.addEventListener("input",renderSpaces);
}

function renderSpaces(){
  const bld=document.getElementById("filterSpaceBuilding")?.value||"";
  const filtS=bld?spaces.filter(s=>s.building===bld):spaces;
  const filtA=bld?apts.filter(a=>a.building===bld):apts;

  document.getElementById("countSpaces").textContent=filtS.length;
  document.getElementById("countApts").textContent=filtA.length;

  const sl=document.getElementById("spacesList");
  if(!filtS.length){
    sl.innerHTML=`<p class="empty-msg"><i class="fa-solid fa-circle-check"></i>Aucune place libre</p>`;
  } else {
    sl.innerHTML=filtS.map(s=>`
      <div class="space-item">
        <div class="space-item-left">
          <i class="fa-solid ${s.type==="indoor"?"fa-warehouse":"fa-sun"}"></i>
          <div class="space-item-info">
            <div class="space-item-name">${escHtml(s.name)}</div>
            <div class="space-item-meta">${escHtml(s.building)} · ${TYPE_SPACE_LABELS[s.type]||s.type}${s.notes?" · "+escHtml(s.notes):""}</div>
          </div>
        </div>
        <div class="space-item-actions">
          <button class="btn-icon edit"   data-id="${s.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${s.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("");
    sl.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click", async ()=>editSpace(b.dataset.id)));
    sl.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click", async ()=>deleteSpace(b.dataset.id)));
  }

  const al=document.getElementById("aptsList");
  if(!filtA.length){
    al.innerHTML=`<p class="empty-msg"><i class="fa-solid fa-circle-check"></i>Aucun appartement libre</p>`;
  } else {
    al.innerHTML=filtA.map(a=>`
      <div class="space-item">
        <div class="space-item-left">
          <i class="fa-solid fa-door-open"></i>
          <div class="space-item-info">
            <div class="space-item-name">${escHtml(a.name)}</div>
            <div class="space-item-meta">${escHtml(a.building)}${a.floor?" · "+escHtml(a.floor):""}${a.rooms?" · "+escHtml(a.rooms)+" pièces":""}${a.notes?" · "+escHtml(a.notes):""}</div>
          </div>
        </div>
        <div class="space-item-actions">
          <button class="btn-icon edit"   data-id="${a.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("");
    al.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click", async ()=>editApt(b.dataset.id)));
    al.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click", async ()=>deleteApt(b.dataset.id)));
  }
}

function spaceFormHTML(s={}){
  return `
    <div class="form-group"><label>Numéro / Nom *</label>
      <input id="fSName" type="text" placeholder="Ex : Place 14" value="${escHtml(s.name||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Immeuble</label>
        <select id="fSBuilding">${buildingOptions(s.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group"><label>Type</label>
        <select id="fSType">
          <option value="indoor"  ${(!s.type||s.type==="indoor") ?"selected":""}>🏠 Intérieur</option>
          <option value="outdoor" ${s.type==="outdoor"           ?"selected":""}>☀️ Extérieur</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Notes</label>
      <input id="fSNotes" type="text" placeholder="Ex : Handicapé, moto…" value="${escHtml(s.notes||"")}"/>
    </div>`;
}
document.getElementById("btnAddSpace").addEventListener("click", async ()=>{
  openModal("Nouvelle place de parking",spaceFormHTML(), async ()=>{
    const name=mval("fSName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    const newSpace={id:uid(),name,building:mval("fSBuilding"),type:mval("fSType"),notes:mval("fSNotes")};
    await fsAdd("spaces",newSpace); closeModal();
    showToast("Place ajoutée !","success");
  });
});
async function editSpace(id){
  const s=spaces.find(s=>s.id===id); if(!s)return;
  openModal("Modifier la place",spaceFormHTML(s), async ()=>{
    const name=mval("fSName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    Object.assign(s,{name,building:mval("fSBuilding"),type:mval("fSType"),notes:mval("fSNotes")});
    await fsUpdate("spaces",s.id,s); closeModal();
    showToast("Place mise à jour.","success");
  });
}
async function deleteSpace(id){
  if(!confirm("Supprimer cette place ?"))return;
  await fsDelete("spaces",id);
  showToast("Place supprimée.","info");
}

function aptFormHTML(a={}){
  return `
    <div class="form-group"><label>Numéro / Nom *</label>
      <input id="fAName" type="text" placeholder="Ex : Appartement 4B" value="${escHtml(a.name||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Immeuble</label>
        <select id="fABuilding">${buildingOptions(a.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group"><label>Étage</label>
        <input id="fAFloor" type="text" placeholder="Ex : 3e" value="${escHtml(a.floor||"")}"/>
      </div>
    </div>
    <div class="form-group"><label>Nombre de pièces</label>
      <input id="fARooms" type="text" placeholder="Ex : 3.5" value="${escHtml(a.rooms||"")}"/>
    </div>
    <div class="form-group"><label>Notes</label>
      <textarea id="fANotes" placeholder="Loyer, disponibilité…">${escHtml(a.notes||"")}</textarea>
    </div>`;
}
document.getElementById("btnAddApt").addEventListener("click", async ()=>{
  openModal("Nouvel appartement libre",aptFormHTML(), async ()=>{
    const name=mval("fAName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    const newApt={id:uid(),name,building:mval("fABuilding"),floor:mval("fAFloor"),rooms:mval("fARooms"),notes:mval("fANotes")};
    await fsAdd("apts",newApt); closeModal();
    showToast("Appartement ajouté !","success");
  });
});
async function editApt(id){
  const a=apts.find(a=>a.id===id); if(!a)return;
  openModal("Modifier l'appartement",aptFormHTML(a), async ()=>{
    const name=mval("fAName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    Object.assign(a,{name,building:mval("fABuilding"),floor:mval("fAFloor"),rooms:mval("fARooms"),notes:mval("fANotes")});
    await fsUpdate("apts",a.id,a); closeModal();
    showToast("Appartement mis à jour.","success");
  });
}
async function deleteApt(id){
  if(!confirm("Supprimer cet appartement ?"))return;
  await fsDelete("apts",id);
  showToast("Appartement supprimé.","info");
}

/* ============================================================
   18. DONNÉES DE DÉMO
   ============================================================ */
/* ============================================================
   18. DONNÉES DE DÉMO — uniquement si Firestore est vide
   ============================================================ */
async function seedDemoData() {
  const snap = await col("tasks").limit(1).get();
  if (!snap.empty) return;
  showToast("Premier lancement — ajout des données de démo…", "info");
  const dT=[
    {id:uid(),title:"Tondre la pelouse (côté rue)",        building:BUILDINGS[0],priority:"medium",status:"todo",      description:"Secteur principal et bordures"},
    {id:uid(),title:"Remplacer ampoules couloir 2e étage", building:BUILDINGS[2],priority:"high",  status:"todo",      description:"3 ampoules E27"},
    {id:uid(),title:"Nettoyage salle de poubelles",        building:BUILDINGS[4],priority:"high",  status:"inprogress",description:""},
    {id:uid(),title:"Contrôle extincteurs",                building:BUILDINGS[1],priority:"medium",status:"todo",      description:"Vérification annuelle"},
    {id:uid(),title:"Débouchage gouttière nord",           building:BUILDINGS[3],priority:"low",   status:"todo",      description:""},
  ];
  const dO=[
    {id:uid(),supplier:"Hornbach",  date:"2025-06-01",status:"received",building:BUILDINGS[2],notes:"Commande urgente",
     items:[{id:uid(),name:"Ampoules LED E27",qty:"20",unit:"pcs",notes:"LED-E27-10W"},{id:uid(),name:"Câble 2.5mm",qty:"5",unit:"m",notes:""}]},
    {id:uid(),supplier:"Migros Pro",date:"2025-06-05",status:"ordered", building:"",notes:"Livraison jeudi",
     items:[{id:uid(),name:"Sel adoucisseur",qty:"2",unit:"sacs",notes:""},{id:uid(),name:"Nettoyant sol",qty:"4",unit:"L",notes:""},{id:uid(),name:"Sacs 110L",qty:"3",unit:"rouleaux",notes:""}]},
  ];
  const dS=[
    {id:uid(),name:"Place 3",  building:BUILDINGS[0],type:"indoor",  notes:""},
    {id:uid(),name:"Place 11", building:BUILDINGS[1],type:"outdoor", notes:""},
  ];
  const dA=[
    {id:uid(),name:"Appartement 8A",building:BUILDINGS[2],floor:"4e",rooms:"4.5",notes:"Disponible juillet"},
    {id:uid(),name:"Studio 2",      building:BUILDINGS[4],floor:"RDC",rooms:"1.5",notes:"Peinture à prévoir"},
  ];
  const batch=db.batch();
  dT.forEach(d=>{const{id,...r}=d;batch.set(col("tasks" ).doc(id),r);});
  dO.forEach(d=>{const{id,...r}=d;batch.set(col("orders").doc(id),r);});
  dS.forEach(d=>{const{id,...r}=d;batch.set(col("spaces").doc(id),r);});
  dA.forEach(d=>{const{id,...r}=d;batch.set(col("apts"  ).doc(id),r);});
  await batch.commit();
}

/* ============================================================
   19. INITIALISATION APRÈS CONNEXION
   ============================================================ */
async function initApp() {
  await loadBuildings();
  await seedDemoData();
  startListeners();
  startComptaListener();   // écoute les transactions comptabilité
  startArchiveListener();  // écoute les dossiers archives
  refreshBuildingSelects();
  bindTaskFilters();
  bindOrderFilters();
  bindSpaceFilter();
  renderDashboard();
}

/* ============================================================
   20. DÉMARRAGE — Firebase Auth prend le contrôle
   ============================================================ */
const ok = initFirebase();
if (!ok) {
  // Firebase non configuré → afficher un message clair
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#f4f6fb;padding:2rem">
      <div style="background:#fff;border-radius:12px;padding:2rem;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)">
        <img src="logo.png" style="width:80px;margin:0 auto 1rem"/>
        <h2 style="color:#1a2640;margin-bottom:.5rem">Firebase non configuré</h2>
        <p style="color:#6b7a94;margin-bottom:1rem">Remplis le fichier <code>firebase-config.js</code> avec tes clés Firebase et active Firebase Authentication dans la console Firebase.</p>
        <a href="https://console.firebase.google.com" target="_blank" style="display:inline-block;background:#e86a1a;color:#fff;padding:.6rem 1.2rem;border-radius:6px;text-decoration:none;font-weight:600">Ouvrir Firebase Console</a>
      </div>
    </div>`;
} else {
  // Firebase OK → écouter l'état d'authentification
  startAuthListener();
}

/* ============================================================
   21. GÉNÉRATION PDF — BON DE COMMANDE
   Utilise jsPDF + jsPDF-AutoTable (chargés via CDN)
   ============================================================ */

/** Convertit logo.png en base64 pour l'intégrer dans le PDF */
async function getLogoBase64() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = "logo.png?" + Date.now(); // cache-bust
  });
}

/**
 * Génère un PDF professionnel pour une commande.
 * @param {string} id - ID de la commande
 */
async function exportOrderPDF(id) {
  const o = orders.find(o => o.id === id);
  if (!o) return;

  if (typeof window.jspdf === "undefined") {
    showToast("Bibliothèque PDF en cours de chargement, réessaie dans 2 secondes.", "info");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W  = 210;
  const MARGIN  = 18;
  const CONTENT = PAGE_W - MARGIN * 2;
  const TODAY   = new Date().toLocaleDateString("fr-CH", { day:"2-digit", month:"2-digit", year:"numeric" });

  // Palette couleurs ImmoGest
  const NAVY   = [26,  38,  64];
  const BLUE   = [30,  92, 191];
  const ORANGE = [232, 106,  26];
  const LGRAY  = [240, 243, 251];
  const MGRAY  = [100, 116, 148];

  /* ---- HEADER BLEU ---- */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 38, "F");

  // Logo
  const logoB64 = await getLogoBase64();
  if (logoB64) {
    doc.addImage(logoB64, "PNG", MARGIN, 4, 30, 30);
  }

  // Titre app
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ImmoGest", MARGIN + 33, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(160, 180, 220);
  doc.text("Gestion Immobilière", MARGIN + 33, 23);

  // Titre du document (droite)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("BON DE COMMANDE", PAGE_W - MARGIN, 16, { align: "right" });

  // Numéro de commande + date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(160, 180, 220);
  const orderNum = "CMD-" + o.id.toUpperCase().slice(0, 8);
  doc.text(`N° ${orderNum}`, PAGE_W - MARGIN, 22, { align: "right" });
  doc.text(`Émis le ${TODAY}`, PAGE_W - MARGIN, 27, { align: "right" });

  /* ---- BANDE ORANGE DÉCO ---- */
  doc.setFillColor(...ORANGE);
  doc.rect(0, 38, PAGE_W, 2.5, "F");

  let y = 50;

  /* ---- BLOC INFOS COMMANDE ---- */
  // Colonne gauche : Fournisseur
  doc.setFillColor(...LGRAY);
  doc.roundedRect(MARGIN, y, CONTENT / 2 - 4, 36, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MGRAY);
  doc.text("FOURNISSEUR", MARGIN + 5, y + 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(o.supplier || "Non précisé", MARGIN + 5, y + 15);

  // Colonne droite : détails
  const rx = MARGIN + CONTENT / 2 + 4;
  const rw = CONTENT / 2 - 4;
  doc.setFillColor(...LGRAY);
  doc.roundedRect(rx, y, rw, 36, 2, 2, "F");

  const details = [
    ["Date de commande", formatDate(o.date)],
    ["Statut",           STATUS_ORDER_LABELS[o.status] || o.status],
    ["Immeuble",         o.building || "— Général —"],
  ];
  doc.setFontSize(7.5);
  details.forEach(([label, val], i) => {
    const dy = y + 8 + i * 10;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MGRAY);
    doc.text(label, rx + 5, dy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(String(val), rx + 5, dy + 5);
  });

  y += 44;

  /* ---- NOTES GÉNÉRALES ---- */
  if (o.notes) {
    doc.setFillColor(255, 244, 230);
    doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...ORANGE);
    doc.text("REMARQUES :", MARGIN + 5, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...NAVY);
    doc.text(o.notes, MARGIN + 35, y + 6);
    y += 20;
  }

  /* ---- TITRE TABLEAU ---- */
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN, y, CONTENT, 9, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("LISTE DES ARTICLES", MARGIN + 5, y + 6);
  y += 9;

  /* ---- TABLEAU DES PRODUITS ---- */
  const items = o.items || [];
  const tableBody = items.map((it, idx) => [
    idx + 1,
    it.name || "—",
    it.qty  || "—",
    it.unit || "—",
    it.notes || ""
  ]);

  doc.autoTable({
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Désignation de l'article", "Qté", "Unité", "Notes / Référence"]],
    body: tableBody,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 4,
      textColor: [...NAVY],
      lineColor: [220, 228, 240],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [...BLUE],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [...LGRAY] },
    columnStyles: {
      0: { cellWidth: 10,  halign: "center", fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18,  halign: "center" },
      3: { cellWidth: 22,  halign: "center" },
      4: { cellWidth: 45 },
    },
  });

  y = doc.lastAutoTable.finalY + 14;

  /* ---- SIGNATURES ---- */
  const sigW = (CONTENT - 10) / 2;

  // Émis par
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 20, MARGIN + sigW, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MGRAY);
  doc.text("Émis par le concierge", MARGIN, y + 25);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("Date : _______________", MARGIN, y + 32);

  // Validé par la régie
  const sx2 = MARGIN + sigW + 10;
  doc.setDrawColor(...ORANGE);
  doc.line(sx2, y + 20, sx2 + sigW, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MGRAY);
  doc.text("Validé par la régie", sx2, y + 25);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("Signature : _______________", sx2, y + 32);

  /* ---- PIED DE PAGE ---- */
  const pageH = doc.internal.pageSize.height;
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 14, PAGE_W, 14, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 160, 200);
  doc.text(
    `ImmoGest — Gestion Immobilière  •  Document généré le ${TODAY}  •  Réf. ${orderNum}`,
    PAGE_W / 2, pageH - 6,
    { align: "center" }
  );

  /* ---- EXPORT ---- */
  const filename = `Commande_${(o.supplier||"ImmoGest").replace(/\s+/g,"_")}_${TODAY.replace(/\//g,"-")}.pdf`;
  doc.save(filename);
  showToast(`PDF "${filename}" téléchargé !`, "success");
}

/* ---- Export TOUS les ordres filtrés ---- */
async function exportAllOrdersPDF() {
  const list = typeof getFilteredOrders === "function" ? getFilteredOrders() : orders;
  if (!list.length) { showToast("Aucune commande à exporter.", "info"); return; }
  showToast(`Génération de ${list.length} PDF en cours…`, "info");
  for (const o of list) {
    await exportOrderPDF(o.id);
    await new Promise(r => setTimeout(r, 400)); // petit délai entre chaque
  }
}

// Bouton "Exporter tout"
const btnExportAll = document.getElementById("btnExportAllPDF");
if (btnExportAll) {
  btnExportAll.addEventListener("click", exportAllOrdersPDF);
}

/* ============================================================
   22. COMPTABILITÉ — Coffre & Compte bancaire
   Collection Firestore : "transactions"
   Chaque document : { type, montant, description, date, soldeCoffre, soldeBanque }
   Types : "entree" | "virement" | "sortie"
   ============================================================ */

let transactions = [];
let unsubCompta = null;

/* ---- Démarrer l'écouteur temps réel comptabilité ---- */
function startComptaListener() {
  if (unsubCompta) unsubCompta();
  unsubCompta = col("transactions")
    .onSnapshot(snap => {
      // Tri côté client par date décroissante — pas besoin d'index Firestore
      transactions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      renderCompta();
    }, err => {
      console.error("compta listener:", err);
      if (err.code === "permission-denied") {
        showFirestorePermissionWarning();
      }
    });
}

/* ---- Calculer les soldes actuels (ignore les entrées en attente) ---- */
function getSoldes() {
  // Exclure les transactions en attente du calcul des soldes
  const confirmed = transactions.filter(t => t.status !== "pending");
  if (!confirmed.length) return { coffre: 0, banque: 0 };
  const last = confirmed[0]; // dernier confirmé, trié desc
  return { coffre: last.soldeCoffre || 0, banque: last.soldeBanque || 0 };
}

/* ---- Formater un montant en CHF ---- */
function chf(n) {
  return parseFloat(n || 0).toFixed(2) + " CHF";
}

/* ---- Vue active ---- */
let currentComptaView = "all"; // "all" | "archives"

/* ---- Rendre l'onglet comptabilité ---- */
function renderCompta() {
  const { coffre, banque } = getSoldes();
  document.getElementById("soldeCoffre").textContent = chf(coffre);
  document.getElementById("soldeBanque").textContent = chf(banque);
  document.getElementById("soldeTotal").textContent  = chf(coffre + banque);

  if (currentComptaView === "archives") {
    renderArchiveView();
  } else {
    renderAllTransactions();
  }
}

/* ---- Formulaire de saisie d'une transaction ---- */
function comptaFormHTML(type) {
  const configs = {
    entree:   { icon: "fa-arrow-down",             color: "#e8843b", label: "Entrée coffre",   desc: "Recharge puce de lavage / dépôt liquide" },
    virement: { icon: "fa-arrow-right-arrow-left", color: "#1e5cbf", label: "Coffre → Banque", desc: "Déposer le liquide en banque" },
    sortie:   { icon: "fa-arrow-up",               color: "#38a169", label: "Sortie banque",   desc: "Payer une facture régie" },
  };
  const c = configs[type];
  const { coffre, banque } = getSoldes();

  return `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:1.2rem">
      <i class="fa-solid ${c.icon}" style="color:${c.color};font-size:1.2rem"></i>
      <div>
        <div style="font-weight:700;color:var(--navy)">${c.label}</div>
        <div style="font-size:.8rem;color:var(--text-light)">${c.desc}</div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:var(--radius-sm);padding:.65rem 1rem;text-align:center">
        <div style="font-size:.7rem;color:var(--text-light);font-weight:700;text-transform:uppercase">Coffre actuel</div>
        <div style="font-family:'DM Mono',monospace;font-weight:700;color:#c05a1a;font-size:1.1rem;margin-top:.2rem">${chf(coffre)}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:var(--radius-sm);padding:.65rem 1rem;text-align:center">
        <div style="font-size:.7rem;color:var(--text-light);font-weight:700;text-transform:uppercase">Banque actuelle</div>
        <div style="font-family:'DM Mono',monospace;font-weight:700;color:var(--blue);font-size:1.1rem;margin-top:.2rem">${chf(banque)}</div>
      </div>
    </div>
    <div class="form-group">
      <label>Montant (CHF) *</label>
      <input id="fComptaMontant" type="number" min="0.01" step="0.05" placeholder="Ex : 50.00" style="font-size:1.1rem;font-weight:600"/>
    </div>
    <div class="form-group">
      <label>Description</label>
      <input id="fComptaDesc" type="text" placeholder="${
        type === "entree"   ? "Ex : Recharge puce Apt 3A" :
        type === "virement" ? "Ex : Dépôt coffre → banque" :
        "Ex : Facture régie mars 2025"
      }"/>
    </div>
    <div class="form-group">
      <label>Date & heure</label>
      <input id="fComptaDate" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"/>
    </div>
    ${type === "entree" ? `
    <label class="pending-checkbox-wrap" for="fComptaPending">
      <input type="checkbox" id="fComptaPending"/>
      <div>
        <div class="pending-cb-title"><i class="fa-solid fa-clock"></i> En attente</div>
        <div class="pending-cb-desc">Le locataire paiera plus tard — n'affecte pas le solde du coffre</div>
      </div>
    </label>` : ""}`;
}

/* ---- Enregistrer une transaction ---- */
async function saveTransaction(type) {
  const montantRaw = parseFloat(document.getElementById("fComptaMontant").value);
  if (!montantRaw || montantRaw <= 0) {
    showToast("Le montant doit être supérieur à 0.", "error"); return false;
  }
  const montant     = Math.round(montantRaw * 100) / 100;
  const description = document.getElementById("fComptaDesc").value.trim();
  const dateVal     = document.getElementById("fComptaDate").value;
  const date        = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

  const { coffre: coffreAct, banque: banqueAct } = getSoldes();

  // Vérifier si l'entrée est "en attente"
  const pendingEl = document.getElementById("fComptaPending");
  const isPending = type === "entree" && pendingEl && pendingEl.checked;

  if (isPending) {
    // Entrée en attente : enregistrée mais ne modifie pas le solde
    const newDoc = {
      id: uid(), type: "entree", status: "pending",
      montant, description, date,
      soldeCoffre: coffreAct,   // solde inchangé
      soldeBanque: banqueAct,
    };
    await fsAdd("transactions", newDoc);
    closeModal();
    showToast(`Entrée en attente enregistrée — ${chf(montant)}`, "info");
    return true;
  }

  // Calculer les nouveaux soldes pour une transaction confirmée
  let newCoffre = coffreAct;
  let newBanque = banqueAct;

  if (type === "entree") {
    newCoffre = Math.round((coffreAct + montant) * 100) / 100;
  } else if (type === "virement") {
    if (montant > coffreAct) {
      showToast(`Solde coffre insuffisant (${chf(coffreAct)}).`, "error"); return false;
    }
    newCoffre = Math.round((coffreAct - montant) * 100) / 100;
    newBanque = Math.round((banqueAct + montant) * 100) / 100;
  } else if (type === "sortie") {
    if (montant > banqueAct) {
      showToast(`Solde bancaire insuffisant (${chf(banqueAct)}).`, "error"); return false;
    }
    newBanque = Math.round((banqueAct - montant) * 100) / 100;
  }

  const newDoc = {
    id: uid(), type, status: "confirmed",
    montant, description, date,
    soldeCoffre: newCoffre,
    soldeBanque: newBanque,
  };

  await fsAdd("transactions", newDoc);
  closeModal();
  showToast("Transaction enregistrée ✓", "success");
  return true;
}

/* ---- Confirmer un paiement en attente ---- */
async function confirmPendingEntry(id) {
  const t = transactions.find(t => t.id === id);
  if (!t || t.status !== "pending") return;

  const { coffre, banque } = getSoldes();
  const newCoffre = Math.round((coffre + t.montant) * 100) / 100;

  const newDoc = {
    id: uid(), type: "entree", status: "confirmed",
    montant: t.montant,
    description: t.description,
    date: new Date().toISOString(),
    soldeCoffre: newCoffre,
    soldeBanque: banque,
  };

  await fsAdd("transactions", newDoc);
  await fsDelete("transactions", id);
  showToast(`Paiement confirmé ! +${chf(t.montant)} au coffre`, "success");
}

/* ---- Boutons d'action ---- */
document.getElementById("btnEntree").addEventListener("click", () => {
  openModal("Entrée coffre", comptaFormHTML("entree"), async () => {
    await saveTransaction("entree");
  });
});
document.getElementById("btnVirement").addEventListener("click", () => {
  openModal("Coffre → Banque", comptaFormHTML("virement"), async () => {
    await saveTransaction("virement");
  });
});
document.getElementById("btnSortie").addEventListener("click", () => {
  openModal("Sortie banque", comptaFormHTML("sortie"), async () => {
    await saveTransaction("sortie");
  });
});

/* ---- Filtre ---- */
document.getElementById("filterComptaType").addEventListener("change", renderCompta);

/* ============================================================
   23. COMPTABILITÉ — renderAllTransactions (avec "En attente")
   ============================================================ */
function renderAllTransactions() {
  const filterType = document.getElementById("filterComptaType").value;
  let list = [...transactions];

  if (filterType === "pending") {
    list = list.filter(t => t.status === "pending");
  } else if (filterType) {
    list = list.filter(t => t.type === filterType && t.status !== "pending");
  }

  const container = document.getElementById("comptaHistory");
  if (!list.length) {
    container.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-receipt"></i>Aucune transaction</p>`;
    return;
  }

  // Compter les entrées en attente pour le bandeau
  const pendingCount = transactions.filter(t => t.status === "pending").length;
  const pendingBanner = pendingCount && filterType !== "pending" ? `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1.25rem;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:.83rem;cursor:pointer"
         onclick="document.getElementById('filterComptaType').value='pending';renderCompta()">
      <i class="fa-solid fa-clock" style="color:#d97706"></i>
      <span style="color:#92400e;font-weight:600">${pendingCount} entrée${pendingCount>1?"s":""} en attente de paiement</span>
      <span style="color:#a16207;margin-left:auto">Voir →</span>
    </div>` : "";

  const TYPE_LABELS = {
    entree:   (s) => s === "pending"
      ? '<span class="tag tag-pending"><i class="fa-solid fa-clock"></i> En attente</span>'
      : '<span class="tag tag-entree">Entrée coffre</span>',
    virement: () => '<span class="tag tag-virement">Coffre → Banque</span>',
    sortie:   () => '<span class="tag tag-sortie">Sortie banque</span>',
  };

  container.innerHTML = pendingBanner + `
    <div style="overflow-x:auto">
    <table class="compta-table">
      <thead>
        <tr>
          <th>Date & heure</th>
          <th>Type</th>
          <th>Description</th>
          <th style="text-align:right">+ Coffre</th>
          <th style="text-align:right">− Coffre</th>
          <th style="text-align:right">− Banque</th>
          <th style="text-align:right">💰 Coffre</th>
          <th style="text-align:right">🏦 Banque</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(t => {
          const isE = t.type === "entree";
          const isV = t.type === "virement";
          const isS = t.type === "sortie";
          const isPend = t.status === "pending";
          const rowClass = isPend ? "row-pending" : "";
          const labelFn = TYPE_LABELS[t.type] || (() => t.type);
          return `
          <tr class="${rowClass}">
            <td class="td-date">${formatDateFull(t.date)}</td>
            <td>${labelFn(t.status)}</td>
            <td class="td-desc">${escHtml(t.description || "—")}</td>
            <td class="amount-col">${isE && !isPend ? `<span class="amount-entree-val">+${chf(t.montant)}</span>` : isPend ? `<span style="color:#d97706;font-family:'DM Mono',monospace;font-size:.85rem">(${chf(t.montant)})</span>` : `<span class="amount-dash">—</span>`}</td>
            <td class="amount-col">${isV ? `<span class="amount-virement-val">−${chf(t.montant)}</span>` : `<span class="amount-dash">—</span>`}</td>
            <td class="amount-col">${isS ? `<span class="amount-sortie-val">−${chf(t.montant)}</span>` : `<span class="amount-dash">—</span>`}</td>
            <td class="mini-solde mini-coffre">${isPend ? '<span style="color:var(--text-light);font-size:.75rem">—</span>' : chf(t.soldeCoffre)}</td>
            <td class="mini-solde mini-banque">${isPend ? '<span style="color:var(--text-light);font-size:.75rem">—</span>' : chf(t.soldeBanque)}</td>
            <td>
              <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:nowrap">
                ${isPend ? `<button class="confirm-pay-btn" data-confirm-id="${t.id}"><i class="fa-solid fa-check"></i> Confirmer</button>` : ""}
                <button class="btn-icon delete" data-compta-id="${t.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>`;

  // Confirmer paiement en attente
  container.querySelectorAll("[data-confirm-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Confirmer la réception de ce paiement ?`)) return;
      await confirmPendingEntry(btn.dataset.confirmId);
    });
  });

  // Supprimer
  container.querySelectorAll("[data-compta-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette transaction ?")) return;
      await fsDelete("transactions", btn.dataset.comptaId);
      showToast("Transaction supprimée.", "info");
    });
  });
}

/* ============================================================
   24. ARCHIVES — Dossiers de transactions
   Collection Firestore : "archives"
   ============================================================ */
let archives     = [];
let unsubArchives = null;

function startArchiveListener() {
  if (unsubArchives) unsubArchives();
  unsubArchives = col("archives").onSnapshot(snap => {
    archives = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (currentComptaView === "archives") renderArchiveView();
  }, err => { if (err.code === "permission-denied") showFirestorePermissionWarning(); });
}

/* ---- Formulaire de création d'archive ---- */
function archiveFormHTML(a = {}) {
  const today = new Date().toISOString().split("T")[0];
  return `
    <div class="form-group">
      <label>Nom du dossier *</label>
      <input id="fArchiveName" type="text"
             placeholder="Ex : Factures 17.04 - 30.04.2026"
             value="${escHtml(a.name || "")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date de début</label>
        <input id="fArchiveStart" type="date" value="${a.dateStart || today}"/>
      </div>
      <div class="form-group">
        <label>Date de fin</label>
        <input id="fArchiveEnd" type="date" value="${a.dateEnd || today}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Description (optionnel)</label>
      <input id="fArchiveDesc" type="text"
             placeholder="Période, remarques…"
             value="${escHtml(a.description || "")}"/>
    </div>`;
}

/* ---- Vue Archives ---- */
function renderArchiveView() {
  const container = document.getElementById("comptaHistory");

  if (!archives.length) {
    container.innerHTML = `
      <div class="archives-empty">
        <i class="fa-solid fa-folder-open"></i>
        Aucun dossier d'archive.<br>
        <span style="font-size:.82rem">Crée un dossier pour regrouper tes transactions par période.</span>
      </div>`;
    return;
  }

  const TYPE_LABELS = {
    entree:   '<span class="tag tag-entree" style="font-size:.68rem">Entrée</span>',
    virement: '<span class="tag tag-virement" style="font-size:.68rem">Virement</span>',
    sortie:   '<span class="tag tag-sortie" style="font-size:.68rem">Sortie</span>',
  };

  // Construire le HTML de chaque dossier
  container.innerHTML = archives.map(arch => {
    const archTx = transactions.filter(t => t.archiveId === arch.id && t.status !== "pending");
    const totalIn  = archTx.filter(t => t.type === "entree").reduce((s,t) => s + t.montant, 0);
    const totalOut = archTx.filter(t => t.type === "sortie" || t.type === "virement").reduce((s,t) => s + t.montant, 0);
    const txRows = archTx.length ? `
      <div style="overflow-x:auto">
      <table class="compta-table">
        <thead>
          <tr>
            <th>Date</th><th>Type</th><th>Description</th>
            <th style="text-align:right">Montant</th>
            <th style="text-align:right">💰 Coffre</th>
            <th style="text-align:right">🏦 Banque</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${archTx.map(t => `
            <tr>
              <td class="td-date">${formatDateFull(t.date)}</td>
              <td>${TYPE_LABELS[t.type] || ""}</td>
              <td class="td-desc">${escHtml(t.description||"—")}</td>
              <td class="amount-col">
                ${t.type==="entree"  ? `<span class="amount-entree-val">+${chf(t.montant)}</span>` : ""}
                ${t.type==="sortie"  ? `<span class="amount-sortie-val">−${chf(t.montant)}</span>` : ""}
                ${t.type==="virement"? `<span class="amount-virement-val">−${chf(t.montant)}</span>` : ""}
              </td>
              <td class="mini-solde mini-coffre">${chf(t.soldeCoffre)}</td>
              <td class="mini-solde mini-banque">${chf(t.soldeBanque)}</td>
              <td>
                <button class="btn-icon delete" data-remove-from-archive="${t.id}" title="Retirer du dossier">
                  <i class="fa-solid fa-folder-minus"></i>
                </button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>` : `<p class="empty-msg" style="padding:1.2rem"><i class="fa-solid fa-inbox"></i>Aucune transaction dans ce dossier</p>`;

    return `
      <div class="archive-folder" data-archive-id="${arch.id}">
        <div class="archive-folder-header" data-toggle="${arch.id}">
          <div class="archive-folder-icon" id="arch-icon-${arch.id}">
            <i class="fa-solid fa-folder"></i>
          </div>
          <div class="archive-folder-info">
            <div class="archive-folder-name">${escHtml(arch.name)}</div>
            <div class="archive-folder-meta">
              ${arch.dateStart ? `<span>📅 ${formatDate(arch.dateStart)} → ${formatDate(arch.dateEnd || arch.dateStart)}</span>` : ""}
              <span>${archTx.length} transaction${archTx.length!==1?"s":""}</span>
              ${totalIn  ? `<span class="archive-stat-in">+${chf(totalIn)}</span>` : ""}
              ${totalOut ? `<span class="archive-stat-out">−${chf(totalOut)}</span>` : ""}
            </div>
          </div>
          <div class="archive-folder-right">
            <button class="btn-icon delete" data-delete-archive="${arch.id}" title="Supprimer le dossier">
              <i class="fa-solid fa-trash"></i>
            </button>
            <i class="fa-solid fa-chevron-down archive-chevron" id="arch-chev-${arch.id}"></i>
          </div>
        </div>
        <div class="archive-folder-body" id="arch-body-${arch.id}">
          ${txRows}
          <!-- Ajouter des transactions non archivées -->
          <div style="padding:.75rem 1.25rem;border-top:1px solid var(--border);background:var(--white)">
            <select id="arch-add-select-${arch.id}" class="compta-filter" style="margin-right:.5rem;min-width:220px">
              <option value="">Ajouter une transaction à ce dossier…</option>
              ${transactions.filter(t => !t.archiveId && t.status !== "pending").map(t =>
                `<option value="${t.id}">${formatDateFull(t.date)} — ${escHtml(t.description||t.type)} (${chf(t.montant)})</option>`
              ).join("")}
            </select>
            <button class="btn btn-secondary" data-add-to-archive="${arch.id}" style="padding:.35rem .75rem;font-size:.8rem">
              <i class="fa-solid fa-plus"></i> Ajouter
            </button>
          </div>
        </div>
      </div>`;
  }).join("");

  // Toggle ouverture dossier
  container.querySelectorAll("[data-toggle]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-delete-archive]")) return;
      const id = el.dataset.toggle;
      const body = document.getElementById(`arch-body-${id}`);
      const icon = document.getElementById(`arch-icon-${id}`);
      const chev = document.getElementById(`arch-chev-${id}`);
      body.classList.toggle("open");
      chev.classList.toggle("open");
      icon.classList.toggle("open");
      if (body.classList.contains("open")) {
        icon.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
      } else {
        icon.innerHTML = '<i class="fa-solid fa-folder"></i>';
      }
    });
  });

  // Supprimer un dossier
  container.querySelectorAll("[data-delete-archive]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Supprimer ce dossier ?\nLes transactions ne seront pas supprimées.")) return;
      // Retirer l'archiveId de toutes les transactions du dossier
      const archId = btn.dataset.deleteArchive;
      const archTx = transactions.filter(t => t.archiveId === archId);
      await Promise.all(archTx.map(t => fsUpdate("transactions", t.id, { ...t, archiveId: null })));
      await fsDelete("archives", archId);
      showToast("Dossier supprimé.", "info");
    });
  });

  // Retirer une transaction d'un dossier
  container.querySelectorAll("[data-remove-from-archive]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = transactions.find(t => t.id === btn.dataset.removeFromArchive);
      if (!t) return;
      await fsUpdate("transactions", t.id, { ...t, archiveId: null });
      showToast("Transaction retirée du dossier.", "info");
    });
  });

  // Ajouter une transaction à un dossier
  container.querySelectorAll("[data-add-to-archive]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const archId  = btn.dataset.addToArchive;
      const selectEl = document.getElementById(`arch-add-select-${archId}`);
      const txId    = selectEl.value;
      if (!txId) { showToast("Sélectionne une transaction.", "info"); return; }
      const t = transactions.find(t => t.id === txId);
      if (!t) return;
      await fsUpdate("transactions", t.id, { ...t, archiveId: archId });
      showToast("Transaction ajoutée au dossier !", "success");
    });
  });
}

/* ---- Boutons onglets vue ---- */
document.getElementById("viewTabAll").addEventListener("click", () => {
  currentComptaView = "all";
  document.getElementById("viewTabAll").classList.add("active");
  document.getElementById("viewTabArchives").classList.remove("active");
  document.getElementById("filterComptaType").classList.remove("hidden");
  document.getElementById("btnCreateArchive").classList.add("hidden");
  renderCompta();
});
document.getElementById("viewTabArchives").addEventListener("click", () => {
  currentComptaView = "archives";
  document.getElementById("viewTabArchives").classList.add("active");
  document.getElementById("viewTabAll").classList.remove("active");
  document.getElementById("filterComptaType").classList.add("hidden");
  document.getElementById("btnCreateArchive").classList.remove("hidden");
  renderCompta();
});

/* ---- Créer un dossier ---- */
document.getElementById("btnCreateArchive").addEventListener("click", () => {
  openModal("Nouveau dossier d'archive", archiveFormHTML(), async () => {
    const name = mval("fArchiveName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    await fsAdd("archives", {
      id: uid(), name,
      dateStart:   mval("fArchiveStart"),
      dateEnd:     mval("fArchiveEnd"),
      description: mval("fArchiveDesc"),
      createdAt:   new Date().toISOString(),
    });
    closeModal();
    showToast(`Dossier "${name}" créé !`, "success");
  });
});

TAB_TITLES["compta"] = "Comptabilité";

})();
