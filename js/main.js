// ====================== 共用功能 ======================

// Tab 切換功能
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// 列印功能
function printTab(id) {
  tabPanels.forEach(p => p.classList.remove('print-active'));
  document.getElementById(id).classList.add('print-active');
  window.print();
}

// ====================== 管理者登入 ======================
const ADMIN_SESSION_KEY = 'bw_admin_session';
const ADMIN_ACCOUNTS_KEY = 'bw_admin_accounts';
const DEFAULT_ADMIN_ACCOUNTS = [
  { username: 'wufatw', password: 'wufatw55050' }
];

function loadAdminAccounts() {
  try {
    const raw = sessionStorage.getItem(ADMIN_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* ignore malformed storage */ }
  return DEFAULT_ADMIN_ACCOUNTS.slice();
}

function saveAdminAccounts(list) {
  try {
    sessionStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(list));
  } catch (e) { /* storage unavailable, continue with in-memory only */ }
}

let ADMIN_ACCOUNTS = loadAdminAccounts();
let currentAdmin = null;

function applyAdminMode(username) {
  currentAdmin = username;
  document.body.classList.add('admin-mode');

  const loginBox = document.getElementById('admin-login-box');
  const panel = document.getElementById('admin-panel');
  const display = document.getElementById('admin-username-display');
  if (loginBox) loginBox.style.display = 'none';
  if (panel) panel.style.display = 'block';
  if (display) display.textContent = username;
  if (document.getElementById('admin-list-body')) renderAdminList();
}

function clearAdminMode() {
  currentAdmin = null;
  document.body.classList.remove('admin-mode');

  const loginBox = document.getElementById('admin-login-box');
  const panel = document.getElementById('admin-panel');
  if (loginBox) loginBox.style.display = 'block';
  if (panel) panel.style.display = 'none';
}

function adminLogin() {
  const uInput = document.getElementById('admin-user');
  const pInput = document.getElementById('admin-pass');
  const msg = document.getElementById('admin-msg');
  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value : '';

  const found = ADMIN_ACCOUNTS.find(a => a.username === u && a.password === p);

  if (found) {
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, found.username); } catch (e) { /* ignore */ }
    applyAdminMode(found.username);
    if (msg) msg.textContent = '';
  } else if (msg) {
    msg.textContent = '帳號或密碼錯誤，請重新輸入。';
  }
}

function adminLogout() {
  try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) { /* ignore */ }
  clearAdminMode();
  const uInput = document.getElementById('admin-user');
  const pInput = document.getElementById('admin-pass');
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
}

function renderAdminList() {
  const body = document.getElementById('admin-list-body');
  if (!body) return;
  body.innerHTML = '';
  ADMIN_ACCOUNTS.forEach(acc => {
    const tr = document.createElement('tr');

    const tdUser = document.createElement('td');
    tdUser.textContent = acc.username;

    const tdPass = document.createElement('td');
    tdPass.textContent = acc.password;

    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'right';
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn';
    delBtn.textContent = '刪除';
    delBtn.disabled = ADMIN_ACCOUNTS.length <= 1;
    delBtn.title = ADMIN_ACCOUNTS.length <= 1 ? '至少須保留一組管理員帳號' : '';
    delBtn.addEventListener('click', () => deleteAdminAccount(acc.username));
    tdAction.appendChild(delBtn);

    tr.appendChild(tdUser);
    tr.appendChild(tdPass);
    tr.appendChild(tdAction);
    body.appendChild(tr);
  });
}

function addAdminAccount() {
  const uInput = document.getElementById('new-admin-user');
  const pInput = document.getElementById('new-admin-pass');
  const msg = document.getElementById('new-admin-msg');
  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value.trim() : '';

  if (!msg) return;

  if (!u || !p) {
    msg.style.color = 'var(--danger)';
    msg.textContent = '請輸入新帳號與新密碼。';
    return;
  }
  if (ADMIN_ACCOUNTS.some(a => a.username === u)) {
    msg.style.color = 'var(--danger)';
    msg.textContent = '此帳號已存在，請使用其他帳號名稱。';
    return;
  }

  ADMIN_ACCOUNTS.push({ username: u, password: p });
  saveAdminAccounts(ADMIN_ACCOUNTS);
  renderAdminList();

  msg.style.color = 'var(--teal)';
  msg.textContent = `已新增管理員「${u}」。`;
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
}

function deleteAdminAccount(username) {
  if (ADMIN_ACCOUNTS.length <= 1) return;
  ADMIN_ACCOUNTS = ADMIN_ACCOUNTS.filter(a => a.username !== username);
  saveAdminAccounts(ADMIN_ACCOUNTS);
  renderAdminList();
}

// 頁面載入時，若同一瀏覽器工作階段已登入過，恢復管理者狀態
document.addEventListener('DOMContentLoaded', () => {
  let savedUser = null;
  try { savedUser = sessionStorage.getItem(ADMIN_SESSION_KEY); } catch (e) { /* ignore */ }
  if (savedUser && ADMIN_ACCOUNTS.some(a => a.username === savedUser)) {
    applyAdminMode(savedUser);
  }
});

