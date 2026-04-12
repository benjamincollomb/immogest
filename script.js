/* ============================================================
   CONCIERGEPRO — script.js
   Gestion complète en localStorage (pas de backend requis)
   ============================================================ */

"use strict";

/* ============================================================
   1. DONNÉES INITIALES & CONFIGURATION
   ============================================================ */

/** Liste fixe des 9 immeubles */
const BUILDINGS = [
  "Immeuble A", "Immeuble B", "Immeuble C",
  "Immeuble D", "Immeuble E", "Immeuble F",
  "Immeuble G", "Immeuble H", "Immeuble I"
];

/** Libellés pour l'interface */
const STATUS_TASK_LABELS = {
  todo:       "À faire",
  inprogress: "En cours",
  done:       "Terminé"
};
const PRIORITY_LABELS = {
  high:   "Haute",
  medium: "Moyenne",
  low:    "Basse"
};
const STATUS_ORDER_LABELS = {
  ordered:  "Commandé",
  pending:  "En attente",
  received: "Reçu"
};
const TYPE_SPACE_LABELS = {
  indoor:  "Intérieur",
  outdoor: "Extérieur"
};

/* ============================================================
   2. STOCKAGE (localStorage)
   ============================================================ */

const KEYS = {
  tasks:  "cp_tasks",
  orders: "cp_orders",
  spaces: "cp_spaces",
  apts:   "cp_apts"
};

/** Charge les données depuis localStorage (ou tableau vide) */
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch { return []; }
}

/** Sauvegarde dans localStorage */
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/** Génère un identifiant unique */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ============================================================
   3. STATE — données en mémoire
   ============================================================ */
let tasks  = load(KEYS.tasks);
let orders = load(KEYS.orders);
let spaces = load(KEYS.spaces);  // places de parking libres
let apts   = load(KEYS.apts);   // appartements libres

/* ============================================================
   4. NAVIGATION & TABS
   ============================================================ */
const TAB_TITLES = {
  dashboard: "Tableau de bord",
  tasks:     "Tâches",
  orders:    "Commandes",
  spaces:    "Places & Appartements"
};

document.querySelectorAll(".nav-item").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
    // Fermer sidebar mobile
    closeMobileSidebar();
  });
});

function switchTab(tabId) {
  // Nav items
  document.querySelectorAll(".nav-item").forEach(l => l.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add("active");

  // Sections
  document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
  document.getElementById(`tab-${tabId}`).classList.add("active");

  // Titre topbar
  document.getElementById("topbarTitle").textContent = TAB_TITLES[tabId];

  // Render le bon onglet
  if (tabId === "dashboard") renderDashboard();
  if (tabId === "tasks")     renderTasks();
  if (tabId === "orders")    renderOrders();
  if (tabId === "spaces")    renderSpaces();
}

/* ---------- Sidebar mobile ---------- */
const sidebar   = document.getElementById("sidebar");
const mobileBtn = document.getElementById("mobileMenuBtn");

// Créer le backdrop
const backdrop = document.createElement("div");
backdrop.className = "sidebar-backdrop";
document.body.appendChild(backdrop);

mobileBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  backdrop.classList.toggle("visible");
});
backdrop.addEventListener("click", closeMobileSidebar);

function closeMobileSidebar() {
  sidebar.classList.remove("open");
  backdrop.classList.remove("visible");
}

/* ============================================================
   5. DATE DANS LA TOPBAR
   ============================================================ */
function updateDate() {
  const now = new Date();
  const opts = { weekday:"long", year:"numeric", month:"long", day:"numeric" };
  let str = now.toLocaleDateString("fr-CH", opts);
  str = str.charAt(0).toUpperCase() + str.slice(1);
  document.getElementById("dateDisplay").textContent = str;
}
updateDate();

/* ============================================================
   6. TOAST NOTIFICATIONS
   ============================================================ */

