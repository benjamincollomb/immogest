/* ============================================================
   IMMOGEST — script.js
   Gestion complète en localStorage — commandes multi-produits
   ============================================================ */
"use strict";

/* ============================================================
   1. CONFIG
   ============================================================ */
const BUILDINGS = [
  "Immeuble A","Immeuble B","Immeuble C",
  "Immeuble D","Immeuble E","Immeuble F",
  "Immeuble G","Immeuble H","Immeuble I"
];
const STATUS_TASK_LABELS  = { todo:"À faire", inprogress:"En cours", done:"Terminé" };
const PRIORITY_LABELS     = { high:"Haute", medium:"Moyenne", low:"Basse" };
const STATUS_ORDER_LABELS = { ordered:"Commandé", pending:"En attente", received:"Reçu" };
const TYPE_SPACE_LABELS   = { indoor:"Intérieur", outdoor:"Extérieur" };

/* ============================================================
   2. STOCKAGE
   ============================================================ */
const KEYS = { tasks:"ig_tasks", orders:"ig_orders", spaces:"ig_spaces", apts:"ig_apts" };
function load(k){ try{ return JSON.parse(localStorage.getItem(k))||[]; }catch{ return []; } }
function save(k,d){ localStorage.setItem(k,JSON.stringify(d)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ============================================================
   3. STATE
   ============================================================ */
let tasks  = load(KEYS.tasks);
let orders = load(KEYS.orders);
let spaces = load(KEYS.spaces);
let apts   = load(KEYS.apts);

/* ============================================================
   4. NAVIGATION
   ============================================================ */
const TAB_TITLES = {
  dashboard:"Tableau de bord", tasks:"Tâches",
  orders:"Commandes", spaces:"Places & Appartements"
};
document.querySelectorAll(".nav-item").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
    closeMobileSidebar();
  });
});
function switchTab(tabId){
  document.querySelectorAll(".nav-item").forEach(l=>l.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add("active");
  document.querySelectorAll(".tab-content").forEach(s=>s.classList.remove("active"));
  document.getElementById(`tab-${tabId}`).classList.add("active");
  document.getElementById("topbarTitle").textContent = TAB_TITLES[tabId];
  if(tabId==="dashboard") renderDashboard();
  if(tabId==="tasks")     renderTasks();
  if(tabId==="orders")    renderOrders();
  if(tabId==="spaces")    renderSpaces();
}

/* Sidebar mobile */
const sidebar   = document.getElementById("sidebar");
const mobileBtn = document.getElementById("mobileMenuBtn");
const backdrop  = document.createElement("div");
backdrop.className = "sidebar-backdrop";
document.body.appendChild(backdrop);
mobileBtn.addEventListener("click", ()=>{ sidebar.classList.toggle("open"); backdrop.classList.toggle("visible"); });
backdrop.addEventListener("click", closeMobileSidebar);
function closeMobileSidebar(){ sidebar.classList.remove("open"); backdrop.classList.remove("visible"); }

/* ============================================================
   5. DATE
   ============================================================ */
function updateDate(){
  const now=new Date();
  let s=now.toLocaleDateString("fr-CH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  document.getElementById("dateDisplay").textContent=s.charAt(0).toUpperCase()+s.slice(1);
}
updateDate();

/* ============================================================
   6. TOAST
   ============================================================ */
function showToast(msg,type="success"){
  const icons={success:"fa-circle-check",error:"fa-circle-exclamation",info:"fa-circle-info"};
  const c=document.getElementById("toastContainer");
  const t=document.createElement("div");
  t.className=`toast ${type}`;
  t.innerHTML=`<i class="fa-solid ${icons[type]}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>{ t.style.animation="toastOut .3s cubic-bezier(.4,0,.2,1) forwards"; setTimeout(()=>t.remove(),300); },3000);
}

/* ============================================================
   7. MODAL
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
   8. HELPERS
   ============================================================ */
function escHtml(s){
  if(!s)return"";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function buildingOptions(sel=""){
  return BUILDINGS.map(b=>`<option value="${b}"${b===sel?" selected":""}>${b}</option>`).join("");
}
function taskStatusTag(s){ return `<span class="tag tag-${s}">${STATUS_TASK_LABELS[s]||s}</span>`; }
function priorityTag(p){ return `<span class="tag tag-${p}">${PRIORITY_LABELS[p]||p}</span>`; }
function orderStatusTag(s){ return `<span class="tag tag-${s}">${STATUS_ORDER_LABELS[s]||s}</span>`; }
function formatDate(str){
  if(!str)return"—";
  try{ return new Date(str).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit",year:"numeric"}); }
  catch{ return str; }
}

/* ============================================================
   9. DASHBOARD
   ============================================================ */
function renderDashboard(){
  document.getElementById("kpiPending").textContent    = tasks.filter(t=>t.status==="todo").length;
  document.getElementById("kpiInProgress").textContent = tasks.filter(t=>t.status==="inprogress").length;
  document.getElementById("kpiOrders").textContent     = orders.filter(o=>o.status!=="received").length;
  document.getElementById("kpiSpaces").textContent     = spaces.length;
  document.getElementById("kpiApts").textContent       = apts.length;
  document.getElementById("badgeTasks").textContent    = tasks.filter(t=>t.status!=="done").length;
  document.getElementById("badgeOrders").textContent   = orders.filter(o=>o.status==="ordered"||o.status==="pending").length;

  // Grille immeubles
  document.getElementById("buildingsGrid").innerHTML = BUILDINGS.map(b=>{
    const n=tasks.filter(t=>t.building===b&&t.status!=="done").length;
    return `<div class="building-tile">
      <i class="fa-solid fa-building"></i>
      <div class="bld-name">${b}</div>
      <div class="bld-tasks">${n?`${n} tâche${n>1?"s":""} active${n>1?"s":""}`:"Tout OK ✓"}</div>
    </div>`;
  }).join("");

  // Priorités
  const high=tasks.filter(t=>t.priority==="high"&&t.status!=="done");
  const el=document.getElementById("todayTasks");
  if(!high.length){
    el.innerHTML=`<p class="empty-msg"><i class="fa-regular fa-circle-check"></i>Aucune tâche haute priorité</p>`;
  } else {
    el.innerHTML=high.map(t=>`
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
   10. TÂCHES
   ============================================================ */
const filterTaskBuilding=document.getElementById("filterTaskBuilding");
const filterTaskStatus=document.getElementById("filterTaskStatus");
const filterTaskPriority=document.getElementById("filterTaskPriority");
const filterTaskSearch=document.getElementById("filterTaskSearch");
BUILDINGS.forEach(b=>{ filterTaskBuilding.innerHTML+=`<option value="${b}">${b}</option>`; });
[filterTaskBuilding,filterTaskStatus,filterTaskPriority,filterTaskSearch].forEach(e=>e.addEventListener("input",renderTasks));

function getFilteredTasks(){
  let list=[...tasks];
  const b=filterTaskBuilding.value,s=filterTaskStatus.value,p=filterTaskPriority.value,q=filterTaskSearch.value.toLowerCase();
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
        <button class="btn-icon edit"   data-id="${t.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon delete" data-id="${t.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join("");

  c.querySelectorAll(".task-status-btn").forEach(b=>b.addEventListener("click",()=>toggleTaskStatus(b.dataset.id)));
  c.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editTask(b.dataset.id)));
  c.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteTask(b.dataset.id)));
  document.getElementById("badgeTasks").textContent=tasks.filter(t=>t.status!=="done").length;
}

