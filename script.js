/* ============================================================
   IMMOGEST — script.js
   Authentification + Administration + Gestion complète
   ============================================================ */
"use strict";

/* ============================================================
   1. CLÉS LOCALSTORAGE
   ============================================================ */
const KEYS = {
  tasks:     "ig_tasks",
  orders:    "ig_orders",
  spaces:    "ig_spaces",
  apts:      "ig_apts",
  buildings: "ig_buildings",
  password:  "ig_password",
  session:   "ig_session"
};

/* ============================================================
   2. MOT DE PASSE (hash simple côté client)
   Mot de passe par défaut : immogest
   ============================================================ */
const DEFAULT_PASSWORD = "immogest";

/** Hache une chaîne (FNV-1a 32-bit, suffisant pour un outil local) */
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

function getStoredHash() {
  return localStorage.getItem(KEYS.password) || hashString(DEFAULT_PASSWORD);
}
function setStoredHash(newPw) {
  localStorage.setItem(KEYS.password, hashString(newPw));
}
function checkPassword(input) {
  return hashString(input) === getStoredHash();
}

/* ============================================================
   3. SESSION (sessionStorage = expire à la fermeture du navigateur)
   ============================================================ */
function isLoggedIn()  { return sessionStorage.getItem(KEYS.session) === "1"; }
function setSession()  { sessionStorage.setItem(KEYS.session, "1"); }
function clearSession(){ sessionStorage.removeItem(KEYS.session); }

/* ============================================================
   4. IMMEUBLES (noms personnalisables)
   ============================================================ */
const DEFAULT_BUILDINGS = [
  "Immeuble A","Immeuble B","Immeuble C",
  "Immeuble D","Immeuble E","Immeuble F",
  "Immeuble G","Immeuble H","Immeuble I"
];

function loadBuildings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEYS.buildings));
    if (Array.isArray(stored) && stored.length === 9) return stored;
  } catch {}
  return [...DEFAULT_BUILDINGS];
}
function saveBuildings(arr) {
  localStorage.setItem(KEYS.buildings, JSON.stringify(arr));
}

/** Liste active des noms d'immeubles */
let BUILDINGS = loadBuildings();

/* ============================================================
   5. DONNÉES
   ============================================================ */
