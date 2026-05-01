(async () => {
"use strict";

/* ============================================================
   IMMOGEST — script.js
   Firebase Auth + Firestore (photos base64, pas de Storage)
   ============================================================ */

/* ============================================================
   1. FIREBASE — Initialisation (sans Storage = 100% gratuit)
   ============================================================ */
let db      = null;
let auth    = null;
let currentUser = null;

function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db   = firebase.firestore();
    auth = firebase.auth();
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
  if (document.getElementById("firestoreWarning")) return;
  // Toast discret en haut de l'écran — pas de popup bloquant
  const bar = document.createElement("div");
  bar.id = "firestoreWarning";
  bar.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:#b91c1c;color:#fff;padding:.6rem 1.25rem;
    display:flex;align-items:center;gap:.75rem;font-size:.82rem;font-weight:600;
    box-shadow:0 2px 8px rgba(0,0,0,.25);
  `;
  bar.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation" style="flex-shrink:0"></i>
    <span>Règles Firebase expirées — données non sauvegardées.
      <a href="https://console.firebase.google.com/project/immogest-e11ff/firestore/rules"
         target="_blank" style="color:#fde68a;text-decoration:underline;margin-left:.3rem">
        Corriger →
      </a>
    </span>
    <button onclick="document.getElementById('firestoreWarning').remove()"
      style="margin-left:auto;background:rgba(255,255,255,.15);border:none;color:#fff;
             padding:.25rem .6rem;border-radius:4px;cursor:pointer;font-size:.8rem">✕</button>
  `;
  document.body.prepend(bar);
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

async function fsAdd(col_name, data) {
  try {
    const {id,...r}=data;
    await col(col_name).doc(id).set(r);
    return id;
  } catch(e) {
    if (e.code === "permission-denied") showFirestorePermissionWarning();
    else showToast("Erreur de sauvegarde : " + e.message, "error");
    throw e;
  }
}
async function fsUpdate(col_name, id, data) {
  try {
    const {id:_,...r}=data;
    await col(col_name).doc(id).set(r,{merge:true});
  } catch(e) {
    if (e.code === "permission-denied") showFirestorePermissionWarning();
    else showToast("Erreur de sauvegarde : " + e.message, "error");
    throw e;
  }
}
async function fsDelete(col_name, id) {
  try {
    await col(col_name).doc(id).delete();
  } catch(e) {
    if (e.code === "permission-denied") showFirestorePermissionWarning();
    else showToast("Erreur de suppression : " + e.message, "error");
    throw e;
  }
}

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

    // Sauvegarder la photo en base64 dans Firestore (pas de Storage)
    let photoB64 = null;
    if (registerAvatarFile) {
      photoB64 = await resizeImageToBase64(registerAvatarFile);
      await user.updateProfile({ photoURL: photoB64 });
    }

    // Créer le profil dans Firestore
    await db.doc(`users/${user.uid}`).set({
      name, email,
      photoBase64: photoB64 || null,
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
  closeMobileSidebar();
  await auth.signOut();
});

/* ============================================================
   6. PHOTO DE PROFIL — stockée en base64 dans Firestore
   Zéro Storage Firebase = 100% gratuit
   ============================================================ */

/**
 * Redimensionne une image et la retourne en base64 (JPEG 80×80px, qualité 0.85).
 * Taille résultante : ~3-8 Ko selon l'image — bien dans les limites Firestore.
 */
function resizeImageToBase64(file, size = 80) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Recadrage centré (crop carré)
        const dim = Math.min(img.width, img.height);
        const sx  = (img.width  - dim) / 2;
        const sy  = (img.height - dim) / 2;
        ctx.drawImage(img, sx, sy, dim, dim, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sauvegarde la photo (base64) dans Firestore + met à jour Firebase Auth photoURL.
 */
async function saveProfilePhoto(uid, file) {
  const b64 = await resizeImageToBase64(file);
  // Stocker dans Firestore
  await db.doc(`users/${uid}`).set({ photoBase64: b64 }, { merge: true });
  // Stocker aussi dans Firebase Auth (URL data: acceptée par updateProfile)
  await currentUser.updateProfile({ photoURL: b64 });
  return b64;
}

/**
 * Charge la photo depuis Firestore si non disponible dans Auth.
 */
async function loadProfilePhoto(uid) {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    if (snap.exists && snap.data().photoBase64) return snap.data().photoBase64;
  } catch(e) { console.warn("loadProfilePhoto:", e); }
  return null;
}

/** Met à jour l'avatar dans la sidebar et l'admin */
async function updateAvatarUI(photoURL, name) {
  // Sidebar
  const icon   = document.getElementById("sidebarAvatarIcon");
  const img    = document.getElementById("sidebarAvatarImg");
  const nameEl = document.getElementById("sidebarUserName");
  if (nameEl) nameEl.textContent = name || "Concierge";

  // Priorité : Firestore > Auth photoURL
  let finalPhoto = photoURL;
  if (!finalPhoto && currentUser) {
    finalPhoto = await loadProfilePhoto(currentUser.uid);
  }

  if (finalPhoto) {
    if (icon) icon.style.display = "none";
    if (img)  { img.src = finalPhoto; img.style.display = "block"; }
  } else {
    if (icon) icon.style.display = "";
    if (img)  img.style.display = "none";
  }

  // Admin panel
  const paIcon = document.getElementById("profileAvatarIcon");
  const paImg  = document.getElementById("profileAvatarImg");
  if (paIcon && paImg) {
    if (finalPhoto) { paIcon.style.display="none"; paImg.src=finalPhoto; paImg.style.display="block"; }
    else            { paIcon.style.display=""; paImg.style.display="none"; }
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
      currentUser = user;
      hideLogin();
      // Afficher l'écran de bienvenue puis initialiser l'app
      await showWelcomeScreen(user);
      await updateAvatarUI(user.photoURL, user.displayName);
      await initApp();
    } else {
      currentUser = null;
      if(unsubTasks)  unsubTasks();
      if(unsubOrders) unsubOrders();
      if(unsubSpaces) unsubSpaces();
      if(unsubApts)   unsubApts();
      hideWelcomeScreen();
      showLogin();
    }
  });
}

/* ---- Écran de bienvenue ---- */
function showWelcomeScreen(user) {
  return new Promise(resolve => {
    const overlay  = document.getElementById("welcomeOverlay");
    const nameEl   = document.getElementById("welcomeName");
    const imgEl    = document.getElementById("welcomeAvatar");
    const iconEl   = document.getElementById("welcomeAvatarIcon");

    // Prénom seulement
    const firstName = (user.displayName || "").split(" ")[0] || "Bienvenue";
    if (nameEl) nameEl.textContent = firstName;

    // Avatar
    const photo = user.photoURL;
    if (imgEl && iconEl) {
      if (photo) {
        imgEl.src = photo;
        imgEl.style.display = "block";
        iconEl.style.display = "none";
      } else {
        imgEl.style.display = "none";
        iconEl.style.display = "flex";
      }
    }

    overlay.classList.remove("hidden");

    // Disparaît après 2.4s
    setTimeout(() => {
      overlay.classList.add("welcome-out");
      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("welcome-out");
        resolve();
      }, 500);
    }, 2400);
  });
}

function hideWelcomeScreen() {
  const overlay = document.getElementById("welcomeOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("welcome-out");
  }
}

/* ============================================================
   8. PROFIL — édition depuis le panneau admin
   ============================================================ */

document.getElementById("userInfoBar").addEventListener("click", () => {
  openAdmin();
});