function toggleTaskStatus(id){
  const t=tasks.find(t=>t.id===id); if(!t)return;
  const cycle={todo:"inprogress",inprogress:"done",done:"todo"};
  t.status=cycle[t.status];
  save(KEYS.tasks,tasks); renderTasks(); renderDashboard();
  showToast(`Statut : ${STATUS_TASK_LABELS[t.status]}`,"info");
}

function taskFormHTML(t={}){
  return `
    <div class="form-group">
      <label>Titre *</label>
      <input id="fTitle" type="text" placeholder="Ex : Nettoyer hall d'entrée" value="${escHtml(t.title||"")}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Immeuble</label>
        <select id="fBuilding">${buildingOptions(t.building||BUILDINGS[0])}</select>
      </div>
      <div class="form-group">
        <label>Priorité</label>
        <select id="fPriority">
          <option value="high"   ${t.priority==="high"  ?"selected":""}>🔴 Haute</option>
          <option value="medium" ${t.priority==="medium"?"selected":""}>🟠 Moyenne</option>
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
      <label>Description</label>
      <textarea id="fDesc" placeholder="Détails…">${escHtml(t.description||"")}</textarea>
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
   11. COMMANDES — MULTI-PRODUITS
   Modèle d'une commande :
   {
     id, supplier, date, status, building, notes,
     items: [ { id, name, qty, unit, notes }, … ]
   }
   ============================================================ */
const filterOrderStatus=document.getElementById("filterOrderStatus");
const filterOrderBuilding=document.getElementById("filterOrderBuilding");
const filterOrderSearch=document.getElementById("filterOrderSearch");
BUILDINGS.forEach(b=>{ filterOrderBuilding.innerHTML+=`<option value="${b}">${b}</option>`; });
[filterOrderStatus,filterOrderBuilding,filterOrderSearch].forEach(e=>e.addEventListener("input",renderOrders));

function getFilteredOrders(){
  let list=[...orders];
  const st=filterOrderStatus.value, bl=filterOrderBuilding.value, q=filterOrderSearch.value.toLowerCase();
  if(st) list=list.filter(o=>o.status===st);
  if(bl) list=list.filter(o=>o.building===bl);
  if(q)  list=list.filter(o=>
    (o.supplier||"").toLowerCase().includes(q)||
    (o.items||[]).some(i=>i.name.toLowerCase().includes(q))||
    (o.notes||"").toLowerCase().includes(q)
  );
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
    const itemCount=(o.items||[]).length;
    const firstItems=(o.items||[]).slice(0,3).map(i=>escHtml(i.name)).join(", ");
    const moreCount=itemCount>3?` +${itemCount-3}`:"";
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
            ${firstItems}${moreCount?`<span style="color:var(--blue);font-weight:600">${moreCount} produit${itemCount-3>1?"s":""}</span>`:""}
          </div>
        </div>
        <div class="order-card-actions">
          <span class="order-summary-count">${itemCount} produit${itemCount>1?"s":""}</span>
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
        ${!itemCount?`<p class="empty-msg" style="padding:1rem"><i class="fa-solid fa-box-open"></i>Aucun produit</p>`:""}
      </div>
    </div>`;
  }).join("");

  // Expand toggle
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