function load(k) { try{ return JSON.parse(localStorage.getItem(k))||[]; }catch{ return []; } }
function save(k,d){ localStorage.setItem(k,JSON.stringify(d)); }
function uid()    { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

let tasks  = load(KEYS.tasks);
let orders = load(KEYS.orders);
let spaces = load(KEYS.spaces);
let apts   = load(KEYS.apts);

/* ============================================================
   6. LABELS
   ============================================================ */
const STATUS_TASK_LABELS  = { todo:"À faire", inprogress:"En cours", done:"Terminé" };
const PRIORITY_LABELS     = { high:"Haute", medium:"Moyenne", low:"Basse" };
const STATUS_ORDER_LABELS = { ordered:"Commandé", pending:"En attente", received:"Reçu" };
const TYPE_SPACE_LABELS   = { indoor:"Intérieur", outdoor:"Extérieur" };

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
   9. PAGE DE CONNEXION
   ============================================================ */
const loginScreen = document.getElementById("loginScreen");
const loginForm   = document.getElementById("loginForm");
const loginPwInput= document.getElementById("loginPassword");
const loginError  = document.getElementById("loginError");
const loginErrMsg = document.getElementById("loginErrorMsg");

/** Affiche ou cache l'écran de connexion */
function showLogin()  { loginScreen.classList.remove("hidden"); loginPwInput.value=""; loginError.classList.add("hidden"); setTimeout(()=>loginPwInput.focus(),100); }
function hideLogin()  { loginScreen.classList.add("hidden"); }

/** Tentative de connexion */
loginForm.addEventListener("submit", e => {
  e.preventDefault();
  const val = loginPwInput.value;
  if (!val) return;

  if (checkPassword(val)) {
    setSession();
    hideLogin();
    initApp();
  } else {
    loginError.classList.remove("hidden");
    loginErrMsg.textContent = "Mot de passe incorrect. Réessayez.";
    loginPwInput.value = "";
    loginPwInput.focus();
  }
});

/** Toggle visibilité mot de passe */
document.getElementById("loginTogglePw").addEventListener("click", () => {
  const inp = document.getElementById("loginPassword");
  const ico = document.getElementById("loginEyeIcon");
  if (inp.type === "password") { inp.type="text"; ico.className="fa-solid fa-eye-slash"; }
  else                         { inp.type="password"; ico.className="fa-solid fa-eye"; }
});

/** Déconnexion */
document.getElementById("navLogout").addEventListener("click", e => {
  e.preventDefault();
  if (!confirm("Se déconnecter de ImmoGest ?")) return;
  clearSession();
  closeMobileSidebar();
  showLogin();
});

/* ============================================================
   10. ADMINISTRATION
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
  // Vider les champs de MDP
  ["adminPwCurrent","adminPwNew","adminPwConfirm"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value="";
  });
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
document.getElementById("btnSaveBuildings").addEventListener("click", () => {
  const inputs = document.querySelectorAll(".building-rename-input");
  const newNames = [];
  let hasEmpty = false;

  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (!val) hasEmpty = true;
    newNames.push(val || BUILDINGS[inp.dataset.index]);
  });

  if (hasEmpty) { showToast("Chaque immeuble doit avoir un nom.", "error"); return; }

  BUILDINGS = newNames;
  saveBuildings(BUILDINGS);

  // Mettre à jour les filtres
  refreshBuildingSelects();
  // Mettre à jour l'affichage
  renderDashboard();

  showToast("Noms des immeubles enregistrés !", "success");
  closeAdmin();
});

/** Réinitialiser les noms */
document.getElementById("btnResetBuildings").addEventListener("click", () => {
  if (!confirm("Remettre les noms par défaut (Immeuble A … I) ?")) return;
  BUILDINGS = [...DEFAULT_BUILDINGS];
  saveBuildings(BUILDINGS);
  renderBuildingsRenameGrid();
  refreshBuildingSelects();
  renderDashboard();
  showToast("Noms réinitialisés.", "info");
});

/** Changement de mot de passe */
document.getElementById("btnChangePassword").addEventListener("click", () => {
  const cur     = document.getElementById("adminPwCurrent").value;
  const newPw   = document.getElementById("adminPwNew").value;
  const confirm = document.getElementById("adminPwConfirm").value;

  if (!checkPassword(cur)) { showToast("Mot de passe actuel incorrect.", "error"); return; }
  if (newPw.length < 6)    { showToast("Le nouveau mot de passe doit faire au moins 6 caractères.", "error"); return; }
  if (newPw !== confirm)   { showToast("Les mots de passe ne correspondent pas.", "error"); return; }

  setStoredHash(newPw);
  ["adminPwCurrent","adminPwNew","adminPwConfirm"].forEach(id=>{ document.getElementById(id).value=""; });
  showToast("Mot de passe changé avec succès !", "success");
});

/** Toggle visibilité dans le panneau admin */
document.querySelectorAll(".admin-pw-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const inp = document.getElementById(btn.dataset.target);
    const ico = btn.querySelector("i");
    if (inp.type === "password") { inp.type="text"; ico.className="fa-solid fa-eye-slash"; }
    else                         { inp.type="password"; ico.className="fa-solid fa-eye"; }
  });
});

/** Réinitialiser toutes les données */
document.getElementById("btnResetAllData").addEventListener("click", () => {
  if (!confirm("⚠️ Attention ! Cette action supprimera DÉFINITIVEMENT toutes les tâches, commandes, places et appartements.\n\nÊtes-vous sûr ?")) return;
  if (!confirm("Dernière confirmation : supprimer toutes les données ?")) return;

  tasks  = []; orders = []; spaces = []; apts = [];
  save(KEYS.tasks,tasks); save(KEYS.orders,orders);
  save(KEYS.spaces,spaces); save(KEYS.apts,apts);

  closeAdmin();
  renderDashboard();
  renderTasks();
  renderOrders();
  renderSpaces();
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
modalSaveBtn.addEventListener("click",()=>{ if(modalSaveCallback) modalSaveCallback(); });
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

  c.querySelectorAll(".task-status-btn").forEach(b=>b.addEventListener("click",()=>toggleTaskStatus(b.dataset.id)));
  c.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editTask(b.dataset.id)));
  c.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteTask(b.dataset.id)));
  document.getElementById("badgeTasks").textContent=tasks.filter(t=>t.status!=="done").length;
}

