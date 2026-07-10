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

// 新增申請：清空指定表單面板中所有已填寫的欄位，開始下一份新申請
function resetForm(panelId, formTitle) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const fields = panel.querySelectorAll('[data-field]');
  const hasContent = Array.from(fields).some(el =>
    (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value.trim()
  );

  if (hasContent && !confirm(`確定要清除「${formTitle || '本表單'}」目前已填寫的所有內容，開始新的申請嗎？此動作無法復原。`)) {
    return;
  }

  fields.forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else {
      el.value = '';
    }
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ====================== Google 表單後端（Apps Script） ======================
// 部署 apps-script/Code.gs 後，把產生的網址貼在這裡（結尾是 /exec）。
// 部署完成前，此網址為佔位字串，所有雲端功能會自動退回「僅本機暫存」模式。
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8SbiUGN59q0SjfJzL61EalPLrydfzyLN1tZx9WWokluj7rnhPVifJgHrrrUz1DOsM/exec';

function isBackendConfigured() {
  return /^https:\/\/script\.google\.com\/macros\//.test(APPS_SCRIPT_URL);
}

// GET 請求（例如讀取管理員名單）
async function backendGet(action, params) {
  if (!isBackendConfigured()) return { ok: false, offline: true };
  const qs = new URLSearchParams(Object.assign({ action: action }, params || {}));
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?${qs.toString()}`, { method: 'GET' });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// POST 請求（送出表單 / 新增管理員 / 刪除管理員 / 登入驗證）
// 用 text/plain 送出可避免瀏覽器發出 CORS 預檢請求，Apps Script 端再自行 JSON.parse。
async function backendPost(action, data) {
  if (!isBackendConfigured()) return { ok: false, offline: true };
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ====================== 管理者登入 ======================
// 角色：ROLE_ADMIN 可管理帳號＋查閱案件；ROLE_SUPERVISOR（主管）僅能查閱申訴案件，
// 完全不會去讀取或顯示管理員帳號密碼名單。
const ROLE_ADMIN = 'admin';
const ROLE_SUPERVISOR = 'supervisor';

const ADMIN_SESSION_KEY = 'bw_admin_session';
const ADMIN_ROLE_KEY = 'bw_admin_role';
const ADMIN_BRANCH_KEY = 'bw_admin_branch';
const ADMIN_CACHE_KEY = 'bw_admin_accounts_cache';
const DEFAULT_ADMIN_ACCOUNTS = [
  { username: 'wufatw', password: 'wufatw55050', role: ROLE_ADMIN, branch: '' }
];

function loadCachedAdminAccounts() {
  try {
    const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* ignore malformed storage */ }
  return DEFAULT_ADMIN_ACCOUNTS.slice();
}

function cacheAdminAccounts(list) {
  try { sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

let ADMIN_ACCOUNTS = loadCachedAdminAccounts();
let currentAdmin = null;
let currentAdminRole = null;
let currentAdminBranch = ''; // '' = 不分校（可查看全部）；'同安' / '莊敬' = 僅查看該校案件

// 向 Google 表單重新抓取最新的管理員名單，抓不到時就沿用本機快取（離線／尚未部署時的備援）
// 注意：只有 admin 角色登入時才會呼叫這個函式，主管帳號的瀏覽器完全不會要求這份含密碼的名單。
async function refreshAdminAccounts() {
  const result = await backendGet('listAdmins');
  if (result && result.ok && Array.isArray(result.accounts) && result.accounts.length) {
    ADMIN_ACCOUNTS = result.accounts;
    cacheAdminAccounts(ADMIN_ACCOUNTS);
  }
  if (document.getElementById('admin-list-body')) renderAdminList();
  return ADMIN_ACCOUNTS;
}

function applyAdminMode(username, role, branch) {
  currentAdmin = username;
  currentAdminRole = role === ROLE_SUPERVISOR ? ROLE_SUPERVISOR : ROLE_ADMIN;
  currentAdminBranch = branch || '';

  document.body.classList.add('admin-mode');

  const loginBox = document.getElementById('admin-login-box');
  const panel = document.getElementById('admin-panel');
  const display = document.getElementById('admin-username-display');
  const roleDisplay = document.getElementById('admin-role-display');
  const accountPanel = document.getElementById('account-mgmt-panel');
  if (loginBox) loginBox.style.display = 'none';
  if (panel) panel.style.display = 'block';
  if (display) display.textContent = username;
  if (roleDisplay) {
    const roleLabel = currentAdminRole === ROLE_SUPERVISOR ? '主管' : '管理員';
    roleDisplay.textContent = currentAdminBranch ? `${roleLabel}・${currentAdminBranch}校` : roleLabel;
  }

  // 主管角色：完全隱藏帳號管理區塊，且從不呼叫 listAdmins（不下載密碼名單）／通知設定
  if (accountPanel) accountPanel.style.display = currentAdminRole === ROLE_ADMIN ? 'block' : 'none';
  if (currentAdminRole === ROLE_ADMIN) {
    if (document.getElementById('admin-list-body')) refreshAdminAccounts();
    if (document.getElementById('notify-email')) loadNotifySettings();
  }

  if (document.getElementById('cases-body')) loadCases();
}

function clearAdminMode() {
  currentAdmin = null;
  currentAdminRole = null;
  currentAdminBranch = '';
  document.body.classList.remove('admin-mode');

  const loginBox = document.getElementById('admin-login-box');
  const panel = document.getElementById('admin-panel');
  if (loginBox) loginBox.style.display = 'block';
  if (panel) panel.style.display = 'none';
}

async function adminLogin() {
  const uInput = document.getElementById('admin-user');
  const pInput = document.getElementById('admin-pass');
  const msg = document.getElementById('admin-msg');
  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value : '';

  if (msg) msg.textContent = isBackendConfigured() ? '登入驗證中…' : '';

  let ok = false;
  let role = ROLE_ADMIN;
  let branch = '';

  if (isBackendConfigured()) {
    const result = await backendPost('login', { username: u, password: p });
    ok = !!(result && result.ok);
    if (ok) {
      role = result.role === ROLE_SUPERVISOR ? ROLE_SUPERVISOR : ROLE_ADMIN;
      branch = result.branch || '';
    }
  } else {
    // 尚未部署雲端後端時，退回比對本機快取帳號，讓網站在設定期間仍可操作
    const matched = ADMIN_ACCOUNTS.find(a => a.username === u && a.password === p);
    ok = !!matched;
    if (matched) {
      role = matched.role === ROLE_SUPERVISOR ? ROLE_SUPERVISOR : ROLE_ADMIN;
      branch = matched.branch || '';
    }
  }

  if (ok) {
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, u);
      sessionStorage.setItem(ADMIN_ROLE_KEY, role);
      sessionStorage.setItem(ADMIN_BRANCH_KEY, branch);
    } catch (e) { /* ignore */ }
    applyAdminMode(u, role, branch);
    if (msg) msg.textContent = '';
  } else if (msg) {
    msg.textContent = '帳號或密碼錯誤，請重新輸入。';
  }
}

function adminLogout() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_ROLE_KEY);
    sessionStorage.removeItem(ADMIN_BRANCH_KEY);
  } catch (e) { /* ignore */ }
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

    const tdRole = document.createElement('td');
    tdRole.textContent = acc.role === ROLE_SUPERVISOR ? '主管' : '管理員';

    const tdBranch = document.createElement('td');
    tdBranch.textContent = acc.branch || '不分校';

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
    tr.appendChild(tdRole);
    tr.appendChild(tdBranch);
    tr.appendChild(tdAction);
    body.appendChild(tr);
  });

  const note = document.getElementById('admin-list-note');
  if (note) {
    note.textContent = isBackendConfigured()
      ? '（此名單已同步儲存於 Google 表單）'
      : '（尚未連接 Google 表單後端，目前僅暫存於本機瀏覽器）';
  }
}

async function addAdminAccount() {
  const uInput = document.getElementById('new-admin-user');
  const pInput = document.getElementById('new-admin-pass');
  const rInput = document.getElementById('new-admin-role');
  const bInput = document.getElementById('new-admin-branch');
  const msg = document.getElementById('new-admin-msg');
  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value.trim() : '';
  const role = (rInput && rInput.value === ROLE_SUPERVISOR) ? ROLE_SUPERVISOR : ROLE_ADMIN;
  const branch = bInput ? bInput.value : '';

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

  msg.style.color = '#75808a';
  msg.textContent = '新增中…';

  if (isBackendConfigured()) {
    const result = await backendPost('addAdmin', { username: u, password: p, role: role, branch: branch });
    if (!result || !result.ok) {
      msg.style.color = 'var(--danger)';
      msg.textContent = (result && result.error) || '新增失敗，請稍後再試。';
      return;
    }
    await refreshAdminAccounts();
  } else {
    ADMIN_ACCOUNTS.push({ username: u, password: p, role: role, branch: branch });
    cacheAdminAccounts(ADMIN_ACCOUNTS);
    renderAdminList();
  }

  const branchNote = branch ? `（${branch}校）` : '';
  msg.style.color = 'var(--teal)';
  msg.textContent = `已新增${role === ROLE_SUPERVISOR ? '主管' : '管理員'}「${u}」${branchNote}。`;
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
  if (rInput) rInput.value = ROLE_ADMIN;
  if (bInput) bInput.value = '';
}

async function deleteAdminAccount(username) {
  if (ADMIN_ACCOUNTS.length <= 1) return;

  const target = ADMIN_ACCOUNTS.find(a => a.username === username);
  const remainingAdmins = ADMIN_ACCOUNTS.filter(a => (a.role || ROLE_ADMIN) === ROLE_ADMIN && a.username !== username);
  if (target && (target.role || ROLE_ADMIN) === ROLE_ADMIN && remainingAdmins.length === 0) {
    alert('至少須保留一組「管理員」角色帳號，否則將無法管理帳號。');
    return;
  }

  if (isBackendConfigured()) {
    const result = await backendPost('deleteAdmin', { username: username });
    if (!result || !result.ok) {
      alert((result && result.error) || '刪除失敗，請稍後再試。');
      return;
    }
    await refreshAdminAccounts();
  } else {
    ADMIN_ACCOUNTS = ADMIN_ACCOUNTS.filter(a => a.username !== username);
    cacheAdminAccounts(ADMIN_ACCOUNTS);
    renderAdminList();
  }
}

// ====================== 新案件通知設定（僅管理員角色可見／可用） ======================
async function loadNotifySettings() {
  const input = document.getElementById('notify-email');
  const msg = document.getElementById('notify-settings-msg');
  if (!input) return;

  if (!isBackendConfigured()) {
    if (msg) msg.textContent = '尚未連接 Google 表單後端，暫時無法讀取通知設定。';
    return;
  }

  const result = await backendGet('getSettings');
  if (result && result.ok && typeof result.notifyEmail === 'string') {
    input.value = result.notifyEmail;
  }
}

async function saveNotifySettings() {
  const input = document.getElementById('notify-email');
  const msg = document.getElementById('notify-settings-msg');
  if (!input || !msg) return;

  const email = input.value.trim();
  if (email) {
    const parts = email.split(',').map(s => s.trim()).filter(Boolean);
    const invalid = parts.find(p => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    if (invalid) {
      msg.style.color = 'var(--danger)';
      msg.textContent = `「${invalid}」不是有效的電子郵件格式。`;
      return;
    }
  }

  if (!isBackendConfigured()) {
    msg.style.color = 'var(--danger)';
    msg.textContent = '尚未連接 Google 表單後端，無法儲存通知設定。';
    return;
  }

  msg.style.color = '#75808a';
  msg.textContent = '儲存中…';

  const result = await backendPost('updateSettings', { notifyEmail: email });
  if (!result || !result.ok) {
    msg.style.color = 'var(--danger)';
    msg.textContent = (result && result.error) || '儲存失敗，請稍後再試。';
    return;
  }

  msg.style.color = 'var(--teal)';
  msg.textContent = email
    ? '已儲存，新申請案件送出時會自動寄信通知此信箱。'
    : '已清空，新申請案件送出時將不會寄送通知信。';
}

// ====================== 申訴案件瀏覽 ======================
let CASES_CACHE = [];

// 依表單類別猜出「申請人」欄位（每種表單的姓名欄位命名不同）
function guessApplicantName(data) {
  const priority = ['申訴人姓名', '委任人姓名', '受任人姓名', '委任代理人姓名'];
  for (const key of priority) {
    if (data[key]) return data[key];
  }
  const fallbackKey = Object.keys(data).find(k => k.indexOf('姓名') !== -1 && k.indexOf('被') === -1);
  return fallbackKey && data[fallbackKey] ? data[fallbackKey] : '（未填寫姓名）';
}

// 把表單完整標題濃縮成簡短類別標籤
function shortFormTag(formTitle) {
  if (!formTitle) return '未分類';
  if (formTitle.indexOf('委任') !== -1) return '委任書';
  if (formTitle.indexOf('撤回') !== -1) return '撤回書';
  if (formTitle.indexOf('申訴') !== -1) return '申訴書';
  return formTitle;
}

function formatSubmittedAt(iso) {
  if (!iso) return '（無時間資訊）';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-TW', { hour12: false });
}

async function loadCases() {
  const body = document.getElementById('cases-body');
  const note = document.getElementById('cases-note');
  if (!body) return;

  if (!isBackendConfigured()) {
    body.innerHTML = '';
    if (note) note.textContent = '尚未連接 Google 表單後端，暫時無法讀取申訴案件。';
    return;
  }

  if (note) note.textContent = '讀取中…';
  // 若目前登入者是被限定校別的主管，向後端要求只回傳該校別（或未分類）的案件
  const params = (currentAdminRole === ROLE_SUPERVISOR && currentAdminBranch)
    ? { branch: currentAdminBranch }
    : {};
  const result = await backendGet('listSubmissions', params);

  if (!result || !result.ok || !Array.isArray(result.submissions)) {
    if (note) note.textContent = (result && result.error) || '讀取失敗，請點選「重新整理」再試一次。';
    return;
  }

  CASES_CACHE = result.submissions;
  renderCasesTable();
}

function renderCasesTable() {
  const body = document.getElementById('cases-body');
  const note = document.getElementById('cases-note');
  if (!body) return;

  body.innerHTML = '';

  if (!CASES_CACHE.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'preview-empty';
    td.textContent = '目前尚無任何申訴案件紀錄。';
    tr.appendChild(td);
    body.appendChild(tr);
    if (note) note.textContent = '';
    return;
  }

  CASES_CACHE.forEach((item, index) => {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.style.padding = '7px 4px';
    tdTime.style.borderBottom = '1px solid var(--line)';
    tdTime.textContent = formatSubmittedAt(item.submittedAt);

    const tdType = document.createElement('td');
    tdType.style.padding = '7px 4px';
    tdType.style.borderBottom = '1px solid var(--line)';
    tdType.textContent = shortFormTag(item.formTitle);

    const tdBranch = document.createElement('td');
    tdBranch.style.padding = '7px 4px';
    tdBranch.style.borderBottom = '1px solid var(--line)';
    tdBranch.textContent = (item.data && item.data['校別']) || '—';

    const tdName = document.createElement('td');
    tdName.style.padding = '7px 4px';
    tdName.style.borderBottom = '1px solid var(--line)';
    tdName.textContent = guessApplicantName(item.data || {});

    const tdAction = document.createElement('td');
    tdAction.style.padding = '7px 4px';
    tdAction.style.borderBottom = '1px solid var(--line)';
    tdAction.style.textAlign = 'right';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'mini-btn view';
    viewBtn.textContent = '查看完整內容';
    viewBtn.addEventListener('click', () => openCaseDetail(index));
    tdAction.appendChild(viewBtn);

    tr.appendChild(tdTime);
    tr.appendChild(tdType);
    tr.appendChild(tdBranch);
    tr.appendChild(tdName);
    tr.appendChild(tdAction);
    body.appendChild(tr);
  });

  if (note) note.textContent = `共 ${CASES_CACHE.length} 筆案件（資料來源：Google 表單）`;
}

function openCaseDetail(index) {
  const item = CASES_CACHE[index];
  if (!item) return;

  const titleEl = document.getElementById('case-detail-title');
  const bodyEl = document.getElementById('case-detail-body');
  if (titleEl) {
    titleEl.textContent = `${shortFormTag(item.formTitle)}　${guessApplicantName(item.data || {})}　（${formatSubmittedAt(item.submittedAt)}）`;
  }

  if (bodyEl) {
    bodyEl.innerHTML = '';
    const entries = Object.entries(item.data || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (!entries.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.className = 'preview-empty';
      td.textContent = '此筆案件沒有已填寫的欄位資料。';
      tr.appendChild(td);
      bodyEl.appendChild(tr);
    } else {
      entries.forEach(([label, value]) => {
        const tr = document.createElement('tr');
        const tdK = document.createElement('td');
        tdK.className = 'pk';
        tdK.textContent = label;
        const tdV = document.createElement('td');
        tdV.className = 'pv';
        tdV.textContent = value;
        tr.appendChild(tdK);
        tr.appendChild(tdV);
        bodyEl.appendChild(tr);
      });
    }
  }

  const overlay = document.getElementById('case-detail-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeCaseDetail() {
  const overlay = document.getElementById('case-detail-overlay');
  if (overlay) overlay.classList.remove('open');
}

// 頁面載入時：若同一瀏覽器工作階段已登入過，恢復管理者狀態；並嘗試從 Google 表單同步最新管理員名單
document.addEventListener('DOMContentLoaded', () => {
  let savedUser = null;
  let savedRole = null;
  let savedBranch = null;
  try {
    savedUser = sessionStorage.getItem(ADMIN_SESSION_KEY);
    savedRole = sessionStorage.getItem(ADMIN_ROLE_KEY);
    savedBranch = sessionStorage.getItem(ADMIN_BRANCH_KEY);
  } catch (e) { /* ignore */ }
  // 登入時已經過後端驗證，這裡直接信任工作階段即可；
  // 主管角色不會在此觸發 refreshAdminAccounts（見 applyAdminMode）。
  if (savedUser) {
    applyAdminMode(savedUser, savedRole, savedBranch);
  }
});

// ====================== 表單預覽與送出 ======================
let pendingSubmission = null;

// 將單一欄位的值轉為可讀文字
function fieldDisplayValue(el) {
  if (el.tagName === 'TEXTAREA') return el.value.trim();
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.dataset.value || '是') : '';
  return el.value.trim();
}

// 從表單面板中依 data-field 屬性擷取「欄位名稱：值」配對
// （改用明確標記，較不易因排版變動而出錯；checkbox 與 radio 都視為選項式欄位）
function extractDataFieldPairs(container) {
  const fieldOrder = [];
  const groups = new Map(); // fieldName -> { choice: bool, values: [] }

  container.querySelectorAll('[data-field]').forEach(el => {
    const name = el.dataset.field;
    const isChoice = el.type === 'checkbox' || el.type === 'radio';
    if (!groups.has(name)) {
      groups.set(name, { choice: isChoice, values: [] });
      fieldOrder.push(name);
    }
    const group = groups.get(name);
    if (isChoice) {
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

// 依「申訴人身分別」推算所屬校別（同安／莊敬／其他），寫入案件記錄的「校別」欄位
function deriveBranchFromIdentity(identity) {
  if (!identity) return '';
  if (identity.indexOf('同安') !== -1) return '同安';
  if (identity.indexOf('莊敬') !== -1) return '莊敬';
  return '其他';
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
  const pairs = extractDataFieldPairs(panel);

  // 申訴書有「申訴人身分別」欄位時，額外附加一個推算出的「校別」欄位，
  // 讓案件記錄與管理者的校別過濾都能直接使用。
  const identityPair = pairs.find(p => p.label === '申訴人身分別');
  if (identityPair && identityPair.value) {
    pairs.push({ label: '校別', value: deriveBranchFromIdentity(identityPair.value) });
  }

  return pairs;
}

function openPreview(panelId, formTitle) {
  const pairs = collectPreviewPairs(panelId);
  pendingSubmission = { panelId, formTitle, pairs };

  const titleEl = document.getElementById('preview-title');
  const bodyEl = document.getElementById('preview-body');
  const statusEl = document.getElementById('submit-status');
  const btn = document.getElementById('confirm-submit-btn');
  if (titleEl) titleEl.textContent = `${formTitle}　資料預覽`;
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'submit-status'; }
  if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }

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

  if (!isBackendConfigured()) {
    if (statusEl) {
      statusEl.textContent = '尚未連接 Google 表單後端，暫時無法送出（請完成 Apps Script 部署後再試）。';
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

  const result = await backendPost('submitForm', payload);

  if (result && result.ok) {
    if (statusEl) {
      statusEl.textContent = '已送出，感謝您的填寫。請記得列印本表並簽章送交受理單位。';
      statusEl.className = 'submit-status ok';
    }
    if (btn) { btn.textContent = '已送出'; }
    setTimeout(closePreview, 2200);
  } else {
    if (statusEl) {
      statusEl.textContent = (result && result.error) || '送出失敗，請確認網路連線後再試一次。';
      statusEl.className = 'submit-status err';
    }
    if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
  }
}

// 暴露給全域（讓 HTML onclick 可以呼叫）
window.printTab = printTab;
window.resetForm = resetForm;
window.openPreview = openPreview;
window.closePreview = closePreview;
window.confirmSubmit = confirmSubmit;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.addAdminAccount = addAdminAccount;
window.deleteAdminAccount = deleteAdminAccount;
window.loadCases = loadCases;
window.openCaseDetail = openCaseDetail;
window.closeCaseDetail = closeCaseDetail;
window.saveNotifySettings = saveNotifySettings;