/**
 * Affiche une notification toast.
 * @param {string} message - Texte affiché
 * @param {"success"|"error"|"info"} type
 */
function showToast(message, type = "success") {
  const icons = { success:"fa-circle-check", error:"fa-circle-exclamation", info:"fa-circle-info" };
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut .3s cubic-bezier(.4,0,.2,1) forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   7. MODAL GÉNÉRIQUE
   ============================================================ */
let modalSaveCallback = null;

const modalOverlay = document.getElementById("modalOverlay");
const modalTitle   = document.getElementById("modalTitle");
const modalBody    = document.getElementById("modalBody");
const modalSaveBtn = document.getElementById("modalSave");
const modalCancel  = document.getElementById("modalCancel");
const modalClose   = document.getElementById("modalClose");

/**
 * Ouvre la modale.
 * @param {string} title - Titre
 * @param {string} bodyHTML - Contenu HTML du formulaire
 * @param {function} onSave - Callback appelé lors de l'enregistrement
 */
function openModal(title, bodyHTML, onSave) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;
  modalSaveCallback = onSave;
  modalOverlay.classList.remove("hidden");
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalSaveCallback = null;
  modalBody.innerHTML = "";
}

modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
modalSaveBtn.addEventListener("click", () => { if (modalSaveCallback) modalSaveCallback(); });