function toggleTaskStatus(id){
  const t=tasks.find(t=>t.id===id); if(!t)return;
  const c={todo:"inprogress",inprogress:"done",done:"todo"};
  t.status=c[t.status];
  save(KEYS.tasks,tasks); renderTasks(); renderDashboard();
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

document.getElementById("btnAddTask").addEventListener("click",()=>{
  openModal("Nouvelle tâche",taskFormHTML(),()=>{
    const title=mval("fTitle");
    if(!title){showToast("Le titre est obligatoire.","error");return;}
    tasks.push({id:uid(),title,building:mval("fBuilding"),priority:mval("fPriority"),status:mval("fStatus"),description:mval("fDesc")});
    save(KEYS.tasks,tasks); closeModal(); renderTasks(); renderDashboard();
    showToast("Tâche ajoutée !","success");
  });
});
function editTask(id){
  const t=tasks.find(t=>t.id===id); if(!t)return;
  openModal("Modifier la tâche",taskFormHTML(t),()=>{
    const title=mval("fTitle");
    if(!title){showToast("Le titre est obligatoire.","error");return;}
    Object.assign(t,{title,building:mval("fBuilding"),priority:mval("fPriority"),status:mval("fStatus"),description:mval("fDesc")});
    save(KEYS.tasks,tasks); closeModal(); renderTasks(); renderDashboard();
    showToast("Tâche mise à jour.","success");
  });
}
function deleteTask(id){
  if(!confirm("Supprimer cette tâche ?"))return;
  tasks=tasks.filter(t=>t.id!==id); save(KEYS.tasks,tasks); renderTasks(); renderDashboard();
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

function renderOrders(){
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
          <button class="btn-icon edit"   data-id="${o.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${o.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
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
  c.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();editOrder(b.dataset.id);}));
  c.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();deleteOrder(b.dataset.id);}));
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