// Changer la photo depuis l'admin — redimensionnée et stockée dans Firestore
document.getElementById("profilePhotoInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  showToast("Traitement de la photo…", "info");
  try {
    const b64 = await saveProfilePhoto(currentUser.uid, file);
    await updateAvatarUI(b64, currentUser.displayName);
    showToast("Photo de profil mise à jour !", "success");
  } catch(err) {
    showToast("Erreur : " + err.message, "error");
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
    await updateAvatarUI(currentUser.photoURL, name);
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

function formatDateFull(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
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
  if(tabId==="denonce")   renderDenonciations();
  if(tabId==="timbre")    renderTimbrage();
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
          <div class="task-mini-meta">${t.building ? escHtml(t.building) : "Général"} · ${taskStatusTag(t.status)}</div>
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
          ${t.building ? `<span class="tag tag-building"><i class="fa-solid fa-building"></i> ${escHtml(t.building)}</span>` : `<span class="tag tag-building" style="color:var(--text-light)"><i class="fa-solid fa-building"></i> Général</span>`}
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
      <div class="form-group"><label>Immeuble <span style="color:var(--text-light);font-weight:400">(optionnel)</span></label>
        <select id="fBuilding">
          <option value="" ${!t.building?"selected":""}>— Général / Aucun —</option>
          ${buildingOptions(t.building||"")}
        </select>
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
  const el = document.getElementById("filterSpaceBuilding");
  if (el) el.addEventListener("input", renderSpaces);
  const rEl = document.getElementById("filterAptRooms");
  if (rEl) rEl.addEventListener("input", renderSpaces);
}

function renderSpaces(){
  const bld   = document.getElementById("filterSpaceBuilding")?.value || "";
  const rooms = document.getElementById("filterAptRooms")?.value || "";
  const filtS = bld ? spaces.filter(s => s.building === bld) : spaces;
  let   filtA = bld ? apts.filter(a => a.building === bld) : [...apts];

  // Filtre par nombre de pièces
  if (rooms) {
    filtA = filtA.filter(a => {
      const r = parseFloat(a.rooms);
      if (rooms === "1")   return r < 2;
      if (rooms === "2")   return r >= 2 && r < 3;
      if (rooms === "3")   return r >= 3 && r < 4;
      if (rooms === "4")   return r >= 4 && r < 5;
      if (rooms === "5+")  return r >= 5;
      return true;
    });
  }

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

  const al = document.getElementById("aptsList");
  if (!filtA.length) {
    al.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-circle-check"></i>Aucun appartement libre</p>`;
  } else {
    al.innerHTML = filtA.map(a => {
      // Badge disponibilité
      const today = new Date().toISOString().split("T")[0];
      const isAvail = !a.availability || a.availability <= today;
      const availLabel = a.availability
        ? (isAvail ? "Disponible" : `Dès le ${formatDate(a.availability)}`)
        : "Disponible";
      const availColor = isAvail ? "#276749" : "#c05a1a";
      const availBg    = isAvail ? "#f0fff4"  : "#fff0e6";

      return `
      <div class="apt-card">
        <!-- En-tête -->
        <div class="apt-card-header">
          <div class="apt-card-icon"><i class="fa-solid fa-door-open"></i></div>
          <div class="apt-card-title">
            <div class="apt-name">${escHtml(a.name)}</div>
            <div class="apt-building">
              <i class="fa-solid fa-building" style="font-size:.7rem"></i>
              ${escHtml(a.building || "—")}
            </div>
          </div>
          <div class="apt-card-actions">
            <button class="btn-icon edit"   data-id="${a.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" data-id="${a.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <!-- Grille d'infos -->
        <div class="apt-info-grid">
          ${a.rooms ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-door-closed"></i> Pièces</div>
            <div class="apt-info-value">${escHtml(a.rooms)}</div>
          </div>` : ""}
          ${a.surface ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-ruler-combined"></i> Surface</div>
            <div class="apt-info-value">${escHtml(a.surface)} m²</div>
          </div>` : ""}
          ${a.floor ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-elevator"></i> Étage</div>
            <div class="apt-info-value">${escHtml(a.floor)}</div>
          </div>` : ""}
          ${a.price ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-tag"></i> Loyer</div>
            <div class="apt-info-value" style="color:var(--blue);font-weight:700">${escHtml(a.price)} CHF</div>
          </div>` : ""}
          ${a.charges ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-bolt"></i> Charges</div>
            <div class="apt-info-value">${escHtml(a.charges)} CHF</div>
          </div>` : ""}
          ${(a.price && a.charges) ? `<div class="apt-info-cell">
            <div class="apt-info-label"><i class="fa-solid fa-coins"></i> Total/mois</div>
            <div class="apt-info-value" style="color:#276749;font-weight:700">${(parseFloat(a.price||0)+parseFloat(a.charges||0)).toFixed(0)} CHF</div>
          </div>` : ""}
        </div>

        <!-- Footer : disponibilité + notes -->
        <div class="apt-card-footer">
          <span class="apt-avail-badge" style="color:${availColor};background:${availBg}">
            <i class="fa-solid fa-calendar-check"></i> ${availLabel}
          </span>
          ${a.notes ? `<span class="apt-notes"><i class="fa-solid fa-note-sticky"></i> ${escHtml(a.notes)}</span>` : ""}
        </div>
      </div>`}).join("");

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
    <div class="form-row">
      <div class="form-group"><label>Numéro / Nom *</label>
        <input id="fAName" type="text" placeholder="Ex : Appartement 4B, Studio 12…" value="${escHtml(a.name||"")}"/>
      </div>
      <div class="form-group"><label>Immeuble</label>
        <select id="fABuilding">
          <option value="">— Aucun —</option>
          ${buildingOptions(a.building||"")}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nombre de pièces</label>
        <input id="fARooms" type="text" placeholder="Ex : 3.5" value="${escHtml(a.rooms||"")}"/>
      </div>
      <div class="form-group"><label>Surface (m²)</label>
        <input id="fASurface" type="number" min="0" step="0.5" placeholder="Ex : 72" value="${escHtml(a.surface||"")}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Étage</label>
        <input id="fAFloor" type="text" placeholder="Ex : 3e, Rez-de-chaussée…" value="${escHtml(a.floor||"")}"/>
      </div>
      <div class="form-group"><label>Disponible dès le</label>
        <input id="fAAvailability" type="date" value="${a.availability||""}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Loyer (CHF/mois)</label>
        <div style="position:relative">
          <input id="fAPrice" type="number" min="0" step="50" placeholder="Ex : 1450" value="${escHtml(a.price||"")}"/>
        </div>
      </div>
      <div class="form-group"><label>Charges (CHF/mois)</label>
        <input id="fACharges" type="number" min="0" step="10" placeholder="Ex : 150" value="${escHtml(a.charges||"")}"/>
      </div>
    </div>
    ${(a.price||a.charges) ? `
    <div style="background:var(--blue-pale);border-radius:var(--radius-sm);padding:.6rem 1rem;margin-bottom:.5rem;font-size:.85rem;color:var(--blue);font-weight:600">
      <i class="fa-solid fa-coins"></i> Total estimé : ${(parseFloat(a.price||0)+parseFloat(a.charges||0)).toFixed(0)} CHF/mois
    </div>` : ""}
    <div class="form-group"><label>Notes <span style="color:var(--text-light);font-weight:400">(optionnel)</span></label>
      <textarea id="fANotes" placeholder="Travaux prévus, équipements, remarques…" rows="2">${escHtml(a.notes||"")}</textarea>
    </div>`;
}
document.getElementById("btnAddApt").addEventListener("click", async ()=>{
  openModal("Nouvel appartement libre", aptFormHTML(), async ()=>{
    const name=mval("fAName");
    if(!name){showToast("Le nom est obligatoire.","error");return;}
    const newApt={id:uid(),name,
      building:mval("fABuilding"), rooms:mval("fARooms"),
      surface:mval("fASurface"),   floor:mval("fAFloor"),
      availability:mval("fAAvailability"),
      price:mval("fAPrice"),       charges:mval("fACharges"),
      notes:mval("fANotes")};
    await fsAdd("apts",newApt); closeModal();
    showToast("Appartement ajouté !","success");
  });
});
async function editApt(id){
  const a=apts.find(a=>a.id===id); if(!a)return;
  openModal("Modifier l\'appartement", aptFormHTML(a), async ()=>{
    const name=mval("fAName");
    if(!name){showToast("Le nom est obligatoire.","error");return;}
    Object.assign(a,{name,
      building:mval("fABuilding"), rooms:mval("fARooms"),
      surface:mval("fASurface"),   floor:mval("fAFloor"),
      availability:mval("fAAvailability"),
      price:mval("fAPrice"),       charges:mval("fACharges"),
      notes:mval("fANotes")});
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
/* ============================================================
   19. INITIALISATION APRÈS CONNEXION
   ============================================================ */
async function initApp() {
  initCurrentMonth();
  initTimbreMonth();
  await loadBuildings();
  startListeners();
  startComptaListener();
  startArchiveListener();
  startDenonceListener();
  startTimbreListener();
  refreshBuildingSelects();
  refreshComptaBuildingSelect();
  refreshDenonceFilters();
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
   22. COMPTABILITÉ v2 — Gestion mensuelle
   Modèle transaction : { id, type, status, montant, tenant,
     description, date, month, archiveId }
   month = "YYYY-MM" (ex: "2026-04")
   Soldes calculés dynamiquement par mois — pas de stockage
   ============================================================ */

let transactions  = [];
let unsubCompta   = null;
let currentMonth  = "";   // "YYYY-MM"
let currentComptaBuilding = ""; // "" = tous les immeubles

/* ---- Initialiser le mois courant ---- */
function initCurrentMonth() {
  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
}

/* ---- Remplir le sélecteur d'immeubles de la comptabilité ---- */
function refreshComptaBuildingSelect() {
  const sel = document.getElementById("filterComptaBuilding");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">🏢 Tous les immeubles</option>';
  BUILDINGS.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b; opt.textContent = b;
    if (b === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ---- Formater le mois en affichage ---- */
function formatMonthDisplay(ym) {
  const [y, m] = ym.split("-");
  const d = new Date(parseInt(y), parseInt(m)-1, 1);
  const s = d.toLocaleDateString("fr-CH", { month:"long", year:"numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- Naviguer entre les mois ---- */
function changeMonth(delta) {
  const [y, m] = currentMonth.split("-").map(Number);
  const d = new Date(y, m-1+delta, 1);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  document.getElementById("monthDisplay").textContent = formatMonthDisplay(currentMonth);
  renderCompta();
}

document.getElementById("monthPrev").addEventListener("click",  () => changeMonth(-1));
document.getElementById("monthNext").addEventListener("click",  () => changeMonth(+1));
document.getElementById("monthToday").addEventListener("click", () => {
  initCurrentMonth();
  document.getElementById("monthDisplay").textContent = formatMonthDisplay(currentMonth);
  renderCompta();
});
document.getElementById("filterComptaBuilding").addEventListener("change", e => {
  currentComptaBuilding = e.target.value;
  renderCompta();
});

/* ---- Transactions du mois courant (+ filtre immeuble) ---- */
function monthTransactions(buildingFilter) {
  const bld = buildingFilter !== undefined ? buildingFilter : currentComptaBuilding;
  return transactions.filter(t => {
    const monthMatch = (t.month || t.date?.slice(0,7)) === currentMonth;
    const bldMatch   = !bld || (t.building || "") === bld;
    return monthMatch && bldMatch;
  });
}

/* ---- Calculer les soldes du mois ---- */
function getMonthSoldes(month) {
  const list = transactions.filter(t => (t.month || t.date?.slice(0,7)) === month && t.status !== "pending");
  let coffre = 0, banque = 0;
  for (const t of list) {
    if (t.type === "entree")   coffre += t.montant;
    if (t.type === "virement") { coffre -= t.montant; banque += t.montant; }
    if (t.type === "sortie")   banque -= t.montant;
  }
  return {
    coffre: Math.round(coffre * 100) / 100,
    banque: Math.round(banque * 100) / 100
  };
}

/* ---- Soldes CUMULATIFS (tous les mois précédents + courant) ---- */
function getCumulativeSoldes() {
  const confirmed = transactions.filter(t => t.status !== "pending");
  let coffre = 0, banque = 0;
  for (const t of confirmed) {
    if (t.type === "entree")   coffre += t.montant;
    if (t.type === "virement") { coffre -= t.montant; banque += t.montant; }
    if (t.type === "sortie")   banque -= t.montant;
  }
  return {
    coffre: Math.round(coffre * 100) / 100,
    banque: Math.round(banque * 100) / 100
  };
}

/* Alias pour la compatibilité avec les fonctions existantes */
function getSoldes() { return getCumulativeSoldes(); }

/* ---- Format CHF ---- */
function chf(n) {
  return parseFloat(n || 0).toFixed(2) + " CHF";
}

/* ---- Écouter les transactions en temps réel ---- */
function startComptaListener() {
  if (unsubCompta) unsubCompta();
  unsubCompta = col("transactions").onSnapshot(snap => {
    transactions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    // Ajouter le champ month si absent
    transactions.forEach(t => {
      if (!t.month && t.date) t.month = t.date.slice(0, 7);
    });
    renderCompta();
  }, err => {
    if (err.code === "permission-denied") showFirestorePermissionWarning();
  });
}

/* ---- Rendu principal de l'onglet ---- */
function renderCompta() {
  // Navigation mois
  document.getElementById("monthDisplay").textContent = formatMonthDisplay(currentMonth);

  const bld = currentComptaBuilding; // "" = tous, sinon nom de l'immeuble

  // Calcul des soldes selon le filtre actif
  // Si un immeuble est sélectionné → calcul basé uniquement sur ses transactions
  // Si aucun → soldes cumulatifs réels (tous immeubles)
  function calcSoldes(txList) {
    let coffre = 0, banque = 0;
    for (const t of txList.filter(t => t.status !== "pending")) {
      if (t.type === "entree")   coffre += t.montant;
      if (t.type === "virement") { coffre -= t.montant; banque += t.montant; }
      if (t.type === "sortie")   banque -= t.montant;
    }
    return {
      coffre: Math.round(coffre * 100) / 100,
      banque: Math.round(banque * 100) / 100
    };
  }

  // Transactions tous mois (filtré immeuble) pour les soldes cumulatifs
  const allTxBld = bld
    ? transactions.filter(t => (t.building || "") === bld)
    : transactions;
  const { coffre: coffreTotal, banque: banqueTotal } = calcSoldes(allTxBld);

  // Transactions du mois courant (filtré immeuble) pour les hints
  const monthTxBld = monthTransactions(); // déjà filtré par immeuble
  const { coffre: coffreMois, banque: banqueMois } = calcSoldes(monthTxBld);

  document.getElementById("soldeCoffre").textContent = chf(coffreTotal);
  document.getElementById("soldeBanque").textContent = chf(banqueTotal);
  document.getElementById("soldeTotal").textContent  = chf(coffreTotal + banqueTotal);

  // Sous-titres avec indication du filtre actif
  const coffreHint = document.getElementById("soldeCoffreHint");
  const banqueHint = document.getElementById("soldeBanqueHint");
  const hintSuffix = bld ? ` ce mois · ${bld}` : " ce mois";
  if (coffreHint) coffreHint.textContent = `${coffreMois >= 0 ? "+" : ""}${coffreMois.toFixed(2)}${hintSuffix}`;
  if (banqueHint) banqueHint.textContent = `${banqueMois >= 0 ? "+" : ""}${banqueMois.toFixed(2)}${hintSuffix}`;

  // Résumé mensuel (filtré immeuble)
  const monthTx  = monthTxBld.filter(t => t.status !== "pending");
  const totalIn  = monthTx.filter(t => t.type === "entree").reduce((s,t) => s + t.montant, 0);
  const totalOut = monthTx.filter(t => t.type === "sortie" || t.type === "virement").reduce((s,t) => s + t.montant, 0);
  const balance  = totalIn - totalOut;

  document.getElementById("summaryIn").textContent      = "+" + totalIn.toFixed(2) + " CHF";
  document.getElementById("summaryOut").textContent     = "−" + totalOut.toFixed(2) + " CHF";
  document.getElementById("summaryBalance").textContent = (balance >= 0 ? "+" : "") + balance.toFixed(2) + " CHF";

  const balPill = document.getElementById("summaryBalancePill");
  if (balPill) balPill.className = "summary-pill " + (balance >= 0 ? "summary-balance-pos" : "summary-balance-neg");

  // Compteur transactions
  const countEl = document.getElementById("txCount");
  if (countEl) countEl.textContent = monthTx.length;

  // Vue courante
  if (currentComptaView === "buildings") renderBuildingView();
  else if (currentComptaView === "archives") renderArchiveView();
  else renderAllTransactions();
}

/* ---- État de la sélection multiple ---- */
let selectedTxIds = new Set();
let currentComptaView = "all";

function updateSelectionBar() {
  const bar = document.getElementById("selectionBar");
  if (!bar) return;
  const n = selectedTxIds.size;
  bar.classList.toggle("hidden", n === 0);
  const label = bar.querySelector(".sel-count");
  if (label) label.textContent = `${n} transaction${n > 1 ? "s" : ""} sélectionnée${n > 1 ? "s" : ""}`;
}

/* ---- renderAllTransactions ---- */
function renderAllTransactions() {
  const filterType = document.getElementById("filterComptaType").value;
  let list = monthTransactions();

  if (filterType === "pending") {
    list = list.filter(t => t.status === "pending");
  } else if (filterType) {
    list = list.filter(t => t.type === filterType && t.status !== "pending");
  }

  const container = document.getElementById("comptaHistory");

  if (!list.length) {
    container.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-receipt"></i>Aucune transaction ce mois</p>`;
    selectedTxIds.clear();
    updateSelectionBar();
    return;
  }

  const pendingCount = monthTransactions().filter(t => t.status === "pending").length;
  const pendingBanner = pendingCount && filterType !== "pending" ? `
    <div class="pending-banner" onclick="document.getElementById('filterComptaType').value='pending';renderCompta()">
      <i class="fa-solid fa-clock"></i>
      <span>${pendingCount} entrée${pendingCount>1?"s":""} en attente de paiement</span>
      <span class="pending-banner-link">Voir →</span>
    </div>` : "";

  const TYPE_LABELS = {
    entree:   s => s === "pending"
      ? '<span class="tag tag-pending"><i class="fa-solid fa-clock"></i> En attente</span>'
      : '<span class="tag tag-entree">Entrée coffre</span>',
    virement: () => '<span class="tag tag-virement">Coffre → Banque</span>',
    sortie:   () => '<span class="tag tag-sortie">Sortie banque</span>',
  };

  const archivable = list.filter(t => t.status !== "pending");
  const allSelected = archivable.length > 0 && archivable.every(t => selectedTxIds.has(t.id));

  container.innerHTML = pendingBanner + `
    <div style="overflow-x:auto">
    <table class="compta-table">
      <thead>
        <tr>
          <th style="width:36px;text-align:center">
            <input type="checkbox" id="selectAllTx" ${allSelected?"checked":""}
              style="cursor:pointer;accent-color:var(--blue);width:15px;height:15px"/>
          </th>
          <th>Date</th>
          <th>Type</th>
          <th>Immeuble</th>
          <th>Locataire / Motif</th>
          <th>Description</th>
          <th style="text-align:right">+ Coffre</th>
          <th style="text-align:right">− Coffre</th>
          <th style="text-align:right">− Banque</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(t => {
          const isE = t.type === "entree", isV = t.type === "virement", isS = t.type === "sortie";
          const isPend = t.status === "pending";
          const isSelected = selectedTxIds.has(t.id);
          const labelFn = TYPE_LABELS[t.type] || (() => t.type);
          return `
          <tr class="${isPend?"row-pending":""} ${isSelected?"row-selected":""}" data-tx-row="${t.id}">
            <td style="text-align:center">
              ${!isPend ? `<input type="checkbox" class="tx-checkbox" data-tx-id="${t.id}"
                ${isSelected?"checked":""} style="cursor:pointer;accent-color:var(--blue);width:15px;height:15px"/>` : ""}
            </td>
            <td class="td-date">${formatDateFull(t.date)}</td>
            <td>${labelFn(t.status)}</td>
            <td>${t.building
              ? `<span class="tag tag-building" style="font-size:.7rem;white-space:nowrap"><i class="fa-solid fa-building"></i> ${escHtml(t.building)}</span>`
              : `<span style="color:var(--text-light);font-size:.78rem">—</span>`}</td>
            <td class="td-desc" style="font-weight:600;color:var(--navy)">
              ${escHtml(t.tenant || t.motif || "—")}
            </td>
            <td class="td-desc" style="color:var(--text-light);font-weight:400;font-size:.82rem">
              ${escHtml(t.description || "")}
            </td>
            <td class="amount-col">
              ${isE && !isPend ? `<span class="amount-entree-val">+${chf(t.montant)}</span>`
                : isPend ? `<span style="color:#d97706;font-family:'DM Mono',monospace">(${chf(t.montant)})</span>`
                : `<span class="amount-dash">—</span>`}
            </td>
            <td class="amount-col">
              ${isV ? `<span class="amount-virement-val">−${chf(t.montant)}</span>` : `<span class="amount-dash">—</span>`}
            </td>
            <td class="amount-col">
              ${isS ? `<span class="amount-sortie-val">−${chf(t.montant)}</span>` : `<span class="amount-dash">—</span>`}
            </td>
            <td>
              <div style="display:flex;gap:.3rem;align-items:center">
                ${isPend ? `<button class="confirm-pay-btn" data-confirm-id="${t.id}">
                  <i class="fa-solid fa-check"></i> Confirmer
                </button>` : ""}
                <button class="btn-icon delete" data-compta-id="${t.id}" title="Supprimer">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>`;

  // Checkbox tout sélectionner
  const selectAll = container.querySelector("#selectAllTx");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      archivable.forEach(t => selectAll.checked ? selectedTxIds.add(t.id) : selectedTxIds.delete(t.id));
      updateSelectionBar();
      renderAllTransactions();
    });
  }

  container.querySelectorAll(".tx-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.checked ? selectedTxIds.add(cb.dataset.txId) : selectedTxIds.delete(cb.dataset.txId);
      const row = container.querySelector(`[data-tx-row="${cb.dataset.txId}"]`);
      if (row) row.classList.toggle("row-selected", cb.checked);
      updateSelectionBar();
      if (selectAll) selectAll.checked = archivable.every(t => selectedTxIds.has(t.id));
    });
  });

  container.querySelectorAll("[data-confirm-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirmer la réception de ce paiement ?")) return;
      await confirmPendingEntry(btn.dataset.confirmId);
    });
  });

  container.querySelectorAll("[data-compta-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette transaction ?")) return;
      selectedTxIds.delete(btn.dataset.comptaId);
      updateSelectionBar();
      await fsDelete("transactions", btn.dataset.comptaId);
      showToast("Transaction supprimée.", "info");
    });
  });

  updateSelectionBar();
}

/* ---- Confirmer un paiement en attente ---- */
async function confirmPendingEntry(id) {
  const t = transactions.find(t => t.id === id);
  if (!t || t.status !== "pending") return;
  const confirmed = { ...t, id: uid(), status: "confirmed", date: new Date().toISOString() };
  confirmed.month = confirmed.date.slice(0, 7);
  await fsAdd("transactions", confirmed);
  await fsDelete("transactions", id);
  showToast(`Paiement confirmé ! +${chf(t.montant)}`, "success");
}

/* ---- Formulaire transaction ---- */
function comptaFormHTML(type) {
  const today = new Date().toISOString().slice(0, 16);
  const { coffre, banque } = getCumulativeSoldes();

  const configs = {
    entree:   { color:"#e8843b", icon:"fa-plus",                   label:"Entrée coffre",   desc:"Recharge puce / dépôt liquide" },
    virement: { color:"#1e5cbf", icon:"fa-arrow-right-arrow-left", label:"Coffre → Banque", desc:"Déposer le liquide en banque" },
    sortie:   { color:"#38a169", icon:"fa-minus",                  label:"Sortie banque",   desc:"Payer une facture régie" },
  };
  const c = configs[type];

  return `
    <div class="compta-form-header" style="border-left:4px solid ${c.color}">
      <i class="fa-solid ${c.icon}" style="color:${c.color};font-size:1.1rem"></i>
      <div>
        <div style="font-weight:700;color:var(--navy)">${c.label}</div>
        <div style="font-size:.78rem;color:var(--text-light)">${c.desc}</div>
      </div>
    </div>

    <div class="compta-solde-row">
      <div class="compta-solde-mini">
        <div class="csm-label">Coffre actuel</div>
        <div class="csm-value csm-orange">${chf(coffre)}</div>
      </div>
      <div class="compta-solde-mini">
        <div class="csm-label">Banque actuelle</div>
        <div class="csm-value csm-blue">${chf(banque)}</div>
      </div>
    </div>

    ${type === "entree" ? `
    <div class="form-group">
      <label>Nom du locataire *</label>
      <input id="fTenant" type="text" placeholder="Ex : Marie Dupont, Apt 4B"/>
    </div>` : ""}

    ${type === "sortie" ? `
    <div class="form-group">
      <label>Motif / Régie *</label>
      <input id="fMotif" type="text" placeholder="Ex : Facture régie avril 2026"/>
    </div>` : ""}

    ${type === "virement" ? `
    <div class="form-group">
      <label>Description</label>
      <input id="fMotif" type="text" placeholder="Ex : Dépôt coffre → banque" value="Transfert coffre → banque"/>
    </div>` : ""}

    <div class="form-row">
      <div class="form-group">
        <label>Montant (CHF) *</label>
        <input id="fComptaMontant" type="number" min="0.01" step="0.05"
               placeholder="0.00" style="font-size:1.1rem;font-weight:700"/>
      </div>
      <div class="form-group">
        <label>Date & heure</label>
        <input id="fComptaDate" type="datetime-local" value="${today}"/>
      </div>
    </div>

    <div class="form-group">
      <label>Immeuble <span style="color:var(--text-light);font-weight:400">(optionnel)</span></label>
      <select id="fComptaBuilding">
        <option value="">— Général / Tous —</option>
        ${BUILDINGS.map(b => `<option value="${b}"${currentComptaBuilding===b?' selected':''}>${b}</option>`).join("")}
      </select>
    </div>

    <div class="form-group">
      <label>Notes <span style="color:var(--text-light);font-weight:400">(optionnel)</span></label>
      <input id="fComptaDesc" type="text" placeholder="Remarques supplémentaires…"/>
    </div>

    ${type === "entree" ? `
    <label class="pending-checkbox-wrap" for="fComptaPending">
      <input type="checkbox" id="fComptaPending"/>
      <div>
        <div class="pending-cb-title"><i class="fa-solid fa-clock"></i> En attente</div>
        <div class="pending-cb-desc">Le locataire paiera plus tard — n'affecte pas le solde</div>
      </div>
    </label>` : ""}`;
}

/* ---- Sauvegarder une transaction ---- */
async function saveTransaction(type) {
  const montantRaw = parseFloat(document.getElementById("fComptaMontant")?.value);
  if (!montantRaw || montantRaw <= 0) {
    showToast("Le montant doit être supérieur à 0.", "error"); return false;
  }
  const montant = Math.round(montantRaw * 100) / 100;

  const dateVal = document.getElementById("fComptaDate")?.value;
  const date    = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
  const month   = date.slice(0, 7);

  const description = document.getElementById("fComptaDesc")?.value.trim() || "";
  const tenant  = document.getElementById("fTenant")?.value.trim() || "";
  const motif   = document.getElementById("fMotif")?.value.trim() || "";
  const building = document.getElementById("fComptaBuilding")?.value || "";
  const pending = document.getElementById("fComptaPending")?.checked || false;

  // Validation
  if (type === "entree" && !pending && !tenant) {
    showToast("Le nom du locataire est obligatoire.", "error"); return false;
  }
  if ((type === "sortie" || type === "virement") && !motif && type === "sortie") {
    showToast("Le motif est obligatoire.", "error"); return false;
  }

  // Vérification soldes
  const { coffre, banque } = getCumulativeSoldes();
  if (type === "virement" && montant > coffre) {
    showToast(`Solde coffre insuffisant (${chf(coffre)}).`, "error"); return false;
  }
  if (type === "sortie" && montant > banque) {
    showToast(`Solde bancaire insuffisant (${chf(banque)}).`, "error"); return false;
  }

  const newDoc = {
    id: uid(), type,
    status: (type === "entree" && pending) ? "pending" : "confirmed",
    montant, date, month, description,
    ...(tenant   ? { tenant }   : {}),
    ...(motif    ? { motif }    : {}),
    ...(building ? { building } : {}),
  };

  await fsAdd("transactions", newDoc);
  closeModal();
  showToast(pending ? `Entrée en attente enregistrée — ${chf(montant)}` : "Transaction enregistrée ✓", pending ? "info" : "success");
  return true;
}

/* ---- Boutons d'action ---- */
document.getElementById("btnEntree").addEventListener("click", () => {
  openModal("Entrée coffre", comptaFormHTML("entree"), async () => { await saveTransaction("entree"); });
});
document.getElementById("btnVirement").addEventListener("click", () => {
  openModal("Coffre → Banque", comptaFormHTML("virement"), async () => { await saveTransaction("virement"); });
});
document.getElementById("btnSortie").addEventListener("click", () => {
  openModal("Sortie banque", comptaFormHTML("sortie"), async () => { await saveTransaction("sortie"); });
});

/* ---- Filtre ---- */
document.getElementById("filterComptaType").addEventListener("change", renderCompta);

/* ---- Onglets vue ---- */
document.getElementById("viewTabAll").addEventListener("click", () => {
  currentComptaView = "all";
  document.querySelectorAll(".compta-view-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("viewTabAll").classList.add("active");
  document.getElementById("filterComptaType").classList.remove("hidden");
  document.getElementById("btnCreateArchive").classList.add("hidden");
  renderCompta();
});
document.getElementById("viewTabBuildings").addEventListener("click", () => {
  currentComptaView = "buildings";
  document.querySelectorAll(".compta-view-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("viewTabBuildings").classList.add("active");
  document.getElementById("filterComptaType").classList.add("hidden");
  document.getElementById("btnCreateArchive").classList.add("hidden");
  renderCompta();
});
document.getElementById("viewTabArchives").addEventListener("click", () => {
  currentComptaView = "archives";
  document.querySelectorAll(".compta-view-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("viewTabArchives").classList.add("active");
  document.getElementById("filterComptaType").classList.add("hidden");
  document.getElementById("btnCreateArchive").classList.remove("hidden");
  renderCompta();
});

/* ---- Vue par immeuble ---- */
function renderBuildingView() {
  const container = document.getElementById("comptaHistory");

  // Calculer les stats pour chaque immeuble + une ligne "Général"
  const allBldgs = [...BUILDINGS, ""];  // "" = transactions sans immeuble

  const rows = allBldgs.map(bld => {
    const txList = monthTransactions(bld).filter(t => t.status !== "pending");
    if (!txList.length) return null;

    const totalIn   = txList.filter(t => t.type === "entree").reduce((s,t) => s + t.montant, 0);
    const totalVir  = txList.filter(t => t.type === "virement").reduce((s,t) => s + t.montant, 0);
    const totalOut  = txList.filter(t => t.type === "sortie").reduce((s,t) => s + t.montant, 0);
    const balance   = totalIn - totalVir - totalOut;
    const label     = bld || "Général (sans immeuble)";
    const countTx   = txList.length;

    return { bld, label, totalIn, totalVir, totalOut, balance, countTx, txList };
  }).filter(Boolean);

  if (!rows.length) {
    container.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-building"></i>Aucune transaction ce mois</p>`;
    return;
  }

  container.innerHTML = rows.map(r => {
    const balColor = r.balance >= 0 ? "#276749" : "#dc2626";
    const balBg    = r.balance >= 0 ? "#f0fff4"  : "#fef2f2";
    const txRows   = r.txList.map(t => `
      <tr>
        <td class="td-date">${formatDateFull(t.date)}</td>
        <td>${t.type === "entree"
              ? '<span class="tag tag-entree" style="font-size:.7rem">Entrée</span>'
              : t.type === "virement"
              ? '<span class="tag tag-virement" style="font-size:.7rem">Virement</span>'
              : '<span class="tag tag-sortie" style="font-size:.7rem">Sortie</span>'}</td>
        <td class="td-desc">${escHtml(t.tenant || t.motif || "—")}</td>
        <td class="amount-col">
          ${t.type==="entree"   ? `<span class="amount-entree-val">+${chf(t.montant)}</span>` : ""}
          ${t.type==="virement" ? `<span class="amount-virement-val">−${chf(t.montant)}</span>` : ""}
          ${t.type==="sortie"   ? `<span class="amount-sortie-val">−${chf(t.montant)}</span>` : ""}
        </td>
      </tr>`).join("");

    return `
    <div class="bld-compta-block">
      <!-- En-tête immeuble cliquable -->
      <div class="bld-compta-header" data-bld="${escHtml(r.bld)}">
        <div class="bld-compta-icon">
          <i class="fa-solid fa-building"></i>
        </div>
        <div class="bld-compta-info">
          <div class="bld-compta-name">${escHtml(r.label)}</div>
          <div class="bld-compta-meta">
            <span>${r.countTx} transaction${r.countTx>1?"s":""}</span>
            ${r.totalIn  ? `<span class="bld-stat-in">+${chf(r.totalIn)}</span>` : ""}
            ${r.totalVir ? `<span class="bld-stat-vir">⇄ ${chf(r.totalVir)}</span>` : ""}
            ${r.totalOut ? `<span class="bld-stat-out">−${chf(r.totalOut)}</span>` : ""}
          </div>
        </div>
        <div class="bld-compta-balance" style="color:${balColor};background:${balBg}">
          ${r.balance >= 0 ? "+" : ""}${chf(r.balance)}
        </div>
        <i class="fa-solid fa-chevron-down bld-compta-chev" id="bld-chev-${escHtml(r.bld||'general')}"></i>
      </div>
      <!-- Détail dépliable -->
      <div class="bld-compta-body" id="bld-body-${escHtml(r.bld||'general')}">
        <div style="overflow-x:auto">
        <table class="compta-table">
          <thead><tr>
            <th>Date</th><th>Type</th><th>Locataire / Motif</th>
            <th style="text-align:right">Montant</th>
          </tr></thead>
          <tbody>${txRows}</tbody>
        </table>
        </div>
      </div>
    </div>`;
  }).join("");

  // Toggle dépliage
  container.querySelectorAll(".bld-compta-header").forEach(hdr => {
    hdr.addEventListener("click", () => {
      const bld  = hdr.dataset.bld;
      const key  = bld || "general";
      const body = document.getElementById(`bld-body-${key}`);
      const chev = document.getElementById(`bld-chev-${key}`);
      if (!body) return;
      body.classList.toggle("open");
      if (chev) chev.classList.toggle("open");
    });
  });
}

/* ---- Archives ---- */
let archives      = [];
let unsubArchives = null;

function startArchiveListener() {
  if (unsubArchives) unsubArchives();
  unsubArchives = col("archives").onSnapshot(snap => {
    archives = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (currentComptaView === "archives") renderArchiveView();
  }, err => { if (err.code === "permission-denied") showFirestorePermissionWarning(); });
}

function archiveFormHTML(a = {}) {
  const today = new Date().toISOString().split("T")[0];
  return `
    <div class="form-group">
      <label>Nom du dossier *</label>
      <input id="fArchiveName" type="text" placeholder="Ex : Factures Avril 2026" value="${escHtml(a.name||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date de début</label>
        <input id="fArchiveStart" type="date" value="${a.dateStart||today}"/>
      </div>
      <div class="form-group">
        <label>Date de fin</label>
        <input id="fArchiveEnd" type="date" value="${a.dateEnd||today}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <input id="fArchiveDesc" type="text" placeholder="Période, remarques…" value="${escHtml(a.description||"")}"/>
    </div>`;
}

function renderArchiveView() {
  const container = document.getElementById("comptaHistory");
  if (!archives.length) {
    container.innerHTML = `<div class="archives-empty"><i class="fa-solid fa-folder-open"></i>Aucun dossier d'archive.<br><span style="font-size:.82rem">Crée un dossier pour regrouper tes transactions.</span></div>`;
    return;
  }

  const TYPE_LABELS = {
    entree:   '<span class="tag tag-entree" style="font-size:.68rem">Entrée</span>',
    virement: '<span class="tag tag-virement" style="font-size:.68rem">Virement</span>',
    sortie:   '<span class="tag tag-sortie" style="font-size:.68rem">Sortie</span>',
  };

  container.innerHTML = archives.map(arch => {
    const archTx  = transactions.filter(t => t.archiveId === arch.id && t.status !== "pending");
    const totalIn  = archTx.filter(t => t.type==="entree").reduce((s,t)=>s+t.montant,0);
    const totalOut = archTx.filter(t => t.type==="sortie"||t.type==="virement").reduce((s,t)=>s+t.montant,0);

    const txRows = archTx.length ? `
      <div style="overflow-x:auto">
      <table class="compta-table">
        <thead><tr>
          <th>Date</th><th>Type</th><th>Locataire / Motif</th>
          <th style="text-align:right">Montant</th><th></th>
        </tr></thead>
        <tbody>
          ${archTx.map(t => `
          <tr>
            <td class="td-date">${formatDateFull(t.date)}</td>
            <td>${TYPE_LABELS[t.type]||""}</td>
            <td class="td-desc">${escHtml(t.tenant||t.motif||t.description||"—")}</td>
            <td class="amount-col">
              ${t.type==="entree"  ?`<span class="amount-entree-val">+${chf(t.montant)}</span>`:""}
              ${t.type==="sortie"  ?`<span class="amount-sortie-val">−${chf(t.montant)}</span>`:""}
              ${t.type==="virement"?`<span class="amount-virement-val">−${chf(t.montant)}</span>`:""}
            </td>
            <td>
              <button class="btn-icon delete" data-remove-from-archive="${t.id}" title="Retirer">
                <i class="fa-solid fa-folder-minus"></i>
              </button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
      </div>` : `<p class="empty-msg" style="padding:1rem"><i class="fa-solid fa-inbox"></i>Aucune transaction</p>`;

    return `
      <div class="archive-folder" data-archive-id="${arch.id}">
        <div class="archive-folder-header" data-toggle="${arch.id}">
          <div class="archive-folder-icon" id="arch-icon-${arch.id}"><i class="fa-solid fa-folder"></i></div>
          <div class="archive-folder-info">
            <div class="archive-folder-name">${escHtml(arch.name)}</div>
            <div class="archive-folder-meta">
              ${arch.dateStart?`<span>📅 ${formatDate(arch.dateStart)} → ${formatDate(arch.dateEnd||arch.dateStart)}</span>`:""}
              <span>${archTx.length} transaction${archTx.length!==1?"s":""}</span>
              ${totalIn ?`<span class="archive-stat-in">+${chf(totalIn)}</span>`:""}
              ${totalOut?`<span class="archive-stat-out">−${chf(totalOut)}</span>`:""}
            </div>
          </div>
          <div class="archive-folder-right">
            <button class="btn-icon delete" data-delete-archive="${arch.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
            <i class="fa-solid fa-chevron-down archive-chevron" id="arch-chev-${arch.id}"></i>
          </div>
        </div>
        <div class="archive-folder-body" id="arch-body-${arch.id}">
          ${txRows}
          <div style="padding:.75rem 1.25rem;border-top:1px solid var(--border);background:var(--white);display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
            <select id="arch-add-select-${arch.id}" class="compta-filter" style="flex:1;min-width:200px">
              <option value="">Ajouter une transaction à ce dossier…</option>
              ${transactions.filter(t=>!t.archiveId&&t.status!=="pending").map(t=>
                `<option value="${t.id}">${formatDateFull(t.date)} — ${escHtml(t.tenant||t.motif||t.description||t.type)} (${chf(t.montant)})</option>`
              ).join("")}
            </select>
            <button class="btn btn-secondary" data-add-to-archive="${arch.id}" style="padding:.35rem .75rem;font-size:.8rem">
              <i class="fa-solid fa-plus"></i> Ajouter
            </button>
          </div>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-toggle]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-delete-archive]")) return;
      const id   = el.dataset.toggle;
      const body = document.getElementById(`arch-body-${id}`);
      const icon = document.getElementById(`arch-icon-${id}`);
      const chev = document.getElementById(`arch-chev-${id}`);
      body.classList.toggle("open"); chev.classList.toggle("open");
      icon.innerHTML = body.classList.contains("open") ? '<i class="fa-solid fa-folder-open"></i>' : '<i class="fa-solid fa-folder"></i>';
    });
  });

  container.querySelectorAll("[data-delete-archive]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Supprimer ce dossier ?")) return;
      const archId = btn.dataset.deleteArchive;
      const archTx = transactions.filter(t => t.archiveId === archId);
      await Promise.all(archTx.map(t => fsUpdate("transactions", t.id, { ...t, archiveId: null })));
      await fsDelete("archives", archId);
      showToast("Dossier supprimé.", "info");
    });
  });

  container.querySelectorAll("[data-remove-from-archive]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = transactions.find(t => t.id === btn.dataset.removeFromArchive);
      if (t) await fsUpdate("transactions", t.id, { ...t, archiveId: null });
      showToast("Retirée du dossier.", "info");
    });
  });

  container.querySelectorAll("[data-add-to-archive]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const archId = btn.dataset.addToArchive;
      const sel    = document.getElementById(`arch-add-select-${archId}`);
      const txId   = sel?.value;
      if (!txId) { showToast("Sélectionne une transaction.", "info"); return; }
      const t = transactions.find(t => t.id === txId);
      if (t) await fsUpdate("transactions", t.id, { ...t, archiveId: archId });
      showToast("Ajoutée au dossier !", "success");
    });
  });
}