/** Lit la valeur d'un champ du formulaire dans la modale */
function mval(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

/* ============================================================
   8. HELPERS HTML
   ============================================================ */

/** Génère les <option> d'immeubles pour un <select> */
function buildingOptions(selected = "") {
  return BUILDINGS.map(b =>
    `<option value="${b}" ${b === selected ? "selected" : ""}>${b}</option>`
  ).join("");
}

/** Badge statut tâche */
function taskStatusTag(status) {
  const labels = STATUS_TASK_LABELS;
  return `<span class="tag tag-${status}">${labels[status] || status}</span>`;
}

/** Badge priorité */
function priorityTag(priority) {
  return `<span class="tag tag-${priority}">${PRIORITY_LABELS[priority] || priority}</span>`;
}

/** Badge statut commande */
function orderStatusTag(status) {
  return `<span class="tag tag-${status}">${STATUS_ORDER_LABELS[status] || status}</span>`;
}

/** Boutons d'action éditer / supprimer */
function actionBtns(editFn, deleteFn) {
  const editId   = uid();
  const deleteId = uid();
  setTimeout(() => {
    const eBtn = document.getElementById(editId);
    const dBtn = document.getElementById(deleteId);
    if (eBtn) eBtn.addEventListener("click", editFn);
    if (dBtn) dBtn.addEventListener("click", deleteFn);
  }, 0);
  return `
    <button class="btn-icon edit"   id="${editId}"   title="Modifier"><i class="fa-solid fa-pen"></i></button>
    <button class="btn-icon delete" id="${deleteId}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
  `;
}

/* ============================================================
   9. DASHBOARD
   ============================================================ */

function renderDashboard() {
  // KPIs
  const pending    = tasks.filter(t => t.status === "todo").length;
  const inProgress = tasks.filter(t => t.status === "inprogress").length;
  const activeOrders = orders.filter(o => o.status !== "received").length;
  const freeSpaces = spaces.length;
  const freeApts   = apts.length;

  document.getElementById("kpiPending").textContent    = pending;
  document.getElementById("kpiInProgress").textContent = inProgress;
  document.getElementById("kpiOrders").textContent     = activeOrders;
  document.getElementById("kpiSpaces").textContent     = freeSpaces;
  document.getElementById("kpiApts").textContent       = freeApts;

  // Badges sidebar
  document.getElementById("badgeTasks").textContent  = tasks.filter(t => t.status !== "done").length;
  document.getElementById("badgeOrders").textContent = orders.filter(o => o.status === "ordered" || o.status === "pending").length;

  // Grille immeubles
  const grid = document.getElementById("buildingsGrid");
  grid.innerHTML = BUILDINGS.map(b => {
    const count = tasks.filter(t => t.building === b && t.status !== "done").length;
    return `
      <div class="building-tile">
        <i class="fa-solid fa-building"></i>
        <div class="bld-name">${b}</div>
        <div class="bld-tasks">${count ? `${count} tâche${count>1?"s":""} active${count>1?"s":""}` : "Tout OK ✓"}</div>
      </div>
    `;
  }).join("");

  // Tâches haute priorité
  const highTasks = tasks.filter(t => t.priority === "high" && t.status !== "done");
  const todayEl   = document.getElementById("todayTasks");
  if (highTasks.length === 0) {
    todayEl.innerHTML = `<p class="empty-msg"><i class="fa-regular fa-circle-check"></i>Aucune tâche haute priorité</p>`;
  } else {
    todayEl.innerHTML = highTasks.map(t => `
      <div class="task-mini">
        <div class="task-mini-dot ${t.priority}"></div>
        <div>
          <div class="task-mini-title">${escHtml(t.title)}</div>
          <div class="task-mini-meta">${escHtml(t.building)} · ${taskStatusTag(t.status)}</div>
        </div>
      </div>
    `).join("");
  }
}

/** Échappe les caractères HTML pour éviter XSS */
function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ============================================================
   10. TÂCHES
   ============================================================ */

// -- Filtres
const filterTaskBuilding = document.getElementById("filterTaskBuilding");
const filterTaskStatus   = document.getElementById("filterTaskStatus");
const filterTaskPriority = document.getElementById("filterTaskPriority");
const filterTaskSearch   = document.getElementById("filterTaskSearch");

// Remplir le sélecteur d'immeubles
BUILDINGS.forEach(b => {
  filterTaskBuilding.innerHTML += `<option value="${b}">${b}</option>`;
});

[filterTaskBuilding, filterTaskStatus, filterTaskPriority, filterTaskSearch]
  .forEach(el => el.addEventListener("input", renderTasks));

function getFilteredTasks() {
  let list = [...tasks];
  const bld   = filterTaskBuilding.value;
  const stat  = filterTaskStatus.value;
  const prio  = filterTaskPriority.value;
  const search = filterTaskSearch.value.toLowerCase();
  if (bld)    list = list.filter(t => t.building === bld);
  if (stat)   list = list.filter(t => t.status   === stat);
  if (prio)   list = list.filter(t => t.priority  === prio);
  if (search) list = list.filter(t =>
    t.title.toLowerCase().includes(search) ||
    (t.description || "").toLowerCase().includes(search)
  );
  // Trier : haute priorité d'abord, puis par titre
  const prioOrder = { high:0, medium:1, low:2 };
  list.sort((a,b) => (prioOrder[a.priority]||2) - (prioOrder[b.priority]||2));
  return list;
}

function renderTasks() {
  const list = getFilteredTasks();
  const container = document.getElementById("tasksList");
  if (list.length === 0) {
    container.innerHTML = `<div class="card"><p class="empty-msg"><i class="fa-solid fa-list-check"></i>Aucune tâche trouvée</p></div>`;
    return;
  }
  container.innerHTML = list.map(t => `
    <div class="task-card priority-${t.priority} status-${t.status}">
      <button class="task-status-btn" data-id="${t.id}" title="Marquer terminé">
        ${t.status === "done" ? '<i class="fa-solid fa-check"></i>' : ""}
      </button>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}</div>
        <div class="task-meta">
          ${taskStatusTag(t.status)}
          ${priorityTag(t.priority)}
          <span class="tag tag-building"><i class="fa-solid fa-building"></i> ${escHtml(t.building)}</span>
          ${t.description ? `<span class="tag tag-building" style="background:transparent;border-color:transparent;color:var(--text-light);font-weight:400">${escHtml(t.description)}</span>` : ""}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon edit" data-id="${t.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon delete" data-id="${t.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join("");

  // Événements
  container.querySelectorAll(".task-status-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleTaskStatus(btn.dataset.id));
  });
  container.querySelectorAll(".btn-icon.edit").forEach(btn => {
    btn.addEventListener("click", () => editTask(btn.dataset.id));
  });
  container.querySelectorAll(".btn-icon.delete").forEach(btn => {
    btn.addEventListener("click", () => deleteTask(btn.dataset.id));
  });

  // Mettre à jour les badges
  document.getElementById("badgeTasks").textContent = tasks.filter(t => t.status !== "done").length;
}

function toggleTaskStatus(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  const cycle = { todo:"inprogress", inprogress:"done", done:"todo" };
  t.status = cycle[t.status];
  save(KEYS.tasks, tasks);
  renderTasks();
  renderDashboard();
  showToast(`Statut mis à jour : ${STATUS_TASK_LABELS[t.status]}`, "info");
}

// -- Formulaire tâche
function taskFormHTML(t = {}) {
  return `
    <div class="form-group">
      <label>Titre de la tâche *</label>
      <input id="fTitle" type="text" placeholder="Ex : Nettoyer hall d'entrée" value="${escHtml(t.title||"")}" required/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fBuilding">${buildingOptions(t.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group">
        <label>Priorité</label>
        <select id="fPriority">
          <option value="high"   ${t.priority==="high"   ?"selected":""}>🔴 Haute</option>
          <option value="medium" ${t.priority==="medium" ?"selected":""}>🟠 Moyenne</option>
          <option value="low"    ${(!t.priority||t.priority==="low")?"selected":""}>🟢 Basse</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Statut</label>
      <select id="fStatus">
        <option value="todo"       ${(!t.status||t.status==="todo")      ?"selected":""}>À faire</option>
        <option value="inprogress" ${t.status==="inprogress"             ?"selected":""}>En cours</option>
        <option value="done"       ${t.status==="done"                   ?"selected":""}>Terminé</option>
      </select>
    </div>
    <div class="form-group">
      <label>Description (optionnel)</label>
      <textarea id="fDesc" placeholder="Détails supplémentaires…">${escHtml(t.description||"")}</textarea>
    </div>
  `;
}

document.getElementById("btnAddTask").addEventListener("click", () => {
  openModal("Nouvelle tâche", taskFormHTML(), () => {
    const title = mval("fTitle");
    if (!title) { showToast("Le titre est obligatoire.", "error"); return; }
    tasks.push({
      id: uid(),
      title,
      building:    mval("fBuilding"),
      priority:    mval("fPriority"),
      status:      mval("fStatus"),
      description: mval("fDesc")
    });
    save(KEYS.tasks, tasks);
    closeModal();
    renderTasks();
    renderDashboard();
    showToast("Tâche ajoutée avec succès !", "success");
  });
});

function editTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  openModal("Modifier la tâche", taskFormHTML(t), () => {
    const title = mval("fTitle");
    if (!title) { showToast("Le titre est obligatoire.", "error"); return; }
    Object.assign(t, {
      title,
      building:    mval("fBuilding"),
      priority:    mval("fPriority"),
      status:      mval("fStatus"),
      description: mval("fDesc")
    });
    save(KEYS.tasks, tasks);
    closeModal();
    renderTasks();
    renderDashboard();
    showToast("Tâche mise à jour.", "success");
  });
}

function deleteTask(id) {
  if (!confirm("Supprimer cette tâche définitivement ?")) return;
  tasks = tasks.filter(t => t.id !== id);
  save(KEYS.tasks, tasks);
  renderTasks();
  renderDashboard();
  showToast("Tâche supprimée.", "info");
}

/* ============================================================
   11. COMMANDES
   ============================================================ */

const filterOrderStatus = document.getElementById("filterOrderStatus");
const filterOrderSearch = document.getElementById("filterOrderSearch");
[filterOrderStatus, filterOrderSearch].forEach(el => el.addEventListener("input", renderOrders));

function getFilteredOrders() {
  let list = [...orders];
  const stat   = filterOrderStatus.value;
  const search = filterOrderSearch.value.toLowerCase();
  if (stat)   list = list.filter(o => o.status === stat);
  if (search) list = list.filter(o =>
    o.item.toLowerCase().includes(search) ||
    (o.supplier||"").toLowerCase().includes(search) ||
    (o.notes||"").toLowerCase().includes(search)
  );
  // Trier par date décroissante
  list.sort((a,b) => new Date(b.date) - new Date(a.date));
  return list;
}

function renderOrders() {
  const list = getFilteredOrders();
  const tbody = document.getElementById("ordersBody");
  const emptyEl = document.getElementById("ordersEmpty");

  if (list.length === 0) {
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  tbody.innerHTML = list.map(o => `
    <tr>
      <td class="item-name">${escHtml(o.item)}</td>
      <td>${escHtml(o.supplier||"—")}</td>
      <td class="td-date">${formatDate(o.date)}</td>
      <td>${orderStatusTag(o.status)}</td>
      <td><span class="tag tag-building">${escHtml(o.building||"—")}</span></td>
      <td class="td-notes" title="${escHtml(o.notes||"")}">${escHtml(o.notes||"—")}</td>
      <td>
        <div style="display:flex;gap:.3rem">
          <button class="btn-icon edit"   data-id="${o.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${o.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".btn-icon.edit").forEach(btn => {
    btn.addEventListener("click", () => editOrder(btn.dataset.id));
  });
  tbody.querySelectorAll(".btn-icon.delete").forEach(btn => {
    btn.addEventListener("click", () => deleteOrder(btn.dataset.id));
  });

  document.getElementById("badgeOrders").textContent =
    orders.filter(o => o.status === "ordered" || o.status === "pending").length;
}

function formatDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleDateString("fr-CH", { day:"2-digit", month:"2-digit", year:"numeric" });
  } catch { return str; }
}

// Formulaire commande
function orderFormHTML(o = {}) {
  const today = new Date().toISOString().split("T")[0];
  return `
    <div class="form-group">
      <label>Article / Matériel *</label>
      <input id="fItem" type="text" placeholder="Ex : Ampoules LED E27" value="${escHtml(o.item||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Fournisseur</label>
        <input id="fSupplier" type="text" placeholder="Ex : Hornbach" value="${escHtml(o.supplier||"")}"/>
      </div>
      <div class="form-group">
        <label>Date de commande</label>
        <input id="fDate" type="date" value="${o.date || today}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Statut</label>
        <select id="fOStatus">
          <option value="ordered"  ${(!o.status||o.status==="ordered") ?"selected":""}>Commandé</option>
          <option value="pending"  ${o.status==="pending"              ?"selected":""}>En attente</option>
          <option value="received" ${o.status==="received"             ?"selected":""}>Reçu</option>
        </select>
      </div>
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fOBuilding">
          <option value="">— Général —</option>
          ${buildingOptions(o.building||"")}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="fNotes" placeholder="Quantité, référence, remarques…">${escHtml(o.notes||"")}</textarea>
    </div>
  `;
}

