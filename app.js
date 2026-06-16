// ═══════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY   = "solo-business-budget-tracker-v2";
const LEGACY_KEY_V1 = "solo-business-budget-tracker-v1";
const DRAFT_KEY     = "solo-business-budget-draft-v2";
const EXPENSES_KEY  = "solo-business-expenses-v1";
const EXP_CATS_KEY  = "solo-business-expense-categories-v1";
const BIZ_CATS_KEY  = "budget-biz-cats-v1";
const HH_CATS_KEY   = "budget-hh-cats-v1";

// ═══════════════════════════════════════════════════════════
// DEFAULT CATEGORIES
// ═══════════════════════════════════════════════════════════
const DEFAULT_BIZ_CATS = [
  { id: "biz_vat",    name: "부가세 보관",     pct: 10 },
  { id: "biz_exp",    name: "사업경비",         pct: 25 },
  { id: "biz_tax",    name: "종소세 보관",      pct: 15 },
  { id: "biz_rsv",    name: "사업비상금",       pct:  5 },
  { id: "biz_salary", name: "내 월급 (→가계)", pct: 45 },
];

const DEFAULT_HH_CATS = [
  { id: "hh_fixed",   name: "고정지출",   pct: 30 },
  { id: "hh_living",  name: "생활비",     pct: 23 },
  { id: "hh_edu",     name: "자녀/교육",  pct: 12 },
  { id: "hh_medical", name: "보험/의료",  pct:  7 },
  { id: "hh_debt",    name: "대출상환",   pct: 15 },
  { id: "hh_savings", name: "저축/투자",  pct:  8 },
  { id: "hh_emerg",   name: "가계비상금", pct:  5 },
];

const DEFAULT_EXP_CATS = [
  "생활비", "고정지출", "자녀/교육", "보험/의료",
  "대출상환", "저축/비상금", "사업경비", "기타",
];

const METRIC_LABELS = {
  householdBudget: "가계예산",
  householdAlloc:  "가계 배분",
  actualExpense:   "실제 지출",
  hhBuffer:        "조정 여유분",
  businessIncome:  "사업수입",
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let records     = [];
let expenses    = [];
let expCats     = [];
let bizCats     = [];
let hhCats      = [];
let bizEditMode = false;
let hhEditMode  = false;

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonthString() {
  return todayString().slice(0, 7);
}

function toNum(v) {
  return Number(String(v ?? "").replaceAll(",", "")) || 0;
}

function fmt(v) {
  return `${Math.round(toNum(v)).toLocaleString("ko-KR")}원`;
}

function fmtInput(v) {
  const d = String(v ?? "").replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("ko-KR") : "";
}

function shortMoney(v) {
  const n = toNum(v);
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return Math.round(n).toLocaleString("ko-KR");
}

function escHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════
// LOAD / SAVE
// ═══════════════════════════════════════════════════════════
function loadAllData() {
  bizCats = readJson(BIZ_CATS_KEY, null);
  if (!Array.isArray(bizCats) || !bizCats.length) bizCats = DEFAULT_BIZ_CATS.map(c => ({ ...c }));

  hhCats = readJson(HH_CATS_KEY, null);
  if (!Array.isArray(hhCats) || !hhCats.length) hhCats = DEFAULT_HH_CATS.map(c => ({ ...c }));

  expCats = readJson(EXP_CATS_KEY, DEFAULT_EXP_CATS);
  if (!Array.isArray(expCats) || !expCats.length) expCats = [...DEFAULT_EXP_CATS];

  const stored = readJson(STORAGE_KEY, null);
  if (stored && Array.isArray(stored.records)) {
    records  = stored.records.map(migrateRecord);
    expenses = Array.isArray(stored.expenses) ? stored.expenses : readJson(EXPENSES_KEY, []);
    if (Array.isArray(stored.categories) && stored.categories.length) expCats = stored.categories;
    if (Array.isArray(stored.bizCats) && stored.bizCats.length) bizCats = stored.bizCats;
    if (Array.isArray(stored.hhCats) && stored.hhCats.length) hhCats = stored.hhCats;
    return;
  }

  const legacyRecords = readJson(LEGACY_KEY_V1, null);
  records  = Array.isArray(legacyRecords) ? legacyRecords.map(migrateRecord) : [];
  expenses = readJson(EXPENSES_KEY, []);
}

function migrateRecord(r) {
  if (r.bizAlloc || r.hhAlloc) return { ...r, id: r.id || uid() };
  // Migrate from old flat format
  return {
    id: r.id || uid(),
    month: r.month,
    businessIncome:  toNum(r.businessIncome),
    householdBudget: toNum(r.householdBudget),
    bizAlloc: {
      biz_vat:    toNum(r.taxReserve),
      biz_exp:    toNum(r.businessExpense),
      biz_tax:    0,
      biz_rsv:    0,
      biz_salary: toNum(r.ownerPay),
    },
    hhAlloc: {
      hh_fixed:   toNum(r.fixedCost),
      hh_living:  toNum(r.livingCost),
      hh_edu:     toNum(r.educationCost),
      hh_medical: toNum(r.medicalCost),
      hh_debt:    toNum(r.debtPayment),
      hh_savings: toNum(r.saving),
      hh_emerg:   0,
    },
    memo: r.memo || "",
  };
}

function saveAllData() {
  records.sort((a, b) => a.month.localeCompare(b.month));
  expenses.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    records, expenses, categories: expCats, bizCats, hhCats,
  }));
  localStorage.setItem(BIZ_CATS_KEY,  JSON.stringify(bizCats));
  localStorage.setItem(HH_CATS_KEY,   JSON.stringify(hhCats));
  localStorage.setItem(EXP_CATS_KEY,  JSON.stringify(expCats));
}