document.getElementById("btnCreateArchive").addEventListener("click", () => {
  openModal("Nouveau dossier d'archive", archiveFormHTML(), async () => {
    const name = mval("fArchiveName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    await fsAdd("archives", { id:uid(), name, dateStart:mval("fArchiveStart"), dateEnd:mval("fArchiveEnd"), description:mval("fArchiveDesc"), createdAt:new Date().toISOString() });
    closeModal();
    showToast(`Dossier "${name}" créé !`, "success");
  });
});

/* ---- Archiver la sélection ---- */
document.getElementById("btnArchiveSelected").addEventListener("click", () => {
  if (!selectedTxIds.size) return;
  if (!archives.length) { showToast("Crée d'abord un dossier dans l'onglet Archives.", "info"); return; }
  const n = selectedTxIds.size;
  openModal(`Archiver ${n} transaction${n>1?"s":""}`,
    `<div class="form-group">
       <label>Dossier de destination *</label>
       <select id="fBulkArchive">
         <option value="">— Sélectionner —</option>
         ${archives.map(a=>`<option value="${a.id}">${escHtml(a.name)}</option>`).join("")}
       </select>
     </div>
     <p style="font-size:.82rem;color:var(--text-light);margin-top:.5rem">
       ${n} transaction${n>1?"s":""} seront ajoutée${n>1?"s":""} au dossier.
     </p>`,
    async () => {
      const archiveId = document.getElementById("fBulkArchive")?.value;
      if (!archiveId) { showToast("Sélectionne un dossier.", "error"); return; }
      await Promise.all([...selectedTxIds].map(id => {
        const t = transactions.find(t => t.id === id);
        return t ? fsUpdate("transactions", id, { ...t, archiveId }) : Promise.resolve();
      }));
      const archName = archives.find(a => a.id === archiveId)?.name || "le dossier";
      selectedTxIds.clear(); updateSelectionBar();
      closeModal();
      showToast(`${[...selectedTxIds].length || n} transactions archivées dans "${archName}" ✓`, "success");
    });
});

document.getElementById("btnClearSelection").addEventListener("click", () => {
  selectedTxIds.clear(); updateSelectionBar(); renderAllTransactions();
});

/* ---- Export CSV (respecte le filtre immeuble actif) ---- */
document.getElementById("btnExportCSV").addEventListener("click", () => {
  const list = monthTransactions().filter(t => t.status !== "pending");
  if (!list.length) { showToast("Aucune transaction à exporter.", "info"); return; }

  const bld      = currentComptaBuilding;
  const bldLabel = bld || "Tous immeubles";
  const month    = formatMonthDisplay(currentMonth);

  const headers = ["Date","Immeuble","Type","Locataire / Motif","Description",
                   "Entrée coffre CHF","Sortie coffre CHF","Sortie banque CHF"];
  const rows = list.map(t => [
    formatDateFull(t.date),
    t.building || "Général",
    t.type === "entree" ? "Entrée coffre" : t.type === "virement" ? "Coffre→Banque" : "Sortie banque",
    t.tenant || t.motif || "",
    t.description || "",
    t.type === "entree"   ? t.montant.toFixed(2) : "",
    t.type === "virement" ? t.montant.toFixed(2) : "",
    t.type === "sortie"   ? t.montant.toFixed(2) : "",
  ]);

  // Ligne de résumé en bas
  const totalIn  = list.filter(t=>t.type==="entree").reduce((s,t)=>s+t.montant,0);
  const totalOut = list.filter(t=>t.type==="sortie"||t.type==="virement").reduce((s,t)=>s+t.montant,0);
  rows.push([]);
  rows.push(["TOTAL",bldLabel,"","","",totalIn.toFixed(2),
    list.filter(t=>t.type==="virement").reduce((s,t)=>s+t.montant,0).toFixed(2),
    list.filter(t=>t.type==="sortie").reduce((s,t)=>s+t.montant,0).toFixed(2)]);

  const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v||"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `ImmoGest_${month.replace(/ /g,"_")}${bld?"_"+bld.replace(/ /g,"_"):""}.csv`;
  a.click();
  showToast(`CSV "${a.download}" téléchargé !`, "success");
});

/* ---- Export PDF mensuel (respecte le filtre immeuble actif) ---- */
document.getElementById("btnExportMonthPDF").addEventListener("click", async () => {
  const list = monthTransactions().filter(t => t.status !== "pending");
  if (!list.length) { showToast("Aucune transaction à exporter.", "info"); return; }
  if (typeof window.jspdf === "undefined") { showToast("PDF en cours de chargement, réessaie.", "info"); return; }

  const bld        = currentComptaBuilding;
  const bldLabel   = bld || "Tous les immeubles";
  const MONTH_LABEL = formatMonthDisplay(currentMonth);

  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const NAVY = [26,38,64], BLUE = [30,92,191], ORANGE = [232,106,26], LGRAY = [240,243,251];
  const GREEN= [40,120,80], RED  = [180,40,40];
  const PAGE_W = 297, M = 15;
  const TODAY  = new Date().toLocaleDateString("fr-CH");

  // ---- Header ----
  doc.setFillColor(...NAVY); doc.rect(0,0,PAGE_W,32,"F");
  doc.setFillColor(...ORANGE); doc.rect(0,32,PAGE_W,2.5,"F");

  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(255,255,255);
  doc.text("ImmoGest — Rapport mensuel", M, 14);

  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(160,180,220);
  doc.text(MONTH_LABEL, M, 22);

  // Badge immeuble dans l'en-tête
  if (bld) {
    doc.setFillColor(232,106,26);
    doc.roundedRect(M + doc.getTextWidth(MONTH_LABEL) + 4, 17.5, doc.getTextWidth(bld) + 8, 6.5, 2, 2, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(255,255,255);
    doc.text(bld, M + doc.getTextWidth(MONTH_LABEL) + 8, 22);
  }

  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(200,210,230);
  doc.text(`Généré le ${TODAY}`, PAGE_W-M, 22, {align:"right"});

  // ---- Cartes résumé ----
  // Calcul basé uniquement sur les transactions filtrées
  const totalIn  = list.filter(t=>t.type==="entree").reduce((s,t)=>s+t.montant,0);
  const totalVir = list.filter(t=>t.type==="virement").reduce((s,t)=>s+t.montant,0);
  const totalOut = list.filter(t=>t.type==="sortie").reduce((s,t)=>s+t.montant,0);
  const balance  = totalIn - totalVir - totalOut;

  // Soldes cumulatifs filtrés sur l'immeuble
  const allTxBld = bld ? transactions.filter(t=>(t.building||"")===bld) : transactions;
  let coffreCum = 0, banqueCum = 0;
  for (const t of allTxBld.filter(t=>t.status!=="pending")) {
    if (t.type==="entree")   coffreCum += t.montant;
    if (t.type==="virement") { coffreCum -= t.montant; banqueCum += t.montant; }
    if (t.type==="sortie")   banqueCum -= t.montant;
  }
  coffreCum = Math.round(coffreCum*100)/100;
  banqueCum = Math.round(banqueCum*100)/100;

  let y = 42;
  const pills = [
    { l:`Coffre liquide${bld?" ("+bld+")":""}`, v: chf(coffreCum),  c: ORANGE },
    { l:`Compte bancaire${bld?" ("+bld+")":""}`,v: chf(banqueCum),  c: BLUE   },
    { l:"Entrées du mois",                        v: "+"+chf(totalIn), c: GREEN  },
    { l:"Sorties du mois",                        v: "−"+chf(totalOut+totalVir), c: RED   },
    { l:"Solde net",                               v: (balance>=0?"+":"")+chf(balance),
      c: balance >= 0 ? GREEN : RED },
  ];
  const pillW = (PAGE_W - 2*M) / pills.length;
  pills.forEach((p, i) => {
    const x = M + i * pillW;
    doc.setFillColor(...LGRAY); doc.roundedRect(x, y, pillW-3, 20, 2, 2, "F");
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(100,116,148);
    // Tronquer le label si trop long
    const maxW = pillW - 8;
    let label = p.l;
    while (doc.getTextWidth(label) > maxW && label.length > 5) label = label.slice(0,-1);
    doc.text(label, x+4, y+7);
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(...p.c);
    doc.text(p.v, x+4, y+16);
  });

  // ---- Tableau transactions ----
  doc.autoTable({
    startY: y + 27,
    margin: { left:M, right:M },
    head: [["Date","Immeuble","Type","Locataire / Motif","Description","+ Coffre","− Coffre","− Banque"]],
    body: list.map(t => [
      formatDateFull(t.date),
      t.building || "Général",
      t.type==="entree" ? "Entrée coffre" : t.type==="virement" ? "Coffre→Banque" : "Sortie banque",
      t.tenant || t.motif || "—",
      t.description || "",
      t.type==="entree"   ? "+"+chf(t.montant) : "—",
      t.type==="virement" ? "−"+chf(t.montant) : "—",
      t.type==="sortie"   ? "−"+chf(t.montant) : "—",
    ]),
    styles: { font:"helvetica", fontSize:8, cellPadding:3, textColor:[...NAVY] },
    headStyles: { fillColor:[...BLUE], textColor:[255,255,255], fontStyle:"bold", fontSize:7.5 },
    alternateRowStyles: { fillColor:[...LGRAY] },
    // Ligne de total en bas du tableau
    foot: [["","","TOTAL","","",
      "+"+chf(totalIn), "−"+chf(totalVir), "−"+chf(totalOut)]],
    footStyles: { fillColor:[...NAVY], textColor:[255,255,255], fontStyle:"bold", fontSize:8 },
  });

  // ---- Footer ----
  const ph = doc.internal.pageSize.height;
  doc.setFillColor(...NAVY); doc.rect(0, ph-12, PAGE_W, 12, "F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(140,160,200);
  doc.text(
    `ImmoGest • ${MONTH_LABEL}${bld ? " • "+bld : ""} • ${list.length} transaction${list.length>1?"s":""} • Généré le ${TODAY}`,
    PAGE_W/2, ph-5, { align:"center" }
  );

  const filename = `ImmoGest_${MONTH_LABEL.replace(/ /g,"_")}${bld?"_"+bld.replace(/ /g,"_"):""}.pdf`;
  doc.save(filename);
  showToast(`PDF "${filename}" téléchargé !`, "success");
});

TAB_TITLES["compta"]  = "Comptabilité";
TAB_TITLES["denonce"] = "Dénonciations";

/* ============================================================
   DÉNONCIATIONS — Véhicules en infraction
   Collection Firestore : "denonciations"
   ============================================================ */

let denonciations  = [];
let unsubDenonce   = null;

function startDenonceListener() {
  if (unsubDenonce) unsubDenonce();
  unsubDenonce = col("denonciations")
    .onSnapshot(snap => {
      denonciations = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      if (document.getElementById("tab-denonce").classList.contains("active")) renderDenonciations();
      // Badge sidebar
      const badge = document.getElementById("badgeDenonce");
      if (badge) badge.textContent = denonciations.length;
    }, err => { if (err.code === "permission-denied") showFirestorePermissionWarning(); });
}

/* ---- Filtres ---- */
function getFilteredDenonciations() {
  const bld    = document.getElementById("filterDenonceBuilding")?.value || "";
  const plate  = document.getElementById("filterDenoncePlate")?.value.trim().toLowerCase() || "";
  const search = document.getElementById("filterDenonceSearch")?.value.trim().toLowerCase() || "";
  let list = [...denonciations];
  if (bld)    list = list.filter(d => d.building === bld);
  if (plate)  list = list.filter(d => (d.plate||"").toLowerCase().includes(plate));
  if (search) list = list.filter(d =>
    (d.model||"").toLowerCase().includes(search) ||
    (d.color||"").toLowerCase().includes(search) ||
    (d.reason||"").toLowerCase().includes(search) ||
    (d.notes||"").toLowerCase().includes(search)
  );
  return list;
}

/* ---- Rendu ---- */
function renderDenonciations() {
  const list = getFilteredDenonciations();
  const container = document.getElementById("denonceList");
  const countEl   = document.getElementById("denonceCount");
  if (countEl) countEl.textContent = list.length;

  if (!list.length) {
    container.innerHTML = `<div class="card"><p class="empty-msg">
      <i class="fa-solid fa-car-burst"></i>Aucune dénonciation trouvée</p></div>`;
    return;
  }

  // Grouper par plaque si filtre plaque actif
  const plateFilter = document.getElementById("filterDenoncePlate")?.value.trim();
  if (plateFilter) {
    // Afficher un header résumé de la plaque
    const plateGroup = list.reduce((acc, d) => {
      const k = (d.plate || "—").toUpperCase();
      if (!acc[k]) acc[k] = [];
      acc[k].push(d);
      return acc;
    }, {});

    container.innerHTML = Object.entries(plateGroup).map(([plate, items]) => `
      <div class="denonce-plate-group">
        <div class="denonce-plate-header">
          <div class="denonce-plate-badge">
            <i class="fa-solid fa-hashtag"></i> ${escHtml(plate)}
          </div>
          <span style="font-size:.82rem;color:var(--text-light)">${items.length} dénonciation${items.length>1?"s":""}</span>
        </div>
        ${items.map(d => denonceCardHTML(d)).join("")}
      </div>`).join("");
  } else {
    container.innerHTML = `<div class="denonce-cards-grid">${list.map(d => denonceCardHTML(d)).join("")}</div>`;
  }

  // Événements
  container.querySelectorAll(".btn-icon.edit[data-denonce-id]").forEach(btn => {
    btn.addEventListener("click", () => editDenonce(btn.dataset.denonceId));
  });
  container.querySelectorAll(".btn-icon.delete[data-denonce-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette dénonciation ?")) return;
      await fsDelete("denonciations", btn.dataset.denonceId);
      showToast("Dénonciation supprimée.", "info");
    });
  });
  // Clic sur plaque pour filtrer
  container.querySelectorAll(".denonce-plate-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const plateInput = document.getElementById("filterDenoncePlate");
      if (plateInput) { plateInput.value = btn.dataset.plate; renderDenonciations(); }
    });
  });
}