document.getElementById("btnAddOrder").addEventListener("click", () => {
  openModal("Nouvelle commande", orderFormHTML(), () => {
    const item = mval("fItem");
    if (!item) { showToast("L'article est obligatoire.", "error"); return; }
    orders.push({
      id:       uid(),
      item,
      supplier: mval("fSupplier"),
      date:     mval("fDate"),
      status:   mval("fOStatus"),
      building: mval("fOBuilding"),
      notes:    mval("fNotes")
    });
    save(KEYS.orders, orders);
    closeModal();
    renderOrders();
    renderDashboard();
    showToast("Commande ajoutée !", "success");
  });
});

function editOrder(id) {
  const o = orders.find(o => o.id === id);
  if (!o) return;
  openModal("Modifier la commande", orderFormHTML(o), () => {
    const item = mval("fItem");
    if (!item) { showToast("L'article est obligatoire.", "error"); return; }
    Object.assign(o, {
      item,
      supplier: mval("fSupplier"),
      date:     mval("fDate"),
      status:   mval("fOStatus"),
      building: mval("fOBuilding"),
      notes:    mval("fNotes")
    });
    save(KEYS.orders, orders);
    closeModal();
    renderOrders();
    renderDashboard();
    showToast("Commande mise à jour.", "success");
  });
}