document.getElementById("btnAddOrder").addEventListener("click",()=>{
  openModal("Nouvelle commande",orderFormHTML(),()=>{
    const supplier=mval("fSupplier");
    if(!supplier){showToast("Le fournisseur est obligatoire.","error");return;}
    const items=readProductLines();
    if(!items.length){showToast("Ajoutez au moins un produit.","error");return;}
    orders.push({id:uid(),supplier,date:mval("fDate"),status:mval("fOStatus"),building:mval("fOBuilding"),notes:mval("fNotes"),items});
    save(KEYS.orders,orders); closeModal(); renderOrders(); renderDashboard();
    showToast("Commande ajoutée !","success");
  });
  setTimeout(bindOrderForm,0);
});
function editOrder(id){
  const o=orders.find(o=>o.id===id); if(!o)return;
  openModal("Modifier la commande",orderFormHTML(o),()=>{
    const supplier=mval("fSupplier");
    if(!supplier){showToast("Le fournisseur est obligatoire.","error");return;}
    const items=readProductLines();
    if(!items.length){showToast("Ajoutez au moins un produit.","error");return;}
    Object.assign(o,{supplier,date:mval("fDate"),status:mval("fOStatus"),building:mval("fOBuilding"),notes:mval("fNotes"),items});
    save(KEYS.orders,orders); closeModal(); renderOrders(); renderDashboard();
    showToast("Commande mise à jour.","success");
  });
  setTimeout(bindOrderForm,0);
}
function deleteOrder(id){
  if(!confirm("Supprimer cette commande ?"))return;
  orders=orders.filter(o=>o.id!==id); save(KEYS.orders,orders); renderOrders(); renderDashboard();
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
    sl.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editSpace(b.dataset.id)));
    sl.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteSpace(b.dataset.id)));
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
    al.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editApt(b.dataset.id)));
    al.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteApt(b.dataset.id)));
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
document.getElementById("btnAddSpace").addEventListener("click",()=>{
  openModal("Nouvelle place de parking",spaceFormHTML(),()=>{
    const name=mval("fSName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    spaces.push({id:uid(),name,building:mval("fSBuilding"),type:mval("fSType"),notes:mval("fSNotes")});
    save(KEYS.spaces,spaces); closeModal(); renderSpaces(); renderDashboard();
    showToast("Place ajoutée !","success");
  });
});
function editSpace(id){
  const s=spaces.find(s=>s.id===id); if(!s)return;
  openModal("Modifier la place",spaceFormHTML(s),()=>{
    const name=mval("fSName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    Object.assign(s,{name,building:mval("fSBuilding"),type:mval("fSType"),notes:mval("fSNotes")});
    save(KEYS.spaces,spaces); closeModal(); renderSpaces(); renderDashboard();
    showToast("Place mise à jour.","success");
  });
}
function deleteSpace(id){
  if(!confirm("Supprimer cette place ?"))return;
  spaces=spaces.filter(s=>s.id!==id); save(KEYS.spaces,spaces); renderSpaces(); renderDashboard();
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
document.getElementById("btnAddApt").addEventListener("click",()=>{
  openModal("Nouvel appartement libre",aptFormHTML(),()=>{
    const name=mval("fAName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    apts.push({id:uid(),name,building:mval("fABuilding"),floor:mval("fAFloor"),rooms:mval("fARooms"),notes:mval("fANotes")});
    save(KEYS.apts,apts); closeModal(); renderSpaces(); renderDashboard();
    showToast("Appartement ajouté !","success");
  });
});
function editApt(id){
  const a=apts.find(a=>a.id===id); if(!a)return;
  openModal("Modifier l'appartement",aptFormHTML(a),()=>{
    const name=mval("fAName"); if(!name){showToast("Le nom est obligatoire.","error");return;}
    Object.assign(a,{name,building:mval("fABuilding"),floor:mval("fAFloor"),rooms:mval("fARooms"),notes:mval("fANotes")});
    save(KEYS.apts,apts); closeModal(); renderSpaces(); renderDashboard();
    showToast("Appartement mis à jour.","success");
  });
}
function deleteApt(id){
  if(!confirm("Supprimer cet appartement ?"))return;
  apts=apts.filter(a=>a.id!==id); save(KEYS.apts,apts); renderSpaces(); renderDashboard();
  showToast("Appartement supprimé.","info");
}

/* ============================================================
   18. DONNÉES DE DÉMO
   ============================================================ */
function seedDemoData(){
  if(tasks.length||orders.length||spaces.length||apts.length)return;
  tasks=[
    {id:uid(),title:"Tondre la pelouse (côté rue)",        building:BUILDINGS[0],priority:"medium",status:"todo",      description:"Secteur principal et bordures"},
    {id:uid(),title:"Remplacer ampoules couloir 2e étage", building:BUILDINGS[2],priority:"high",  status:"todo",      description:"3 ampoules E27 à changer"},
    {id:uid(),title:"Nettoyage salle de poubelles",        building:BUILDINGS[4],priority:"high",  status:"inprogress",description:""},
    {id:uid(),title:"Contrôle extincteurs",                building:BUILDINGS[1],priority:"medium",status:"todo",      description:"Vérification annuelle"},
    {id:uid(),title:"Débouchage gouttière nord",           building:BUILDINGS[3],priority:"low",   status:"todo",      description:""},
    {id:uid(),title:"Révision interphone appt 12",         building:BUILDINGS[0],priority:"medium",status:"done",      description:""},
  ];
  orders=[
    {id:uid(),supplier:"Hornbach",  date:"2025-06-01",status:"received",building:BUILDINGS[2],notes:"Commande urgente",
     items:[{id:uid(),name:"Ampoules LED E27",qty:"20",unit:"pcs",notes:"Réf. LED-E27-10W"},{id:uid(),name:"Câble électrique 2.5mm",qty:"5",unit:"m",notes:""}]},
    {id:uid(),supplier:"Migros Pro",date:"2025-06-05",status:"ordered", building:"",           notes:"Livraison jeudi",
     items:[{id:uid(),name:"Sel pour adoucisseur",qty:"2",unit:"sacs 25kg",notes:""},{id:uid(),name:"Produit nettoyant sol",qty:"4",unit:"L",notes:"Sans parfum"},{id:uid(),name:"Sacs poubelle 110L",qty:"3",unit:"rouleaux",notes:""}]},
    {id:uid(),supplier:"Decora",    date:"2025-06-10",status:"pending",  building:BUILDINGS[5],notes:"Pour retouches hall",
     items:[{id:uid(),name:"Peinture blanc mat",qty:"10",unit:"L",notes:"RAL 9010"},{id:uid(),name:"Rouleaux peinture",qty:"4",unit:"pcs",notes:""}]},
  ];
  spaces=[
    {id:uid(),name:"Place 3",  building:BUILDINGS[0],type:"indoor",  notes:""},
    {id:uid(),name:"Place 11", building:BUILDINGS[1],type:"outdoor", notes:""},
    {id:uid(),name:"Place P4", building:BUILDINGS[3],type:"indoor",  notes:"Handicapé"},
  ];
  apts=[
    {id:uid(),name:"Appartement 8A",building:BUILDINGS[2],floor:"4e",             rooms:"4.5",notes:"Disponible dès le 1er juillet"},
    {id:uid(),name:"Studio 2",      building:BUILDINGS[4],floor:"Rez-de-chaussée",rooms:"1.5",notes:"Travaux de peinture à prévoir"},
  ];
  save(KEYS.tasks,tasks); save(KEYS.orders,orders); save(KEYS.spaces,spaces); save(KEYS.apts,apts);
}

/* ============================================================
   19. INITIALISATION DE L'APPLICATION (après connexion)
   ============================================================ */
function initApp(){
  seedDemoData();
  refreshBuildingSelects();
  bindTaskFilters();
  bindOrderFilters();
  bindSpaceFilter();
  renderDashboard();
}

/* ============================================================
   20. DÉMARRAGE
   ============================================================ */
if(isLoggedIn()){
  hideLogin();
  initApp();
} else {
  showLogin();
}