/* ---- HTML d'une carte dénonciation ---- */
function denonceCardHTML(d) {
  const statusColors = {
    "Envoyée":    { bg:"#fff0e6", c:"#c05a1a", icon:"fa-paper-plane" },
    "En cours":   { bg:"#e8f0fb", c:"var(--blue)", icon:"fa-spinner" },
    "Traitée":    { bg:"#f0fff4", c:"#276749", icon:"fa-circle-check" },
    "Classée":    { bg:"#f4f6fb", c:"#6b7a94", icon:"fa-archive" },
  };
  const st = statusColors[d.status] || { bg:"#f4f6fb", c:"#6b7a94", icon:"fa-circle" };

  return `
  <div class="denonce-card">
    <div class="denonce-card-header">
      <!-- Plaque + véhicule -->
      <div class="denonce-vehicle">
        <div class="denonce-plate-btn denonce-plate-filter-btn" data-plate="${escHtml(d.plate||"")}"
             title="Filtrer par cette plaque">
          <i class="fa-solid fa-hashtag" style="font-size:.65rem;margin-right:.2rem"></i>
          ${escHtml(d.plate || "—")}
        </div>
        <div class="denonce-model">
          ${escHtml(d.color || "")}${d.color && d.model ? " · " : ""}${escHtml(d.model || "")}
        </div>
      </div>
      <!-- Actions -->
      <div style="display:flex;gap:.3rem">
        <button class="btn-icon edit"   data-denonce-id="${d.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon delete" data-denonce-id="${d.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>

    <div class="denonce-card-body">
      <!-- Raison -->
      <div class="denonce-reason">${escHtml(d.reason || "—")}</div>

      <!-- Tags -->
      <div class="denonce-meta">
        ${d.building ? `<span class="tag tag-building" style="font-size:.72rem"><i class="fa-solid fa-building"></i> ${escHtml(d.building)}</span>` : ""}
        ${d.status ? `<span class="tag" style="background:${st.bg};color:${st.c};font-size:.72rem">
          <i class="fa-solid ${st.icon}"></i> ${escHtml(d.status)}
        </span>` : ""}
        <span class="tag tag-building" style="font-size:.72rem">
          <i class="fa-regular fa-calendar"></i> ${formatDateFull(d.date)}
        </span>
      </div>

      ${d.notes ? `<div class="denonce-notes">${escHtml(d.notes)}</div>` : ""}
    </div>
  </div>`;
}