function deleteOrder(id) {
  if (!confirm("Supprimer cette commande ?")) return;
  orders = orders.filter(o => o.id !== id);
  save(KEYS.orders, orders);
  renderOrders();
  renderDashboard();
  showToast("Commande supprimée.", "info");
}

/* ============================================================
   12. PLACES & APPARTEMENTS
   ============================================================ */

const filterSpaceBuilding = document.getElementById("filterSpaceBuilding");
// Remplir le sélecteur
BUILDINGS.forEach(b => {
  filterSpaceBuilding.innerHTML += `<option value="${b}">${b}</option>`;
});
filterSpaceBuilding.addEventListener("input", renderSpaces);

function renderSpaces() {
  const bld = filterSpaceBuilding.value;

  // Places parking
  let filteredSpaces = bld ? spaces.filter(s => s.building === bld) : spaces;
  const spacesList = document.getElementById("spacesList");
  document.getElementById("countSpaces").textContent = filteredSpaces.length;

  if (filteredSpaces.length === 0) {
    spacesList.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-circle-check"></i>Aucune place libre</p>`;
  } else {
    spacesList.innerHTML = filteredSpaces.map(s => `
      <div class="space-item">
        <div class="space-item-left">
          <i class="fa-solid ${s.type==="indoor"?"fa-warehouse":"fa-sun"}"></i>
          <div class="space-item-info">
            <div class="space-item-name">${escHtml(s.name)}</div>
            <div class="space-item-meta">${escHtml(s.building)} · ${TYPE_SPACE_LABELS[s.type]||s.type}${s.notes ? " · "+escHtml(s.notes) : ""}</div>
          </div>
        </div>
        <div class="space-item-actions">
          <button class="btn-icon edit"   data-id="${s.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${s.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    spacesList.querySelectorAll(".btn-icon.edit").forEach(btn => {
      btn.addEventListener("click", () => editSpace(btn.dataset.id));
    });
    spacesList.querySelectorAll(".btn-icon.delete").forEach(btn => {
      btn.addEventListener("click", () => deleteSpace(btn.dataset.id));
    });
  }

  // Appartements
  let filteredApts = bld ? apts.filter(a => a.building === bld) : apts;
  const aptsList = document.getElementById("aptsList");
  document.getElementById("countApts").textContent = filteredApts.length;

  if (filteredApts.length === 0) {
    aptsList.innerHTML = `<p class="empty-msg"><i class="fa-solid fa-circle-check"></i>Aucun appartement libre</p>`;
  } else {
    aptsList.innerHTML = filteredApts.map(a => `
      <div class="space-item">
        <div class="space-item-left">
          <i class="fa-solid fa-door-open"></i>
          <div class="space-item-info">
            <div class="space-item-name">${escHtml(a.name)}</div>
            <div class="space-item-meta">${escHtml(a.building)}${a.floor ? " · " + escHtml(a.floor) : ""}${a.rooms ? " · " + escHtml(a.rooms) + " pièces" : ""}${a.notes ? " · " + escHtml(a.notes) : ""}</div>
          </div>
        </div>
        <div class="space-item-actions">
          <button class="btn-icon edit"   data-id="${a.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${a.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    aptsList.querySelectorAll(".btn-icon.edit").forEach(btn => {
      btn.addEventListener("click", () => editApt(btn.dataset.id));
    });
    aptsList.querySelectorAll(".btn-icon.delete").forEach(btn => {
      btn.addEventListener("click", () => deleteApt(btn.dataset.id));
    });
  }
}