// ====================== 表單預覽與送出 ======================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8SbiUGN59q0SjfJzL61EalPLrydfzyLN1tZx9WWokluj7rnhPVifJgHrrrUz1DOsM/exec';

let pendingSubmission = null;

// 將單一欄位的值轉為可讀文字
function fieldDisplayValue(el) {
  if (el.tagName === 'TEXTAREA') return el.value.trim();
  if (el.type === 'checkbox') return el.checked ? (el.dataset.value || '是') : '';
  return el.value.trim();
}

// 從表單面板中依 data-field 屬性擷取「欄位名稱：值」配對
// （取代舊版針對表格結構逐一解析的作法，改用明確標記，較不易因排版變動而出錯）
function extractDataFieldPairs(container) {
  const fieldOrder = [];
  const groups = new Map(); // fieldName -> { type, values: [] }

  container.querySelectorAll('[data-field]').forEach(el => {
    const name = el.dataset.field;
    if (!groups.has(name)) {
      groups.set(name, { checkbox: el.type === 'checkbox', values: [] });
      fieldOrder.push(name);
    }
    const group = groups.get(name);
    if (el.type === 'checkbox') {
      if (el.checked) group.values.push(el.dataset.value || '是');
    } else {
      const v = fieldDisplayValue(el);
      if (v) group.values.push(v);
    }
  });

  return fieldOrder.map(name => ({
    label: name,
    value: groups.get(name).values.join('、')
  }));
}

// 舊版函式名稱保留，內部統一改用 data-field 擷取邏輯，避免表格結構差異造成解析失敗
function extractLabelledTablePairs(container) {
  return extractDataFieldPairs(container);
}
function extractHeaderTablePairs(container) {
  return extractDataFieldPairs(container);
}
function cellPreviewValue(cell) {
  if (!cell) return '';
  const input = cell.querySelector('input[type="text"], textarea');
  return input ? input.value.trim() : cell.textContent.trim();
}
function nodeToPreviewText(node) {
  return node ? node.textContent.trim() : '';
}

function collectPreviewPairs(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return [];
  // 目前所有表單皆改用 data-field 標記欄位，統一擷取即可涵蓋各表單版型
  return extractDataFieldPairs(panel);
}

function openPreview(panelId, formTitle) {
  const pairs = collectPreviewPairs(panelId);
  pendingSubmission = { panelId, formTitle, pairs };

  const titleEl = document.getElementById('preview-title');
  const bodyEl = document.getElementById('preview-body');
  const statusEl = document.getElementById('submit-status');
  if (titleEl) titleEl.textContent = `${formTitle}　資料預覽`;
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'submit-status'; }

  if (bodyEl) {
    bodyEl.innerHTML = '';
    const filled = pairs.filter(p => p.value);
    if (!filled.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.className = 'preview-empty';
      td.textContent = '尚未填寫任何欄位，請先填寫表單內容再送出。';
      tr.appendChild(td);
      bodyEl.appendChild(tr);
    } else {
      filled.forEach(p => {
        const tr = document.createElement('tr');
        const tdK = document.createElement('td');
        tdK.className = 'pk';
        tdK.textContent = p.label;
        const tdV = document.createElement('td');
        tdV.className = 'pv';
        tdV.textContent = p.value;
        tr.appendChild(tdK);
        tr.appendChild(tdV);
        bodyEl.appendChild(tr);
      });
    }
  }

  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.add('open');
}

function closePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.remove('open');
  pendingSubmission = null;
}

async function confirmSubmit() {
  if (!pendingSubmission) return;
  const statusEl = document.getElementById('submit-status');
  const btn = document.getElementById('confirm-submit-btn');

  if (!pendingSubmission.pairs.some(p => p.value)) {
    if (statusEl) {
      statusEl.textContent = '請先填寫表單內容後再送出。';
      statusEl.className = 'submit-status err';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
  if (statusEl) { statusEl.textContent = '資料送出中，請稍候…'; statusEl.className = 'submit-status'; }

  const payload = {
    formTitle: pendingSubmission.formTitle,
    submittedAt: new Date().toISOString(),
    data: pendingSubmission.pairs.reduce((acc, p) => {
      acc[p.label] = p.value;
      return acc;
    }, {})
  };

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    // no-cors 模式下無法讀取回應內容，僅能假設請求已送達
    if (statusEl) {
      statusEl.textContent = '已送出，感謝您的填寫。請記得列印本表並簽章送交受理單位。';
      statusEl.className = 'submit-status ok';
    }
    if (btn) { btn.textContent = '已送出'; }
    setTimeout(closePreview, 2200);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '送出失敗，請確認網路連線後再試一次。';
      statusEl.className = 'submit-status err';
    }
    if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
  }
}

// 暴露給全域（讓 HTML onclick 可以呼叫）
window.printTab = printTab;
window.openPreview = openPreview;
window.closePreview = closePreview;
window.confirmSubmit = confirmSubmit;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.addAdminAccount = addAdminAccount;
window.deleteAdminAccount = deleteAdminAccount;