/* ---- Formulaire dénonciation ---- */
function denonceFormHTML(d = {}) {
  const today = new Date().toISOString().split("T")[0];
  return `
    <div class="form-group">
      <label>Numéro de plaque *</label>
      <input id="fPlate" type="text" placeholder="Ex : VD 123456"
             value="${escHtml(d.plate||"")}"
             style="font-size:1.05rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Modèle du véhicule</label>
        <input id="fModel" type="text" placeholder="Ex : VW Golf, BMW 320i…" value="${escHtml(d.model||"")}"/>
      </div>
      <div class="form-group">
        <label>Couleur</label>
        <input id="fColor" type="text" placeholder="Ex : Noir, Blanc, Rouge…" value="${escHtml(d.color||"")}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fDenonceBuilding">
          <option value="">— Général —</option>
          ${buildingOptions(d.building||"")}
        </select>
      </div>
      <div class="form-group">
        <label>Date & heure *</label>
        <input id="fDenonceDate" type="datetime-local"
               value="${d.date ? new Date(d.date).toISOString().slice(0,16) : new Date().toISOString().slice(0,16)}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Raison de la dénonciation *</label>
      <input id="fReason" type="text"
             placeholder="Ex : Stationnement interdit, Emplacement occupé sans autorisation…"
             value="${escHtml(d.reason||"")}"/>
    </div>
    <div class="form-group">
      <label>Statut</label>
      <select id="fDenonceStatus">
        <option value="Envoyée"  ${(!d.status||d.status==="Envoyée") ?"selected":""}>📤 Envoyée</option>
        <option value="En cours" ${d.status==="En cours"?"selected":""}>⏳ En cours</option>
        <option value="Traitée"  ${d.status==="Traitée" ?"selected":""}>✅ Traitée</option>
        <option value="Classée"  ${d.status==="Classée" ?"selected":""}>🗂 Classée</option>
      </select>
    </div>
    <div class="form-group">
      <label>Notes supplémentaires</label>
      <textarea id="fDenonceNotes" placeholder="Détails, emplacement exact, photos…">${escHtml(d.notes||"")}</textarea>
    </div>`;
}