/* ---- Formulaire place parking ---- */
function spaceFormHTML(s = {}) {
  return `
    <div class="form-group">
      <label>Numéro / Nom de la place *</label>
      <input id="fSName" type="text" placeholder="Ex : Place 14, P-03…" value="${escHtml(s.name||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fSBuilding">${buildingOptions(s.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="fSType">
          <option value="indoor"  ${(!s.type||s.type==="indoor") ?"selected":""}>🏠 Intérieur</option>
          <option value="outdoor" ${s.type==="outdoor"           ?"selected":""}>☀️ Extérieur</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notes (optionnel)</label>
      <input id="fSNotes" type="text" placeholder="Ex : Handicapé, moto, double…" value="${escHtml(s.notes||"")}"/>
    </div>
  `;
}

document.getElementById("btnAddSpace").addEventListener("click", () => {
  openModal("Nouvelle place de parking", spaceFormHTML(), () => {
    const name = mval("fSName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    spaces.push({ id:uid(), name, building:mval("fSBuilding"), type:mval("fSType"), notes:mval("fSNotes") });
    save(KEYS.spaces, spaces);
    closeModal();
    renderSpaces();
    renderDashboard();
    showToast("Place ajoutée !", "success");
  });
});

function editSpace(id) {
  const s = spaces.find(s => s.id === id);
  if (!s) return;
  openModal("Modifier la place", spaceFormHTML(s), () => {
    const name = mval("fSName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    Object.assign(s, { name, building:mval("fSBuilding"), type:mval("fSType"), notes:mval("fSNotes") });
    save(KEYS.spaces, spaces);
    closeModal();
    renderSpaces();
    renderDashboard();
    showToast("Place mise à jour.", "success");
  });
}

function deleteSpace(id) {
  if (!confirm("Supprimer cette place ?")) return;
  spaces = spaces.filter(s => s.id !== id);
  save(KEYS.spaces, spaces);
  renderSpaces();
  renderDashboard();
  showToast("Place supprimée.", "info");
}

/* ---- Formulaire appartement ---- */
function aptFormHTML(a = {}) {
  return `
    <div class="form-group">
      <label>Numéro / Nom de l'appartement *</label>
      <input id="fAName" type="text" placeholder="Ex : Appartement 4B, Studio 12…" value="${escHtml(a.name||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fABuilding">${buildingOptions(a.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group">
        <label>Étage</label>
        <input id="fAFloor" type="text" placeholder="Ex : 3e, Rez-de-chaussée…" value="${escHtml(a.floor||"")}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nombre de pièces</label>
        <input id="fARooms" type="text" placeholder="Ex : 3.5" value="${escHtml(a.rooms||"")}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Notes (optionnel)</label>
      <textarea id="fANotes" placeholder="Loyer, disponibilité, travaux à prévoir…">${escHtml(a.notes||"")}</textarea>
    </div>
  `;
}

document.getElementById("btnAddApt").addEventListener("click", () => {
  openModal("Nouvel appartement libre", aptFormHTML(), () => {
    const name = mval("fAName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    apts.push({ id:uid(), name, building:mval("fABuilding"), floor:mval("fAFloor"), rooms:mval("fARooms"), notes:mval("fANotes") });
    save(KEYS.apts, apts);
    closeModal();
    renderSpaces();
    renderDashboard();
    showToast("Appartement ajouté !", "success");
  });
});

function editApt(id) {
  const a = apts.find(a => a.id === id);
  if (!a) return;
  openModal("Modifier l'appartement", aptFormHTML(a), () => {
    const name = mval("fAName");
    if (!name) { showToast("Le nom est obligatoire.", "error"); return; }
    Object.assign(a, { name, building:mval("fABuilding"), floor:mval("fAFloor"), rooms:mval("fARooms"), notes:mval("fANotes") });
    save(KEYS.apts, apts);
    closeModal();
    renderSpaces();
    renderDashboard();
    showToast("Appartement mis à jour.", "success");
  });
}

function deleteApt(id) {
  if (!confirm("Supprimer cet appartement ?")) return;
  apts = apts.filter(a => a.id !== id);
  save(KEYS.apts, apts);
  renderSpaces();
  renderDashboard();
  showToast("Appartement supprimé.", "info");
}

/* ============================================================
   13. DONNÉES DE DÉMO (si localStorage vide au premier lancement)
   ============================================================ */

function seedDemoData() {
  if (tasks.length || orders.length || spaces.length || apts.length) return;

  // Quelques tâches de démo
  tasks = [
    { id:uid(), title:"Tondre la pelouse (côté rue)",         building:"Immeuble A", priority:"medium", status:"todo",       description:"Secteur principal et bordures" },
    { id:uid(), title:"Remplacer ampoules couloir 2e étage",  building:"Immeuble C", priority:"high",   status:"todo",       description:"3 ampoules E27 à changer" },
    { id:uid(), title:"Nettoyage salle de poubelles",         building:"Immeuble E", priority:"high",   status:"inprogress", description:"" },
    { id:uid(), title:"Contrôle extincteurs",                 building:"Immeuble B", priority:"medium", status:"todo",       description:"Vérification annuelle" },
    { id:uid(), title:"Débouchage gouttière nord",            building:"Immeuble D", priority:"low",    status:"todo",       description:"" },
    { id:uid(), title:"Révision interphone appartement 12",   building:"Immeuble A", priority:"medium", status:"done",       description:"" },
  ];

  // Quelques commandes de démo
  orders = [
    { id:uid(), item:"Ampoules LED E27 (x20)",   supplier:"Hornbach",   date:"2025-06-01", status:"received", building:"Immeuble C", notes:"Référence : LED-E27-10W" },
    { id:uid(), item:"Sel pour adoucisseur",     supplier:"Migros Pro", date:"2025-06-05", status:"ordered",  building:"",           notes:"2 sacs de 25kg" },
    { id:uid(), item:"Peinture blanc mat 10L",   supplier:"Decora",     date:"2025-06-10", status:"pending",  building:"Immeuble F", notes:"Pour retouches hall" },
    { id:uid(), item:"Tuyau d'arrosage 25m",     supplier:"Jumbo",      date:"2025-05-28", status:"received", building:"Immeuble A", notes:"" },
  ];

  // Quelques places libres
  spaces = [
    { id:uid(), name:"Place 3",  building:"Immeuble A", type:"indoor",  notes:"" },
    { id:uid(), name:"Place 11", building:"Immeuble B", type:"outdoor", notes:"" },
    { id:uid(), name:"Place P4", building:"Immeuble D", type:"indoor",  notes:"Handicapé" },
  ];

  // Quelques apparts libres
  apts = [
    { id:uid(), name:"Appartement 8A", building:"Immeuble C", floor:"4e",            rooms:"4.5", notes:"Disponible dès le 1er juillet" },
    { id:uid(), name:"Studio 2",       building:"Immeuble E", floor:"Rez-de-chaussée", rooms:"1.5", notes:"Travaux de peinture à prévoir" },
  ];

  save(KEYS.tasks,  tasks);
  save(KEYS.orders, orders);
  save(KEYS.spaces, spaces);
  save(KEYS.apts,   apts);
}

/* ============================================================
   14. INITIALISATION
   ============================================================ */

function init() {
  seedDemoData();
  renderDashboard();
  // Pré-remplir les filtres tâches avec tous les immeubles
  // (déjà fait dans le HTML statique + JS au dessus)
}

init();