// ═══════════════════════════════════════════════════════════
// COMPUTED VALUES
// ═══════════════════════════════════════════════════════════
function sumBizAlloc(record) {
  return Object.values(record.bizAlloc || {}).reduce((s, v) => s + toNum(v), 0);
}

function sumHhAlloc(record) {
  return Object.values(record.hhAlloc || {}).reduce((s, v) => s + toNum(v), 0);
}

function hhBuffer(record) {
  return toNum(record.householdBudget) - sumHhAlloc(record);
}

function bizBuffer(record) {
  return toNum(record.businessIncome) - sumBizAlloc(record);
}

function actualExpenseForMonth(month) {
  return expenses
    .filter(e => e.expenseDate?.slice(0, 7) === month)
    .reduce((s, e) => s + toNum(e.expenseAmount), 0);
}

// ═══════════════════════════════════════════════════════════
// DYNAMIC FORM FIELDS — RENDER
// ═══════════════════════════════════════════════════════════
function renderBizCatFields(allocData = {}) {
  const container = $("bizCatFields");
  container.innerHTML = bizCats.map(cat => `
    <div class="cat-row">
      <div class="cat-info">
        <span class="cat-name">${escHtml(cat.name)}</span>
        <span class="cat-pct-badge">${cat.pct}%</span>
      </div>
      <input type="text" inputmode="numeric" class="money-input cat-amount"
             data-cat-id="${cat.id}" data-section="biz"
             value="${fmtInput(allocData[cat.id] ?? 0)}" placeholder="0" />
    </div>
  `).join("");
  updateBizPctBadge();
}

function renderHhCatFields(allocData = {}) {
  const container = $("hhCatFields");
  container.innerHTML = hhCats.map(cat => `
    <div class="cat-row">
      <div class="cat-info">
        <span class="cat-name">${escHtml(cat.name)}</span>
        <span class="cat-pct-badge">${cat.pct}%</span>
      </div>
      <input type="text" inputmode="numeric" class="money-input cat-amount"
             data-cat-id="${cat.id}" data-section="hh"
             value="${fmtInput(allocData[cat.id] ?? 0)}" placeholder="0" />
    </div>
  `).join("");
  updateHhPctBadge();
}

function getBizAllocFromForm() {
  const alloc = {};
  document.querySelectorAll("#bizCatFields .cat-amount").forEach(input => {
    alloc[input.dataset.catId] = toNum(input.value);
  });
  return alloc;
}

function getHhAllocFromForm() {
  const alloc = {};
  document.querySelectorAll("#hhCatFields .cat-amount").forEach(input => {
    alloc[input.dataset.catId] = toNum(input.value);
  });
  return alloc;
}

function updateBizPctBadge() {
  const sum = bizCats.reduce((s, c) => s + (Number(c.pct) || 0), 0);
  const el = $("bizPctSum");
  el.textContent = `합계 ${sum}%`;
  el.className = "pct-badge " + (sum === 100 ? "ok" : sum > 100 ? "over" : "under");
}

function updateHhPctBadge() {
  const sum = hhCats.reduce((s, c) => s + (Number(c.pct) || 0), 0);
  const el = $("hhPctSum");
  el.textContent = `합계 ${sum}%`;
  el.className = "pct-badge " + (sum === 100 ? "ok" : sum > 100 ? "over" : "under");
}

