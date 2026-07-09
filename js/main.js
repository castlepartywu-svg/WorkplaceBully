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
const ADMIN_ACCOUNTS = [
  { username: 'wufatw', password: 'wufatw55050' }
  // 可在此新增更多帳號
];

let currentAdmin = null;

function adminLogin() {
  const u = document.getElementById('admin-user').value.trim();
  const p = document.getElementById('admin-pass').value;
  const msg = document.getElementById('admin-msg');

  const found = ADMIN_ACCOUNTS.find(a => a.username === u && a.password === p);
  
  if (found) {
    currentAdmin = found.username;
    document.body.classList.add('admin-mode');
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('admin-username-display').textContent = currentAdmin;
    msg.textContent = '';
    renderAdminList();
  } else {
    msg.textContent = '帳號或密碼錯誤，請重新輸入。';
  }
}

function adminLogout() {
  currentAdmin = null;
  document.body.classList.remove('admin-mode');
  document.getElementById('admin-login-box').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
}

function renderAdminList() {
  // 實作管理員列表顯示（與原檔相同）
}

function addAdminAccount() {
  // 新增管理員功能
}

// ====================== 表單預覽與送出 ======================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8SbiUGN59q0SjfJzL61EalPLrydfzyLN1tZx9WWokluj7rnhPVifJgHrrrUz1DOsM/exec';

let pendingSubmission = null;

function nodeToPreviewText(node) { /* ... 完整轉換函式 */ }
function cellPreviewValue(cell) { /* ... */ }
function extractLabelledTablePairs(container) { /* ... */ }
function extractHeaderTablePairs(container) { /* ... */ }
function extractDataFieldPairs(container) { /* ... */ }

function collectPreviewPairs(panelId) {
  const panel = document.getElementById(panelId);
  let pairs = [];
  if (panelId === 'tab-proxy') {
    pairs = pairs.concat(extractHeaderTablePairs(panel));
  } else {
    pairs = pairs.concat(extractLabelledTablePairs(panel));
  }
  pairs = pairs.concat(extractDataFieldPairs(panel));
  return pairs;
}

function openPreview(panelId, formTitle) {
  const pairs = collectPreviewPairs(panelId);
  pendingSubmission = { panelId, formTitle, pairs };

  // 顯示預覽視窗（完整實作）
  document.getElementById('preview-overlay').classList.add('open');
  // ... 填入預覽表格 ...
}

function closePreview() {
  document.getElementById('preview-overlay').classList.remove('open');
  pendingSubmission = null;
}

async function confirmSubmit() {
  // Google Apps Script 送出功能
  if (!pendingSubmission) return;
  // ... 完整送出邏輯 ...
}

// 暴露給全域（讓 HTML onclick 可以呼叫）
window.printTab = printTab;
window.openPreview = openPreview;
window.closePreview = closePreview;
window.confirmSubmit = confirmSubmit;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.addAdminAccount = addAdminAccount;