/* ---- Bouton ajouter ---- */
document.getElementById("btnAddDenonce").addEventListener("click", () => {
  openModal("Nouvelle dénonciation", denonceFormHTML(), async () => {
    const plate  = mval("fPlate");
    const reason = mval("fReason");
    if (!plate)  { showToast("Le numéro de plaque est obligatoire.", "error"); return; }
    if (!reason) { showToast("La raison est obligatoire.", "error"); return; }
    const dateVal = mval("fDenonceDate");
    await fsAdd("denonciations", {
      id: uid(),
      plate:    plate.toUpperCase(),
      model:    mval("fModel"),
      color:    mval("fColor"),
      building: mval("fDenonceBuilding"),
      date:     dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
      reason,
      status:   mval("fDenonceStatus"),
      notes:    mval("fDenonceNotes"),
      createdAt: new Date().toISOString(),
    });
    closeModal();
    showToast("Dénonciation enregistrée !", "success");
  });
});

/* ---- Modifier ---- */
async function editDenonce(id) {
  const d = denonciations.find(d => d.id === id);
  if (!d) return;
  openModal("Modifier la dénonciation", denonceFormHTML(d), async () => {
    const plate  = mval("fPlate");
    const reason = mval("fReason");
    if (!plate)  { showToast("Le numéro de plaque est obligatoire.", "error"); return; }
    if (!reason) { showToast("La raison est obligatoire.", "error"); return; }
    const dateVal = mval("fDenonceDate");
    await fsUpdate("denonciations", id, {
      ...d,
      plate:    plate.toUpperCase(),
      model:    mval("fModel"),
      color:    mval("fColor"),
      building: mval("fDenonceBuilding"),
      date:     dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
      reason,
      status:   mval("fDenonceStatus"),
      notes:    mval("fDenonceNotes"),
    });
    closeModal();
    showToast("Dénonciation mise à jour.", "success");
  });
}