// ═══════════════════════════════════════════════════════════
// AUTO-DISTRIBUTE (하향식 %)
// ═══════════════════════════════════════════════════════════
function distributeBiz() {
  const total = toNum($("businessIncome").value);
  bizCats.forEach(cat => {
    const input = document.querySelector(`#bizCatFields .cat-amount[data-cat-id="${cat.id}"]`);
    if (input) input.value = fmtInput(Math.round(total * (Number(cat.pct) || 0) / 100));
  });
  updateComputedStrip();
}

function distributeHh() {
  const total = toNum($("householdBudget").value);
  hhCats.forEach(cat => {
    const input = document.querySelector(`#hhCatFields .cat-amount[data-cat-id="${cat.id}"]`);
    if (input) input.value = fmtInput(Math.round(total * (Number(cat.pct) || 0) / 100));
  });
  updateComputedStrip();
}

// ═══════════════════════════════════════════════════════════
// COMPUTED STRIP (live)
// ═══════════════════════════════════════════════════════════
function updateComputedStrip() {
  const bizAlloc  = getBizAllocFromForm();
  const hhAlloc   = getHhAllocFromForm();
  const bizTotal  = Object.values(bizAlloc).reduce((s, v) => s + v, 0);
  const hhTotal   = Object.values(hhAlloc).reduce((s, v) => s + v, 0);
  const bizIncome = toNum($("businessIncome").value);
  const hhBudget  = toNum($("householdBudget").value);
  const hhBuf     = hhBudget - hhTotal;
  const bizBuf    = bizIncome - bizTotal;

  $("businessAllocated").textContent = fmt(bizTotal);
  $("householdAllocated").textContent = fmt(hhTotal);

  const hhBufEl = $("householdBuffer");
  hhBufEl.textContent = fmt(hhBuf);
  hhBufEl.className = "alloc-gap" + (hhBuf < 0 ? " danger" : hhBuf > 0 ? " positive" : "");

  const bizBufEl = $("businessBuffer");
  bizBufEl.textContent = fmt(bizBuf);
  bizBufEl.className = "alloc-gap" + (bizBuf < 0 ? " danger" : bizBuf > 0 ? " positive" : "");
}

// ═══════════════════════════════════════════════════════════
// EDIT MODE — CATEGORY CRUD
// ═══════════════════════════════════════════════════════════
function renderBizEditPanel() {
  $("bizCatEditor").innerHTML = bizCats.map((cat, i) => `
    <div class="cat-edit-row">
      <input type="text" class="cat-edit-name" value="${escHtml(cat.name)}" placeholder="항목명" />
      <input type="number" class="cat-edit-pct pct-input" value="${cat.pct}" min="0" max="100" placeholder="%" />
      <span class="pct-label">%</span>
      <button type="button" class="del-cat-btn" data-biz-del="${i}" title="삭제">✕</button>
    </div>
  `).join("");
}

function renderHhEditPanel() {
  $("hhCatEditor").innerHTML = hhCats.map((cat, i) => `
    <div class="cat-edit-row">
      <input type="text" class="cat-edit-name" value="${escHtml(cat.name)}" placeholder="항목명" />
      <input type="number" class="cat-edit-pct pct-input" value="${cat.pct}" min="0" max="100" placeholder="%" />
      <span class="pct-label">%</span>
      <button type="button" class="del-cat-btn" data-hh-del="${i}" title="삭제">✕</button>
    </div>
  `).join("");
}

function flushBizEdits() {
  document.querySelectorAll("#bizCatEditor .cat-edit-row").forEach((row, i) => {
    const name = row.querySelector(".cat-edit-name").value.trim();
    const pct  = Number(row.querySelector(".cat-edit-pct").value) || 0;
    if (bizCats[i]) { bizCats[i].name = name || bizCats[i].name; bizCats[i].pct = pct; }
  });
  localStorage.setItem(BIZ_CATS_KEY, JSON.stringify(bizCats));
}

function flushHhEdits() {
  document.querySelectorAll("#hhCatEditor .cat-edit-row").forEach((row, i) => {
    const name = row.querySelector(".cat-edit-name").value.trim();
    const pct  = Number(row.querySelector(".cat-edit-pct").value) || 0;
    if (hhCats[i]) { hhCats[i].name = name || hhCats[i].name; hhCats[i].pct = pct; }
  });
  localStorage.setItem(HH_CATS_KEY, JSON.stringify(hhCats));
}

function toggleBizEdit() {
  if (!bizEditMode) {
    bizEditMode = true;
    renderBizEditPanel();
    $("bizEditPanel").classList.remove("hidden");
    $("bizEditBtn").textContent = "✓ 완료";
    $("bizEditBtn").classList.add("active");
  } else {
    bizEditMode = false;
    flushBizEdits();
    $("bizEditPanel").classList.add("hidden");
    $("bizEditBtn").textContent = "✎ 편집";
    $("bizEditBtn").classList.remove("active");
    const cur = getBizAllocFromForm();
    renderBizCatFields(cur);
    updateBizPctBadge();
  }
}