/* -------- Formulaire commande multi-produits -------- */
function orderFormHTML(o={}){
  const today=new Date().toISOString().split("T")[0];
  const items=(o.items&&o.items.length)?o.items:[{id:uid(),name:"",qty:"",unit:"",notes:""}];
  return `
    <div class="form-row">
      <div class="form-group">
        <label>Fournisseur *</label>
        <input id="fSupplier" type="text" placeholder="Ex : Hornbach, Migros Pro…" value="${escHtml(o.supplier||"")}"/>
      </div>
      <div class="form-group">
        <label>Date de commande</label>
        <input id="fDate" type="date" value="${o.date||today}"/>
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
      <label>Notes générales</label>
      <input id="fNotes" type="text" placeholder="Remarques, délai, référence commande…" value="${escHtml(o.notes||"")}"/>
    </div>

    <!-- Section produits -->
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
  return `
    <div class="product-line" data-line-id="${it.id||uid()}" style="
      display:grid;grid-template-columns:2fr 70px 80px 1fr auto;gap:.5rem;
      align-items:center;margin-bottom:.5rem;background:var(--bg);
      padding:.6rem .7rem;border-radius:var(--radius-sm);border:1px solid var(--border)">
      <input class="pl-name" type="text" placeholder="Nom du produit *"
             value="${escHtml(it.name||"")}"
             style="padding:.45rem .7rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;transition:border-color .2s"
             onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
      <input class="pl-qty" type="text" placeholder="Qté"
             value="${escHtml(it.qty||"")}"
             style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;text-align:center;transition:border-color .2s"
             onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
      <input class="pl-unit" type="text" placeholder="Unité"
             value="${escHtml(it.unit||"")}"
             style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;transition:border-color .2s"
             onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
      <input class="pl-notes" type="text" placeholder="Notes"
             value="${escHtml(it.notes||"")}"
             style="padding:.45rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;width:100%;outline:none;transition:border-color .2s"
             onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--border)'"/>
      <button type="button" class="btn-icon delete remove-product-line" title="Supprimer ce produit"
              style="flex-shrink:0">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;
}

/** Lit les lignes de produits saisies dans la modale */
function readProductLines(){
  const lines=[];
  document.querySelectorAll("#productLines .product-line").forEach(div=>{
    const name=div.querySelector(".pl-name").value.trim();
    if(!name)return; // Ignore lignes vides
    lines.push({
      id:div.dataset.lineId||uid(),
      name,
      qty:  div.querySelector(".pl-qty").value.trim(),
      unit: div.querySelector(".pl-unit").value.trim(),
      notes:div.querySelector(".pl-notes").value.trim()
    });
  });
  return lines;
}