/* ---- Filtres ---- */
["filterDenonceBuilding","filterDenoncePlate","filterDenonceSearch"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", renderDenonciations);
});

/* ---- Init building select ---- */
function refreshDenonceFilters() {
  const sel = document.getElementById("filterDenonceBuilding");
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML = '<option value="">Tous les immeubles</option>';
  BUILDINGS.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b; opt.textContent = b;
    if (b === v) opt.selected = true;
    sel.appendChild(opt);
  });
}

TAB_TITLES["timbre"] = "Timbrage";

/* ---- Injection garantie de l'onglet Timbrage si absent du HTML ---- */
(function ensureTimbreTab() {
  // Si l'onglet n'existe pas (vieux index.html en cache), on l'injecte dynamiquement
  if (!document.getElementById("tab-timbre")) {
    // Ajouter dans la sidebar
    const nav = document.querySelector(".sidebar-nav");
    if (nav) {
      const li = document.createElement("a");
      li.href = "#";
      li.className = "nav-item";
      li.dataset.tab = "timbre";
      li.innerHTML = `<i class="fa-solid fa-clock"></i><span>Timbrage</span>`;
      nav.insertBefore(li, nav.querySelector('[data-tab="denonce"]') || nav.lastElementChild);
    }

    // Ajouter la section tab
    const mainWrapper = document.querySelector(".main-wrapper");
    if (mainWrapper) {
      const sec = document.createElement("section");
      sec.className = "tab-content";
      sec.id = "tab-timbre";
      sec.innerHTML = `
      <div class="timbre-top">
        <div>
          <h1 class="page-title">Timbrage</h1>
          <p class="subtitle">Suivi des heures de travail</p>
        </div>
        <div class="month-nav">
          <button class="month-nav-btn" id="timbrePrev"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="month-display" id="timbreMonthDisplay">—</div>
          <button class="month-nav-btn" id="timbreNext"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="month-nav-btn month-today" id="timbreToday"><i class="fa-solid fa-calendar-day"></i></button>
        </div>
      </div>
      <div class="timbre-kpi-row">
        <div class="timbre-kpi timbre-kpi-blue">
          <div class="timbre-kpi-icon"><i class="fa-solid fa-business-time"></i></div>
          <div><div class="timbre-kpi-value" id="timbreTotal">0h 00m</div><div class="timbre-kpi-label">Heures ce mois</div></div>
        </div>
        <div class="timbre-kpi timbre-kpi-orange">
          <div class="timbre-kpi-icon"><i class="fa-solid fa-calendar-day"></i></div>
          <div><div class="timbre-kpi-value" id="timbreJours">0 jour</div><div class="timbre-kpi-label">Jours travaillés</div></div>
        </div>
        <div class="timbre-kpi timbre-kpi-green">
          <div class="timbre-kpi-icon"><i class="fa-solid fa-clock"></i></div>
          <div><div class="timbre-kpi-value" id="timbreMoyenne">—</div><div class="timbre-kpi-label">Moyenne / jour</div></div>
        </div>
        <div class="timbre-kpi timbre-kpi-navy" id="timbreEnCours" style="display:none">
          <div class="timbre-kpi-icon"><i class="fa-solid fa-play" style="color:#4ade80"></i></div>
          <div><div class="timbre-kpi-value" id="timbreElapsed" style="color:#4ade80">00:00</div><div class="timbre-kpi-label">En cours</div></div>
        </div>
      </div>
      <div class="timbre-actions">
        <button class="timbre-btn timbre-btn-start" id="btnTimbreDebut">
          <div class="timbre-btn-icon"><i class="fa-solid fa-play"></i></div>
          <div><div class="timbre-btn-label">Début</div><div class="timbre-btn-sub">Démarrer la journée</div></div>
        </button>
        <div class="timbre-status-card" id="timbreStatusCard">
          <div class="timbre-status-dot" id="timbreStatusDot"></div>
          <div class="timbre-status-text" id="timbreStatusText">Pas de session en cours</div>
        </div>
        <button class="timbre-btn timbre-btn-end" id="btnTimbreFin">
          <div class="timbre-btn-icon"><i class="fa-solid fa-stop"></i></div>
          <div><div class="timbre-btn-label">Fin</div><div class="timbre-btn-sub">Terminer la journée</div></div>
        </button>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
        <button class="btn btn-secondary" id="btnExportTimbrePDF">
          <i class="fa-solid fa-file-pdf" style="color:#dc2626"></i> Exporter le mois en PDF
        </button>
      </div>
      <div class="card">
        <div class="card-header">
          <i class="fa-solid fa-table-list"></i>
          <h2>Détail du mois</h2>
          <span class="count-badge" id="timbreCount" style="background:var(--blue)">0</span>
        </div>
        <div id="timbreHistorique">
          <p class="empty-msg"><i class="fa-solid fa-clock"></i>Aucune entrée ce mois</p>
        </div>
      </div>`;

      // Insérer avant le modal
      const modal = document.getElementById("modalOverlay");
      if (modal) mainWrapper.insertBefore(sec, modal);
      else mainWrapper.appendChild(sec);
    }

    // Re-attacher les event listeners maintenant que les éléments existent
    document.getElementById("timbrePrev")?.addEventListener("click", () => changeTimbreMonth(-1));
    document.getElementById("timbreNext")?.addEventListener("click", () => changeTimbreMonth(+1));
    document.getElementById("timbreToday")?.addEventListener("click", () => { initTimbreMonth(); renderTimbrage(); });
    document.getElementById("btnTimbreDebut")?.addEventListener("click", async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
      if (getActiveSession()) { showToast("Une session est déjà en cours !", "error"); return; }
      await fsAdd("timbrages", { id:uid(), dateDebut:now.toISOString(), dateFin:null, dureeMin:0, month, notes:"" });
      showToast(`Début enregistré à ${now.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})} ✓`, "success");
      initTimbreMonth(); renderTimbrage();
    });
    document.getElementById("btnTimbreFin")?.addEventListener("click", async () => {
      const active = getActiveSession();
      if (!active) { showToast("Aucune session en cours.", "error"); return; }
      const now = new Date();
      const dureeMin = Math.round((now - new Date(active.dateDebut)) / 60000);
      openModal("Fin de journée", `
        <div style="text-align:center;margin-bottom:1.25rem">
          <div style="font-size:2rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--navy)">${minutesToHM(dureeMin)}</div>
          <div style="color:var(--text-light);font-size:.85rem;margin-top:.3rem">
            ${new Date(active.dateDebut).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
            → ${now.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
        <div class="form-group">
          <label>Notes (optionnel)</label>
          <input id="fTimbreNotes" type="text" placeholder="Ex : Tonte, nettoyage hall…"/>
        </div>`, async () => {
        await fsUpdate("timbrages", active.id, { ...active, dateFin:now.toISOString(), dureeMin, notes:mval("fTimbreNotes") });
        closeModal();
        showToast(`Fin — ${minutesToHM(dureeMin)} ✓`, "success");
      });
    });
    document.getElementById("btnExportTimbrePDF")?.addEventListener("click", async () => {
      showToast("Génération PDF…", "info");
    });

    // Re-attacher les nav items injectés
    document.querySelectorAll(".nav-item[data-tab]").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const tabId = link.dataset.tab;
        if(tabId) switchTab(tabId);
        closeMobileSidebar();
      });
    });
  }
})();

let timbrages      = [];
let unsubTimbre    = null;
let timbreMonth    = "";       // "YYYY-MM" du mois affiché
let timbreInterval = null;    // intervalle pour le chrono en cours

/* ---- Init mois timbrage ---- */
function initTimbreMonth() {
  const now = new Date();
  timbreMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
}

/* ---- Listener Firestore ---- */
function startTimbreListener() {
  if (unsubTimbre) unsubTimbre();
  unsubTimbre = col("timbrages").onSnapshot(snap => {
    timbrages = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => new Date(b.dateDebut) - new Date(a.dateDebut));
    if (document.getElementById("tab-timbre").classList.contains("active")) {
      renderTimbrage();
    }
  }, err => { if(err.code==="permission-denied") showFirestorePermissionWarning(); });
}

/* ---- Navigation mois ---- */
function changeTimbreMonth(delta) {
  const [y,m] = timbreMonth.split("-").map(Number);
  const d = new Date(y, m-1+delta, 1);
  timbreMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  renderTimbrage();
}
document.getElementById("timbrePrev")?.addEventListener("click", () => changeTimbreMonth(-1));
document.getElementById("timbreNext")?.addEventListener("click", () => changeTimbreMonth(+1));
document.getElementById("timbreToday")?.addEventListener("click", () => { initTimbreMonth(); renderTimbrage(); });

/* ---- Utilitaires durée ---- */
function minutesToHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2,"0")}m`;
}
function elapsedSince(isoStart) {
  const diff = Math.floor((Date.now() - new Date(isoStart)) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ---- Session en cours (pas encore terminée) ---- */
function getActiveSession() {
  return timbrages.find(t => t.dateDebut && !t.dateFin);
}

/* ---- Rendu principal ---- */
function renderTimbrage() {
  document.getElementById("timbreMonthDisplay").textContent = formatMonthDisplay(timbreMonth);

  // Filtrer les entrées du mois affiché (terminées seulement pour les stats)
  const monthEntries = timbrages.filter(t => {
    const m = t.month || (t.dateDebut ? t.dateDebut.slice(0,7) : "");
    return m === timbreMonth;
  });
  const completed = monthEntries.filter(t => t.dateFin);

  // KPIs
  const totalMin = completed.reduce((s,t) => s + (t.dureeMin || 0), 0);
  const jours    = new Set(completed.map(t => t.dateDebut?.slice(0,10))).size;
  const moy      = jours ? minutesToHM(totalMin / jours) : "—";

  document.getElementById("timbreTotal").textContent   = minutesToHM(totalMin);
  document.getElementById("timbreJours").textContent   = jours + (jours <= 1 ? " jour" : " jours");
  document.getElementById("timbreMoyenne").textContent = moy;
  document.getElementById("timbreCount").textContent   = completed.length;

  // Session active
  const active = getActiveSession();
  const enCoursCard = document.getElementById("timbreEnCours");
  const statusDot   = document.getElementById("timbreStatusDot");
  const statusText  = document.getElementById("timbreStatusText");
  const btnDebut    = document.getElementById("btnTimbreDebut");
  const btnFin      = document.getElementById("btnTimbreFin");

  if (active) {
    enCoursCard.style.display = "flex";
    statusDot.className = "timbre-status-dot active";
    statusText.textContent = `En cours depuis ${new Date(active.dateDebut).toLocaleTimeString("fr-CH", {hour:"2-digit",minute:"2-digit"})}`;
    btnDebut.disabled = true;
    btnDebut.style.opacity = ".4";
    btnFin.disabled = false;
    btnFin.style.opacity = "1";

    // Chrono live
    clearInterval(timbreInterval);
    timbreInterval = setInterval(() => {
      const el = document.getElementById("timbreElapsed");
      if (el) el.textContent = elapsedSince(active.dateDebut);
    }, 1000);
    document.getElementById("timbreElapsed").textContent = elapsedSince(active.dateDebut);
  } else {
    enCoursCard.style.display = "none";
    statusDot.className = "timbre-status-dot";
    statusText.textContent = "Aucune session en cours";
    btnDebut.disabled = false;
    btnDebut.style.opacity = "1";
    btnFin.disabled = true;
    btnFin.style.opacity = ".4";
    clearInterval(timbreInterval);
  }

  // Tableau détaillé — groupé par jour
  const histo = document.getElementById("timbreHistorique");
  if (!completed.length) {
    histo.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-clock"></i>Aucune entrée ce mois</p>`;
    return;
  }

  // Grouper par date (YYYY-MM-DD)
  const byDay = {};
  completed.forEach(t => {
    const day = t.dateDebut.slice(0,10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  });

  histo.innerHTML = `
    <table class="compta-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Début</th>
          <th>Fin</th>
          <th style="text-align:right">Durée</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(byDay).sort((a,b) => b[0].localeCompare(a[0])).map(([day, entries]) => {
          const dayTotal = entries.reduce((s,t) => s + (t.dureeMin||0), 0);
          const dateLabel = new Date(day + "T12:00:00").toLocaleDateString("fr-CH", {
            weekday:"long", day:"2-digit", month:"long"
          });
          const dayRows = entries.map(t => `
            <tr>
              <td class="td-date"></td>
              <td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--navy)">
                ${new Date(t.dateDebut).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
              </td>
              <td style="font-family:'DM Mono',monospace;color:var(--text-light)">
                ${t.dateFin ? new Date(t.dateFin).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"}) : "—"}
              </td>
              <td style="text-align:right">
                <span style="font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">
                  ${minutesToHM(t.dureeMin||0)}
                </span>
              </td>
              <td class="td-desc">${escHtml(t.notes||"")}</td>
              <td>
                <div style="display:flex;gap:.25rem">
                  <button class="btn-icon edit" data-timbre-edit="${t.id}" title="Modifier les notes">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="btn-icon delete" data-timbre-del="${t.id}" title="Supprimer">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`).join("");

          return `
            <tr class="timbre-day-header">
              <td colspan="3" style="font-weight:700;color:var(--navy);text-transform:capitalize">
                ${dateLabel}
              </td>
              <td style="text-align:right">
                <span class="timbre-day-total">${minutesToHM(dayTotal)}</span>
              </td>
              <td colspan="2"></td>
            </tr>
            ${dayRows}`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="background:var(--navy)">
          <td colspan="3" style="padding:.75rem 1.1rem;font-weight:700;color:#fff">
            TOTAL DU MOIS
          </td>
          <td style="text-align:right;padding:.75rem 1.1rem;font-family:'DM Mono',monospace;font-weight:700;color:#7dd3fc;font-size:1rem">
            ${minutesToHM(totalMin)}
          </td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`;

  // Événements
  histo.querySelectorAll("[data-timbre-edit]").forEach(btn => {
    btn.addEventListener("click", () => editTimbreNotes(btn.dataset.timbreEdit));
  });
  histo.querySelectorAll("[data-timbre-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette entrée de timbrage ?")) return;
      await fsDelete("timbrages", btn.dataset.timbreDel);
      showToast("Entrée supprimée.", "info");
    });
  });
}