function toggleHhEdit() {
  if (!hhEditMode) {
    hhEditMode = true;
    renderHhEditPanel();
    $("hhEditPanel").classList.remove("hidden");
    $("hhEditBtn").textContent = "✓ 완료";
    $("hhEditBtn").classList.add("active");
  } else {
    hhEditMode = false;
    flushHhEdits();
    $("hhEditPanel").classList.add("hidden");
    $("hhEditBtn").textContent = "✎ 편집";
    $("hhEditBtn").classList.remove("active");
    const cur = getHhAllocFromForm();
    renderHhCatFields(cur);
    updateHhPctBadge();
  }
}

// ═══════════════════════════════════════════════════════════
// FORM FILL / READ
// ═══════════════════════════════════════════════════════════
function readFormRecord() {
  const bizAlloc = getBizAllocFromForm();
  const hhAlloc  = getHhAllocFromForm();
  bizCats.forEach(c => { if (!(c.id in bizAlloc)) bizAlloc[c.id] = 0; });
  hhCats.forEach(c => { if (!(c.id in hhAlloc))  hhAlloc[c.id]  = 0; });
  return {
    id:              $("editingId").value || uid(),
    month:           $("month").value.trim(),
    businessIncome:  toNum($("businessIncome").value),
    householdBudget: toNum($("householdBudget").value),
    bizAlloc,
    hhAlloc,
    memo: $("memo").value.trim(),
  };
}

function fillForm(record) {
  $("editingId").value        = record.id || "";
  $("month").value            = record.month || currentMonthString();
  $("businessIncome").value   = fmtInput(record.businessIncome);
  $("householdBudget").value  = fmtInput(record.householdBudget);
  $("memo").value             = record.memo || "";
  renderBizCatFields(record.bizAlloc || {});
  renderHhCatFields(record.hhAlloc   || {});
  updateComputedStrip();
}

// ═══════════════════════════════════════════════════════════
// DRAFT
// ═══════════════════════════════════════════════════════════
function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(readFormRecord()));
  $("draftStatus").textContent = "임시저장됨";
}

