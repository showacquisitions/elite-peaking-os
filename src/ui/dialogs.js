/* Elite OS v5.0 — Custom Modals, Bottom Sheets & Undo Toast (Zero native alert/confirm/prompt) */
let toastT = null;
function toast(msg, kind, undoFn) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.className = "toast t-" + (kind || "info") + " on";
  el.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button type="button" class="toast-undo" id="toastUndo">Undo</button>' : ""}`;
  if (undoFn) {
    const b = $("toastUndo");
    if (b) b.onclick = () => { el.classList.remove("on"); clearTimeout(toastT); undoFn(); };
  }
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), undoFn ? 5600 : 4000);
}

function uiDialog(opts) {
  return new Promise(resolve => {
    const prev = document.getElementById("eliteDlg");
    if (prev) prev.remove();
    const m = document.createElement("div");
    m.id = "eliteDlg";
    m.className = "sheet-bg";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("aria-label", opts.title || "Confirm");
    const isPrompt = opts.kind === "prompt";
    const isAlert = opts.kind === "alert";
    m.innerHTML = `<div class="sheet-card">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${ico(opts.icon || (opts.danger ? "alert" : "info"), 18)}${esc(opts.title || (opts.danger ? "Are you sure?" : "Elite OS"))}</h2>
        <button type="button" class="hthm" data-dlg="cancel" aria-label="Close">${ico("x", 18)}</button></div>
      <div class="dlg-msg">${esc(opts.message || "")}</div>
      ${isPrompt ? `<input id="dlgInput" type="text" value="${esc(opts.value || "")}" placeholder="${esc(opts.placeholder || "")}" maxlength="${opts.max || 200}" style="width:100%;margin-top:12px"/>` : ""}
      <div class="dlg-act">
        ${isAlert ? "" : `<button type="button" class="btn" data-dlg="cancel">${esc(opts.cancelText || "Cancel")}</button>`}
        <button type="button" class="btn ${opts.danger ? "danger" : "pri"}" data-dlg="ok">${esc(opts.okText || (isAlert ? "OK" : "Confirm"))}</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    const inp = m.querySelector("#dlgInput");
    const done = val => {
      document.removeEventListener("keydown", onKey);
      m.remove();
      resolve(val);
    };
    const onKey = e => {
      if (e.key === "Escape") done(isPrompt ? null : false);
      else if (e.key === "Enter" && (isPrompt || isAlert)) { e.preventDefault(); done(isPrompt ? (inp ? inp.value : "") : true); }
    };
    document.addEventListener("keydown", onKey);
    m.addEventListener("click", e => {
      if (e.target === m) return done(isPrompt ? null : false);
      const b = e.target.closest("[data-dlg]");
      if (!b) return;
      if (b.dataset.dlg === "ok") done(isPrompt ? (inp ? inp.value : "") : true);
      else done(isPrompt ? null : false);
    });
    if (inp) { inp.focus(); inp.select(); }
    else { const ok = m.querySelector('[data-dlg="ok"]'); if (ok) ok.focus(); }
  });
}

const uiAlert = (message, title) => uiDialog({ kind: "alert", title: title || "Notice", message });
const uiConfirm = (message, opts) => uiDialog(Object.assign({ kind: "confirm", message }, opts || {}));
const uiPrompt = (message, value, opts) => uiDialog(Object.assign({ kind: "prompt", message, value }, opts || {}));

function openSheet(id, title, bodyHTML, opts) {
  closeSheet(id);
  const o = opts || {};
  const m = document.createElement("div");
  m.id = "sheet-" + id;
  m.className = "sheet-bg";
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-modal", "true");
  m.setAttribute("aria-label", title);
  m.innerHTML = `<div class="sheet-card ${o.wide ? "wide" : ""}">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>${o.icon ? ico(o.icon, 18) : ""}${esc(title)}</h2>
      <button type="button" class="hthm" data-sheet-close="${esc(id)}" aria-label="Close">${ico("x", 18)}</button></div>
    <div class="sheet-body">${bodyHTML}</div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => {
    if (e.target === m || e.target.closest(`[data-sheet-close="${id}"]`)) closeSheet(id);
  });
  return m;
}
function closeSheet(id) {
  const el = document.getElementById("sheet-" + id);
  if (el) el.remove();
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".sheet-bg:not(#eliteDlg)")];
  if (open.length) open[open.length - 1].remove();
});