/** Attache les événements du formulaire commande après injection dans le DOM */
function bindOrderForm(){
  document.getElementById("btnAddProductLine").addEventListener("click",()=>{
    const container=document.getElementById("productLines");
    const idx=container.querySelectorAll(".product-line").length;
    const div=document.createElement("div");
    div.innerHTML=productLineHTML({id:uid()},idx);
    container.appendChild(div.firstElementChild);
    // Focus sur le nouveau champ
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
    orders.push({
      id:uid(), supplier, date:mval("fDate"),
      status:mval("fOStatus"), building:mval("fOBuilding"),
      notes:mval("fNotes"), items
    });
    save(KEYS.orders,orders); closeModal(); renderOrders(); renderDashboard();
    showToast("Commande ajoutée !","success");
  });
  // Bind après injection du HTML
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
   12. PLACES & APPARTEMENTS
   ============================================================ */
const filterSpaceBuilding=document.getElementById("filterSpaceBuilding");
BUILDINGS.forEach(b=>{ filterSpaceBuilding.innerHTML+=`<option value="${b}">${b}</option>`; });
filterSpaceBuilding.addEventListener("input",renderSpaces);

function renderSpaces(){
  const bld=filterSpaceBuilding.value;
  const filtS=bld?spaces.filter(s=>s.building===bld):spaces;
  const filtA=bld?apts.filter(a=>a.building===bld):apts;

  document.getElementById("countSpaces").textContent=filtS.length;
  document.getElementById("countApts").textContent=filtA.length;

  // Parking
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
          <button class="btn-icon edit"   data-id="${s.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${s.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("");
    sl.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editSpace(b.dataset.id)));
    sl.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteSpace(b.dataset.id)));
  }

  // Appartements
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
          <button class="btn-icon edit"   data-id="${a.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${a.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("");
    al.querySelectorAll(".btn-icon.edit").forEach(b=>b.addEventListener("click",()=>editApt(b.dataset.id)));
    al.querySelectorAll(".btn-icon.delete").forEach(b=>b.addEventListener("click",()=>deleteApt(b.dataset.id)));
  }
}

function spaceFormHTML(s={}){
  return `
    <div class="form-group"><label>Numéro / Nom *</label>
      <input id="fSName" type="text" placeholder="Ex : Place 14, P-03…" value="${escHtml(s.name||"")}"/>
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
   13. DONNÉES DE DÉMO
   ============================================================ */
function seedDemoData(){
  if(tasks.length||orders.length||spaces.length||apts.length)return;
  tasks=[
    {id:uid(),title:"Tondre la pelouse (côté rue)",         building:"Immeuble A",priority:"medium",status:"todo",      description:"Secteur principal et bordures"},
    {id:uid(),title:"Remplacer ampoules couloir 2e étage",  building:"Immeuble C",priority:"high",  status:"todo",      description:"3 ampoules E27 à changer"},
    {id:uid(),title:"Nettoyage salle de poubelles",         building:"Immeuble E",priority:"high",  status:"inprogress",description:""},
    {id:uid(),title:"Contrôle extincteurs",                 building:"Immeuble B",priority:"medium",status:"todo",      description:"Vérification annuelle"},
    {id:uid(),title:"Débouchage gouttière nord",            building:"Immeuble D",priority:"low",   status:"todo",      description:""},
    {id:uid(),title:"Révision interphone appartement 12",   building:"Immeuble A",priority:"medium",status:"done",      description:""},
  ];
  orders=[
    {id:uid(),supplier:"Hornbach",  date:"2025-06-01",status:"received",building:"Immeuble C",notes:"Commande urgente",
      items:[
        {id:uid(),name:"Ampoules LED E27",qty:"20",unit:"pcs",notes:"Réf. LED-E27-10W"},
        {id:uid(),name:"Câble électrique 2.5mm",qty:"5",unit:"m",notes:""},
      ]},
    {id:uid(),supplier:"Migros Pro",date:"2025-06-05",status:"ordered",building:"",notes:"Livraison jeudi",
      items:[
        {id:uid(),name:"Sel pour adoucisseur",qty:"2",unit:"sacs 25kg",notes:""},
        {id:uid(),name:"Produit nettoyant sol",qty:"4",unit:"L",notes:"Sans parfum"},
        {id:uid(),name:"Sacs poubelle 110L",qty:"3",unit:"rouleaux",notes:""},
      ]},
    {id:uid(),supplier:"Decora",date:"2025-06-10",status:"pending",building:"Immeuble F",notes:"Pour retouches hall",
      items:[
        {id:uid(),name:"Peinture blanc mat",qty:"10",unit:"L",notes:"Réf. RAL 9010"},
        {id:uid(),name:"Rouleaux peinture",qty:"4",unit:"pcs",notes:""},
      ]},
  ];
  spaces=[
    {id:uid(),name:"Place 3",  building:"Immeuble A",type:"indoor",  notes:""},
    {id:uid(),name:"Place 11", building:"Immeuble B",type:"outdoor", notes:""},
    {id:uid(),name:"Place P4", building:"Immeuble D",type:"indoor",  notes:"Handicapé"},
  ];
  apts=[
    {id:uid(),name:"Appartement 8A",building:"Immeuble C",floor:"4e",             rooms:"4.5",notes:"Disponible dès le 1er juillet"},
    {id:uid(),name:"Studio 2",      building:"Immeuble E",floor:"Rez-de-chaussée",rooms:"1.5",notes:"Travaux de peinture à prévoir"},
  ];
  save(KEYS.tasks,tasks); save(KEYS.orders,orders); save(KEYS.spaces,spaces); save(KEYS.apts,apts);
}

/* ============================================================
   14. INIT
   ============================================================ */
seedDemoData();
renderDashboard();