function restoreDraftOrDefault() {
  const draft = readJson(DRAFT_KEY, null);
  if (draft) {
    fillForm(draft);
    $("draftStatus").textContent = "이전 임시저장 내용을 불러왔습니다.";
  } else {
    resetForm({ keepDraft: true });
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  $("draftStatus").textContent = "저장 완료.";
}

function resetForm({ keepDraft = false } = {}) {
  $("editingId").value       = "";
  $("month").value           = currentMonthString();
  $("businessIncome").value  = "";
  $("householdBudget").value = "";
  $("memo").value            = "";
  if (!keepDraft) localStorage.removeItem(DRAFT_KEY);
  $("draftStatus").textContent = "입력 내용은 자동 임시저장됩니다.";
  renderBizCatFields({});
  renderHhCatFields({});
  updateComputedStrip();
}

// ═══════════════════════════════════════════════════════════
// EXPENSE FORM
// ═══════════════════════════════════════════════════════════
function resetExpenseForm() {
  $("expenseEditingId").value = "";
  $("expenseDate").value      = todayString();
  $("expenseArea").value      = "가계";
  $("expenseAmount").value    = "";
  $("expenseDetail").value    = "";
  $("expenseMethod").value    = "체크카드";
  $("expenseMemo").value      = "";
  renderCategoryOptions(expCats[0] || "");
}

function renderCategoryOptions(selected) {
  const sel = $("expenseCategory");
  if (!sel) return;
  const s = selected ?? sel.value;
  const opts = [...expCats];
  if (s && !opts.includes(s)) opts.push(s);
  sel.innerHTML = opts.map(c =>
    `<option value="${escHtml(c)}"${c === s ? " selected" : ""}>${escHtml(c)}</option>`
  ).join("");
}

function renderCategoryManager() {
  const wrap = $("categoryList");
  const used = new Set(expenses.map(e => e.expenseCategory).filter(Boolean));
  wrap.innerHTML = expCats.map(c => `
    <div class="category-chip">
      <span>${escHtml(c)}${used.has(c) ? " · 사용중" : ""}</span>
      <button class="text-button" type="button" data-category-delete="${escHtml(c)}">✕</button>
    </div>
  `).join("");
}

function addExpenseCategory() {
  const input = $("newCategoryName");
  const next  = input.value.trim();
  if (!next) return;
  if (!expCats.includes(next)) {
    expCats.push(next);
    saveAllData();
    renderCategoryManager();
  }
  input.value = "";
  renderCategoryOptions(next);
}

function deleteExpenseCategory(cat) {
  if (!expCats.includes(cat)) return;
  if (expCats.length <= 1) { alert("분류는 최소 1개가 필요합니다."); return; }
  const isUsed = expenses.some(e => e.expenseCategory === cat);
  const msg = isUsed
    ? `"${cat}" 분류는 기존 지출에 사용 중입니다.\n앞으로 입력 목록에서만 제거됩니다. 계속할까요?`
    : `"${cat}" 분류를 삭제할까요?`;
  if (!confirm(msg)) return;
  const cur = $("expenseCategory").value;
  expCats = expCats.filter(c => c !== cat);
  saveAllData();
  renderCategoryOptions(cur === cat ? expCats[0] : cur);
  renderCategoryManager();
}

// ═══════════════════════════════════════════════════════════
// SUMMARY BAR
// ═══════════════════════════════════════════════════════════
function renderSummary() {
  const latest     = records.at(-1);
  const month      = selectedAnalysisMonth();
  const totalDebt  = records.reduce((s, r) => s + toNum((r.hhAlloc || {})["hh_debt"]), 0);

  $("latestHousehold").textContent    = latest ? fmt(latest.householdBudget) : "0원";
  $("latestBuffer").textContent       = latest ? fmt(hhBuffer(latest)) : "0원";
  $("selectedExpenseTotal").textContent = fmt(actualExpenseForMonth(month));
  $("totalDebt").textContent          = fmt(totalDebt);
}

// ═══════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════
function renderBudgetTable() {
  const body = $("recordsBody");
  if (!records.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="8">아직 입력한 월별 기록이 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = records.map(r => {
    const actual = actualExpenseForMonth(r.month);
    const hhA    = sumHhAlloc(r);
    const diff   = toNum(r.householdBudget) - actual;
    const buf    = hhBuffer(r);
    return `
      <tr>
        <td>${r.month}</td>
        <td>${fmt(r.businessIncome)}</td>
        <td>${fmt(r.householdBudget)}</td>
        <td>${fmt(hhA)}</td>
        <td>${fmt(actual)}</td>
        <td class="${diff < 0 ? "danger" : diff > 0 ? "positive" : ""}">${fmt(diff)}</td>
        <td class="${buf < 0 ? "danger" : buf > 0 ? "positive" : ""}">${fmt(buf)}</td>
        <td class="td-actions">
          <button class="text-button" type="button" data-edit="${r.id}">수정</button>
          <button class="text-button danger-text" type="button" data-delete="${r.id}">삭제</button>
        </td>
      </tr>
    `;
  }).join("");
}

function selectedLedgerMonth() {
  return $("ledgerMonthFilter").value || currentMonthString();
}

function selectedAnalysisMonth() {
  return $("expenseMonthFilter").value || currentMonthString();
}

function renderExpensesTable() {
  const body     = $("expensesBody");
  const month    = selectedLedgerMonth();
  const filtered = expenses.filter(e => e.expenseDate?.slice(0, 7) === month);
  if (!filtered.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="8">선택한 월의 지출 내역이 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(e => `
    <tr>
      <td>${e.expenseDate}</td>
      <td>${e.expenseArea}</td>
      <td>${e.expenseCategory}</td>
      <td class="text-left">${escHtml(e.expenseDetail)}</td>
      <td>${e.expenseMethod}</td>
      <td>${fmt(e.expenseAmount)}</td>
      <td class="text-left">${escHtml(e.expenseMemo || "")}</td>
      <td class="td-actions">
        <button class="text-button" type="button" data-expense-edit="${e.id}">수정</button>
        <button class="text-button danger-text" type="button" data-expense-delete="${e.id}">삭제</button>
      </td>
    </tr>
  `).join("");
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════════
function renderCategorySummary() {
  const wrap     = $("categorySummary");
  const month    = selectedAnalysisMonth();
  const filtered = expenses.filter(e => e.expenseDate?.slice(0, 7) === month);
  const total    = filtered.reduce((s, e) => s + toNum(e.expenseAmount), 0);

  const byKey = filtered.reduce((m, e) => {
    const k = `${e.expenseArea} · ${e.expenseCategory}`;
    m[k] = (m[k] || 0) + toNum(e.expenseAmount);
    return m;
  }, {});

  const rows = Object.entries(byKey).sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    wrap.innerHTML = `<p class="empty-note">선택한 월에 입력된 지출이 없습니다.</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="summary-total">
      <span>${month} 실제 지출 합계</span>
      <strong>${fmt(total)}</strong>
    </div>
    ${rows.map(([label, value]) => {
      const pct = total ? Math.round(value / total * 100) : 0;
      return `
        <div class="category-row">
          <div class="category-row-top">
            <span>${label}</span>
            <strong>${fmt(value)}</strong>
          </div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <small>${pct}%</small>
        </div>
      `;
    }).join("")}
  `;
}

function metricValue(r, metric) {
  if (metric === "householdAlloc") return sumHhAlloc(r);
  if (metric === "actualExpense")  return actualExpenseForMonth(r.month);
  if (metric === "hhBuffer")       return hhBuffer(r);
  return toNum(r[metric]);
}

function renderChart() {
  const svg    = $("trendChart");
  const metric = $("chartMetric").value;
  const W = 720, H = 300;
  const pad = { top: 24, right: 24, bottom: 46, left: 72 };
  const pw  = W - pad.left - pad.right;
  const ph  = H - pad.top  - pad.bottom;

  if (!records.length) {
    svg.innerHTML = `<text x="360" y="150" text-anchor="middle" fill="#94a3b8" font-size="14">월별 데이터를 입력하면 차트가 표시됩니다.</text>`;
    $("chartLegend").textContent = "";
    return;
  }

  const vals  = records.map(r => metricValue(r, metric));
  const min   = Math.min(0, ...vals);
  const max   = Math.max(...vals, 1);
  const range = max - min || 1;
  const xStep = records.length > 1 ? pw / (records.length - 1) : 0;

  const points = records.map((r, i) => ({
    x: pad.left + (records.length > 1 ? i * xStep : pw / 2),
    y: pad.top + ph - ((metricValue(r, metric) - min) / range) * ph,
    record: r,
  }));

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const y = pad.top + ph * ratio;
    const v = max - range * ratio;
    return `
      <line x1="${pad.left}" x2="${W - pad.right}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="4 2"/>
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${shortMoney(v)}</text>
    `;
  }).join("");

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const dots = points.map(({ x, y, record }) => `
    <circle cx="${x}" cy="${y}" r="5" fill="#0284c7" stroke="#fff" stroke-width="2">
      <title>${record.month}: ${fmt(metricValue(record, metric))}</title>
    </circle>
  `).join("");

  const labels = points.map(({ x, record }, i) => `
    <text x="${x}" y="${H - 14}" text-anchor="middle" fill="#94a3b8" font-size="11">
      ${records.length > 8 && i % 2 ? "" : record.month.slice(2)}
    </text>
  `).join("");

  svg.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f8fafc" rx="8"/>
    ${gridLines}
    <line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${H - pad.bottom}" stroke="#cbd5e1"/>
    <line x1="${pad.left}" x2="${W - pad.right}" y1="${H - pad.bottom}" y2="${H - pad.bottom}" stroke="#cbd5e1"/>
    <path d="${path}" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${labels}
  `;

  const latest = records.at(-1);
  $("chartLegend").textContent = `${METRIC_LABELS[metric] || metric} 최근값: ${fmt(metricValue(latest, metric))}`;
}

// ═══════════════════════════════════════════════════════════
// RECORD EDIT / DELETE
// ═══════════════════════════════════════════════════════════
function editRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  fillForm(record);
  saveDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector('[data-tab="budget"]').click();
}

function deleteRecord(id) {
  const r = records.find(r => r.id === id);
  if (!r) return;
  if (!confirm(`${r.month} 예산 기록을 삭제할까요?\n복구할 수 없습니다.`)) return;
  records = records.filter(r => r.id !== id);
  render();
}

function editExpense(id) {
  const e = expenses.find(e => e.id === id);
  if (!e) return;
  $("expenseEditingId").value = id;
  renderCategoryOptions(e.expenseCategory);
  $("expenseDate").value      = e.expenseDate;
  $("expenseArea").value      = e.expenseArea;
  $("expenseAmount").value    = fmtInput(e.expenseAmount);
  $("expenseDetail").value    = e.expenseDetail;
  $("expenseMethod").value    = e.expenseMethod;
  $("expenseMemo").value      = e.expenseMemo || "";
  $("expenseForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteExpense(id) {
  const e = expenses.find(e => e.id === id);
  if (!e) return;
  if (!confirm(`"${e.expenseDetail}" 지출을 삭제할까요?`)) return;
  expenses = expenses.filter(e => e.id !== id);
  render();
}

// ═══════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════
function dl(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  dl(
    "budget-tracker-data.json",
    JSON.stringify({ records, expenses, categories: expCats, bizCats, hhCats, exportedAt: new Date().toISOString() }, null, 2),
    "application/json"
  );
}

function makeCsv(headers, rows) {
  return [headers, ...rows]
    .map(row => row.map(c => `"${String(c ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function exportBudgetCsv() {
  const hhNames = hhCats.map(c => c.name);
  const headers = ["월", "사업수입", "가계예산", ...hhNames, "가계배분", "실제지출", "예산-실제", "가계여유분", "메모"];
  const rows = records.map(r => {
    const actual  = actualExpenseForMonth(r.month);
    const hhA     = sumHhAlloc(r);
    const hhVals  = hhCats.map(c => (r.hhAlloc || {})[c.id] || 0);
    return [r.month, r.businessIncome, r.householdBudget, ...hhVals, hhA, actual, toNum(r.householdBudget) - actual, hhBuffer(r), r.memo || ""];
  });
  dl("budget-records.csv", `﻿${makeCsv(headers, rows)}`, "text/csv;charset=utf-8");
}

function exportExpenseCsv() {
  const headers = ["날짜", "영역", "분류", "내용", "결제수단", "가격", "메모"];
  const rows    = expenses.map(e => [e.expenseDate, e.expenseArea, e.expenseCategory, e.expenseDetail, e.expenseMethod, e.expenseAmount, e.expenseMemo || ""]);
  dl("expenses.csv", `﻿${makeCsv(headers, rows)}`, "text/csv;charset=utf-8");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) {
        records = data.map(r => ({ ...migrateRecord(r), id: r.id || uid() }));
        expenses = [];
      } else {
        records  = Array.isArray(data.records)  ? data.records.map(r => ({ ...migrateRecord(r), id: r.id || uid() })) : [];
        expenses = Array.isArray(data.expenses) ? data.expenses.map(e => ({ ...e, id: e.id || uid() })) : [];
        if (Array.isArray(data.categories) && data.categories.length) expCats = data.categories;
        if (Array.isArray(data.bizCats)    && data.bizCats.length)    bizCats = data.bizCats;
        if (Array.isArray(data.hhCats)     && data.hhCats.length)     hhCats  = data.hhCats;
      }
      renderBizCatFields({});
      renderHhCatFields({});
      renderCategoryOptions();
      render();
      alert("데이터를 가져왔습니다.");
    } catch {
      alert("가져오기 파일을 확인해주세요.");
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  saveAllData();
  renderSummary();
  renderBudgetTable();
  renderExpensesTable();
  renderCategoryManager();
  renderCategorySummary();
  renderChart();
}

// ═══════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════
function bindEvents() {
  // Money input: format as you type
  document.addEventListener("input", e => {
    if (!e.target.classList.contains("money-input")) return;
    const raw = e.target.value.replace(/[^\d]/g, "");
    e.target.value = raw ? Number(raw).toLocaleString("ko-KR") : "";
  });

  // Tabs
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-button").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.tabPanel === tab));
    });
  });

  // Auto-distribute on parent input change
  $("businessIncome").addEventListener("input",  () => { distributeBiz(); saveDraft(); });
  $("householdBudget").addEventListener("input", () => { distributeHh();  saveDraft(); });

  // Cat amount changes → update strip + draft
  $("bizCatFields").addEventListener("input", () => { updateComputedStrip(); saveDraft(); });
  $("hhCatFields").addEventListener("input",  () => { updateComputedStrip(); saveDraft(); });

  // Other form fields → save draft
  $("month").addEventListener("change", saveDraft);
  $("memo").addEventListener("input",   saveDraft);

  // Budget form submit
  $("monthForm").addEventListener("submit", e => {
    e.preventDefault();
    const next = readFormRecord();
    if (!next.month) { alert("월을 선택해주세요."); return; }
    const idx = records.findIndex(r => r.id === next.id || r.month === next.month);
    if (idx >= 0) { next.id = records[idx].id; records[idx] = next; }
    else records.push(next);
    clearDraft();
    render();
    resetForm();
  });

  $("resetFormBtn").addEventListener("click", () => resetForm());

  // Budget table actions
  $("recordsBody").addEventListener("click", e => {
    if (e.target.dataset.edit)   editRecord(e.target.dataset.edit);
    if (e.target.dataset.delete) deleteRecord(e.target.dataset.delete);
  });

  // Edit mode toggles
  $("bizEditBtn").addEventListener("click", toggleBizEdit);
  $("hhEditBtn").addEventListener("click",  toggleHhEdit);

  // Live pct badge update + auto-recalculate amounts while editing
  $("bizCatEditor").addEventListener("input", e => {
    flushBizEdits();
    updateBizPctBadge();
    if (e.target.classList.contains("cat-edit-pct") && toNum($("businessIncome").value) > 0) distributeBiz();
  });
  $("hhCatEditor").addEventListener("input", e => {
    flushHhEdits();
    updateHhPctBadge();
    if (e.target.classList.contains("cat-edit-pct") && toNum($("householdBudget").value) > 0) distributeHh();
  });

  // Delete cat row buttons
  $("bizCatEditor").addEventListener("click", e => {
    const idx = e.target.dataset.bizDel;
    if (idx === undefined) return;
    flushBizEdits();
    bizCats.splice(Number(idx), 1);
    renderBizEditPanel();
    updateBizPctBadge();
    localStorage.setItem(BIZ_CATS_KEY, JSON.stringify(bizCats));
  });
  $("hhCatEditor").addEventListener("click", e => {
    const idx = e.target.dataset.hhDel;
    if (idx === undefined) return;
    flushHhEdits();
    hhCats.splice(Number(idx), 1);
    renderHhEditPanel();
    updateHhPctBadge();
    localStorage.setItem(HH_CATS_KEY, JSON.stringify(hhCats));
  });

  // Add biz cat
  $("addBizCatBtn").addEventListener("click", () => {
    const name = $("newBizCatName").value.trim();
    const pct  = Number($("newBizCatPct").value) || 0;
    if (!name) return;
    flushBizEdits();
    bizCats.push({ id: `biz_${uid().slice(0, 8)}`, name, pct });
    $("newBizCatName").value = "";
    $("newBizCatPct").value  = "";
    renderBizEditPanel();
    updateBizPctBadge();
    localStorage.setItem(BIZ_CATS_KEY, JSON.stringify(bizCats));
  });
  $("newBizCatName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("addBizCatBtn").click(); } });

  // Add hh cat
  $("addHhCatBtn").addEventListener("click", () => {
    const name = $("newHhCatName").value.trim();
    const pct  = Number($("newHhCatPct").value) || 0;
    if (!name) return;
    flushHhEdits();
    hhCats.push({ id: `hh_${uid().slice(0, 8)}`, name, pct });
    $("newHhCatName").value = "";
    $("newHhCatPct").value  = "";
    renderHhEditPanel();
    updateHhPctBadge();
    localStorage.setItem(HH_CATS_KEY, JSON.stringify(hhCats));
  });
  $("newHhCatName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("addHhCatBtn").click(); } });

  // Expense form
  $("expenseForm").addEventListener("submit", e => {
    e.preventDefault();
    const next = {
      id:              $("expenseEditingId").value || uid(),
      expenseDate:     $("expenseDate").value,
      expenseArea:     $("expenseArea").value,
      expenseCategory: $("expenseCategory").value,
      expenseDetail:   $("expenseDetail").value.trim(),
      expenseMethod:   $("expenseMethod").value,
      expenseAmount:   toNum($("expenseAmount").value),
      expenseMemo:     $("expenseMemo").value.trim(),
    };
    const idx = expenses.findIndex(e => e.id === next.id);
    if (idx >= 0) expenses[idx] = next;
    else expenses.push(next);
    const month = next.expenseDate.slice(0, 7);
    $("ledgerMonthFilter").value  = month;
    $("expenseMonthFilter").value = month;
    render();
    resetExpenseForm();
  });

  $("resetExpenseBtn").addEventListener("click", resetExpenseForm);

  $("expensesBody").addEventListener("click", e => {
    if (e.target.dataset.expenseEdit)   editExpense(e.target.dataset.expenseEdit);
    if (e.target.dataset.expenseDelete) deleteExpense(e.target.dataset.expenseDelete);
  });

  // Expense categories
  $("addCategoryBtn").addEventListener("click", addExpenseCategory);
  $("newCategoryName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addExpenseCategory(); } });
  $("categoryList").addEventListener("click", e => {
    if (e.target.dataset.categoryDelete) deleteExpenseCategory(e.target.dataset.categoryDelete);
  });

  // Analysis
  $("chartMetric").addEventListener("change", renderChart);
  $("expenseMonthFilter").addEventListener("change", () => { renderCategorySummary(); renderSummary(); });

  // Ledger month filter
  $("ledgerMonthFilter").addEventListener("change", renderExpensesTable);

  // Backup
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("downloadCsvBtn").addEventListener("click", exportBudgetCsv);
  $("downloadExpenseCsvBtn").addEventListener("click", exportExpenseCsv);
  $("importJsonInput").addEventListener("change", e => importJson(e.target.files[0]));
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
loadAllData();
renderBizCatFields({});
renderHhCatFields({});
renderCategoryOptions();
bindEvents();

const initMonth = records.at(-1)?.month || currentMonthString();
$("expenseMonthFilter").value = initMonth;
$("ledgerMonthFilter").value  = initMonth;

restoreDraftOrDefault();
resetExpenseForm();
render();