/* ---- Bouton DÉBUT ---- */
document.getElementById("btnTimbreDebut")?.addEventListener("click", async () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  // Vérifier qu'il n'y a pas déjà une session active
  if (getActiveSession()) {
    showToast("Une session est déjà en cours !", "error");
    return;
  }

  const entry = {
    id: uid(),
    dateDebut: now.toISOString(),
    dateFin:   null,
    dureeMin:  0,
    month,
    notes:     "",
  };

  await fsAdd("timbrages", entry);
  showToast(`Début enregistré à ${now.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})} ✓`, "success");

  // Basculer sur le mois courant
  initTimbreMonth();
  renderTimbrage();
});

/* ---- Bouton FIN ---- */
document.getElementById("btnTimbreFin")?.addEventListener("click", async () => {
  const active = getActiveSession();
  if (!active) { showToast("Aucune session en cours.", "error"); return; }

  const now    = new Date();
  const start  = new Date(active.dateDebut);
  const dureeMin = Math.round((now - start) / 60000);

  openModal("Fin de journée", `
    <div style="text-align:center;margin-bottom:1.25rem">
      <div style="font-size:2rem;font-weight:700;font-family:'DM Mono',monospace;color:var(--navy)">
        ${minutesToHM(dureeMin)}
      </div>
      <div style="color:var(--text-light);font-size:.85rem;margin-top:.3rem">
        ${start.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
        → ${now.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
      </div>
    </div>
    <div class="form-group">
      <label>Notes (optionnel)</label>
      <input id="fTimbreNotes" type="text" placeholder="Ex : Tonte, nettoyage hall, livraison…"/>
    </div>`, async () => {
    await fsUpdate("timbrages", active.id, {
      ...active,
      dateFin:  now.toISOString(),
      dureeMin,
      notes:    mval("fTimbreNotes"),
    });
    closeModal();
    showToast(`Fin enregistrée — ${minutesToHM(dureeMin)} de travail ✓`, "success");
  });
});

/* ---- Modifier les notes d'une entrée ---- */
function editTimbreNotes(id) {
  const t = timbrages.find(t => t.id === id);
  if (!t) return;
  openModal("Modifier les notes", `
    <div class="form-group">
      <label>Notes</label>
      <input id="fTimbreNotes" type="text" value="${escHtml(t.notes||"")}"
             placeholder="Description du travail effectué…"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Heure de début</label>
        <input id="fTimbreStart" type="time"
               value="${new Date(t.dateDebut).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}"/>
      </div>
      <div class="form-group">
        <label>Heure de fin</label>
        <input id="fTimbreEnd" type="time"
               value="${t.dateFin ? new Date(t.dateFin).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"}) : ""}"/>
      </div>
    </div>`, async () => {

    // Recalculer avec les heures modifiées
    const startStr = mval("fTimbreStart");
    const endStr   = mval("fTimbreEnd");
    const baseDate = t.dateDebut.slice(0,10);

    let newStart = t.dateDebut, newFin = t.dateFin, newDuree = t.dureeMin;
    if (startStr) {
      newStart = new Date(`${baseDate}T${startStr}:00`).toISOString();
    }
    if (endStr) {
      newFin   = new Date(`${baseDate}T${endStr}:00`).toISOString();
      newDuree = Math.round((new Date(newFin) - new Date(newStart)) / 60000);
    }

    await fsUpdate("timbrages", id, {
      ...t,
      notes:     mval("fTimbreNotes"),
      dateDebut: newStart,
      dateFin:   newFin,
      dureeMin:  newDuree > 0 ? newDuree : t.dureeMin,
    });
    closeModal();
    showToast("Entrée mise à jour.", "success");
  });
}

/* ---- Export PDF mensuel timbrage ---- */
document.getElementById("btnExportTimbrePDF")?.addEventListener("click", async () => {
  if (typeof window.jspdf === "undefined") { showToast("PDF en cours de chargement, réessaie.", "info"); return; }

  const monthEntries = timbrages.filter(t => (t.month || t.dateDebut?.slice(0,7)) === timbreMonth && t.dateFin);
  if (!monthEntries.length) { showToast("Aucune entrée à exporter.", "info"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const NAVY=[26,38,64], BLUE=[30,92,191], ORANGE=[232,106,26], LGRAY=[240,243,251];
  const PAGE_W=210, M=15, TODAY=new Date().toLocaleDateString("fr-CH");
  const MONTH_LABEL = formatMonthDisplay(timbreMonth);

  // Header
  doc.setFillColor(...NAVY); doc.rect(0,0,PAGE_W,32,"F");
  doc.setFillColor(...ORANGE); doc.rect(0,32,PAGE_W,2.5,"F");

  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(255,255,255);
  doc.text("ImmoGest — Feuille de timbrage", M, 14);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(160,180,220);
  doc.text(MONTH_LABEL, M, 23);
  doc.text(`Généré le ${TODAY}`, PAGE_W-M, 23, {align:"right"});

  // Résumé
  const totalMin = monthEntries.reduce((s,t) => s + (t.dureeMin||0), 0);
  const jours    = new Set(monthEntries.map(t => t.dateDebut.slice(0,10))).size;
  let y = 42;

  const pills = [
    {l:"Total heures",       v:minutesToHM(totalMin), c:BLUE},
    {l:"Jours travaillés",   v:`${jours} jour${jours>1?"s":""}`, c:ORANGE},
    {l:"Moyenne / jour",     v:jours ? minutesToHM(totalMin/jours) : "—", c:[40,120,80]},
  ];
  pills.forEach((p,i) => {
    const x = M + i * ((PAGE_W-2*M)/3);
    doc.setFillColor(...LGRAY); doc.roundedRect(x,y,56,18,2,2,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(100,116,148);
    doc.text(p.l, x+4, y+6.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...p.c);
    doc.text(p.v, x+4, y+15);
  });
  y += 26;

  // Tableau
  const rows = [];
  const byDay = {};
  monthEntries.forEach(t => {
    const day = t.dateDebut.slice(0,10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  });

  Object.entries(byDay).sort((a,b) => a[0].localeCompare(b[0])).forEach(([day, entries]) => {
    const dl = new Date(day+"T12:00:00").toLocaleDateString("fr-CH",{weekday:"long",day:"2-digit",month:"long"});
    const dayTotal = entries.reduce((s,t) => s+(t.dureeMin||0), 0);
    entries.forEach((t,i) => {
      rows.push([
        i === 0 ? dl.charAt(0).toUpperCase()+dl.slice(1) : "",
        new Date(t.dateDebut).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"}),
        t.dateFin ? new Date(t.dateFin).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"}) : "—",
        minutesToHM(t.dureeMin||0),
        t.notes || "",
      ]);
    });
    // Ligne total du jour
    if (entries.length > 1) {
      rows.push(["","","Sous-total",minutesToHM(dayTotal),"—"]);
    }
  });

  doc.autoTable({
    startY: y, margin:{left:M,right:M},
    head:[["Date","Début","Fin","Durée","Notes"]],
    body: rows,
    styles:{font:"helvetica",fontSize:9,cellPadding:3.5,textColor:[...NAVY]},
    headStyles:{fillColor:[...BLUE],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5},
    alternateRowStyles:{fillColor:[...LGRAY]},
    columnStyles:{
      0:{cellWidth:55,fontStyle:"bold"},
      1:{cellWidth:20,halign:"center"},
      2:{cellWidth:20,halign:"center"},
      3:{cellWidth:25,halign:"center",fontStyle:"bold",textColor:[...BLUE]},
      4:{cellWidth:"auto"},
    },
    foot:[["","","TOTAL",minutesToHM(totalMin),""]],
    footStyles:{fillColor:[...NAVY],textColor:[255,255,255],fontStyle:"bold",fontSize:9.5},
    // Ligne de séparation pour les sous-totaux
    didParseCell(data) {
      if (data.row.raw && data.row.raw[2] === "Sous-total") {
        data.cell.styles.fillColor = [220,230,245];
        data.cell.styles.textColor = [...BLUE];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Signature
  const lastY = doc.lastAutoTable.finalY + 15;
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.4);
  doc.line(M, lastY+15, M+65, lastY+15);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,116,148);
  doc.text("Signature du concierge", M, lastY+20);
  doc.line(PAGE_W-M-65, lastY+15, PAGE_W-M, lastY+15);
  doc.text("Visa de la direction", PAGE_W-M-65, lastY+20);

  // Footer
  const ph = doc.internal.pageSize.height;
  doc.setFillColor(...NAVY); doc.rect(0,ph-10,PAGE_W,10,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(140,160,200);
  doc.text(`ImmoGest • Timbrage ${MONTH_LABEL} • Généré le ${TODAY}`, PAGE_W/2, ph-4, {align:"center"});

  doc.save(`Timbrage_${MONTH_LABEL.replace(/ /g,"_")}.pdf`);
  showToast(`PDF "${MONTH_LABEL}" téléchargé !`, "success");
});

})();
