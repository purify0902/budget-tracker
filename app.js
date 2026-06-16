const STORAGE_KEY = "solo-business-budget-tracker-v2";
const LEGACY_STORAGE_KEY = "solo-business-budget-tracker-v1";
const DRAFT_KEY = "solo-business-budget-draft-v1";
const EXPENSES_KEY = "solo-business-expenses-v1";

const budgetFields = [
  "month",
  "businessIncome",
  "householdBudget",
  "taxReserve",
  "businessExpense",
  "ownerPay",
  "fixedCost",
  "livingCost",
  "educationCost",
  "medicalCost",
  "debtPayment",
  "saving",
  "memo",
];

const expenseFields = [
  "expenseDate",
  "expenseArea",
  "expenseCategory",
  "expenseDetail",
  "expenseMethod",
  "expenseAmount",
  "expenseMemo",
];

const moneyFields = budgetFields.filter((field) => !["month", "memo"].includes(field));

const metricLabels = {
  householdBudget: "가계예산",
  householdSpend: "가계 예산 배분",
  actualExpense: "실제 지출",
  buffer: "조정 여유분",
  debtPayment: "대출상환",
  saving: "저축/비상금",
  businessIncome: "사업수입",
  taxReserve: "세금보관",
};

const $ = (id) => document.getElementById(id);

let records = [];
let expenses = [];

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonthString() {
  return todayString().slice(0, 7);
}

function toNumber(value) {
  return Number(value) || 0;
}

function formatMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString("ko-KR")}원`;
}

function shortMoney(value) {
  const number = toNumber(value);
  const abs = Math.abs(number);
  if (abs >= 100000000) return `${(number / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만`;
  return Math.round(number).toLocaleString("ko-KR");
}

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadAllData() {
  const stored = readJson(STORAGE_KEY, null);
  if (stored && Array.isArray(stored.records)) {
    records = stored.records;
    expenses = Array.isArray(stored.expenses) ? stored.expenses : readJson(EXPENSES_KEY, []);
    return;
  }

  const legacyRecords = readJson(LEGACY_STORAGE_KEY, null);
  records = Array.isArray(legacyRecords) ? legacyRecords : [];
  expenses = readJson(EXPENSES_KEY, []);
}

function saveAllData() {
  records.sort((a, b) => a.month.localeCompare(b.month));
  expenses.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, expenses }));
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
}

function householdSpend(record) {
  return (
    toNumber(record.fixedCost) +
    toNumber(record.livingCost) +
    toNumber(record.educationCost) +
    toNumber(record.medicalCost) +
    toNumber(record.debtPayment) +
    toNumber(record.saving)
  );
}

function businessAllocated(record) {
  return toNumber(record.taxReserve) + toNumber(record.businessExpense) + toNumber(record.ownerPay);
}

function householdBuffer(record) {
  return toNumber(record.householdBudget) - householdSpend(record);
}

function actualExpenseForMonth(month) {
  return expenses
    .filter((expense) => expense.expenseDate?.slice(0, 7) === month)
    .reduce((sum, expense) => sum + toNumber(expense.expenseAmount), 0);
}

function currentBudgetFormRecord() {
  const record = {};
  budgetFields.forEach((field) => {
    record[field] = moneyFields.includes(field) ? toNumber($(field).value) : $(field).value.trim();
  });
  record.id = $("editingId").value || uid();
  return record;
}

function currentExpenseFormRecord() {
  const expense = {};
  expenseFields.forEach((field) => {
    expense[field] = field === "expenseAmount" ? toNumber($(field).value) : $(field).value.trim();
  });
  expense.id = $("expenseEditingId").value || uid();
  return expense;
}

function saveDraft() {
  const draft = currentBudgetFormRecord();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  const status = $("draftStatus");
  status.textContent = "입력 중인 내용이 임시저장되었습니다.";
}

function loadDraft() {
  return readJson(DRAFT_KEY, null);
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  $("draftStatus").textContent = "저장 완료. 임시저장을 비웠습니다.";
}

function fillBudgetForm(record) {
  budgetFields.forEach((field) => {
    if ($(field)) $(field).value = record[field] ?? "";
  });
  $("editingId").value = record.id || "";
  updateComputedStrip();
}

function resetForm({ keepDraft = false } = {}) {
  $("editingId").value = "";
  $("monthForm").reset();
  $("month").value = currentMonthString();
  if (!keepDraft) localStorage.removeItem(DRAFT_KEY);
  $("draftStatus").textContent = "입력 내용은 자동 임시저장됩니다.";
  updateComputedStrip();
}

function restoreDraftOrDefault() {
  const draft = loadDraft();
  if (draft) {
    fillBudgetForm(draft);
    $("draftStatus").textContent = "이전에 입력하던 임시저장 내용을 불러왔습니다.";
  } else {
    resetForm({ keepDraft: true });
  }
}

function resetExpenseForm() {
  $("expenseEditingId").value = "";
  $("expenseForm").reset();
  $("expenseDate").value = todayString();
  $("expenseArea").value = "가계";
  $("expenseCategory").value = "생활비";
  $("expenseMethod").value = "체크카드";
}

function updateComputedStrip() {
  const record = currentBudgetFormRecord();
  $("businessAllocated").textContent = formatMoney(businessAllocated(record));
  $("householdAllocated").textContent = formatMoney(householdSpend(record));
  const buffer = householdBuffer(record);
  const bufferEl = $("householdBuffer");
  bufferEl.textContent = formatMoney(buffer);
  bufferEl.className = buffer < 0 ? "danger" : buffer > 0 ? "positive" : "";
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  fillBudgetForm(record);
  saveDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  records = records.filter((item) => item.id !== id);
  render();
}

function editExpense(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;
  $("expenseEditingId").value = id;
  expenseFields.forEach((field) => {
    $(field).value = expense[field] ?? "";
  });
  $("expenseForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteExpense(id) {
  expenses = expenses.filter((item) => item.id !== id);
  render();
}

function selectedExpenseMonth() {
  return $("expenseMonthFilter").value || currentMonthString();
}

function renderSummary() {
  const latest = records.at(-1);
  const month = selectedExpenseMonth();
  const totalDebt = records.reduce((sum, record) => sum + toNumber(record.debtPayment), 0);
  $("latestHousehold").textContent = latest ? formatMoney(latest.householdBudget) : "0원";
  $("latestBuffer").textContent = latest ? formatMoney(householdBuffer(latest)) : "0원";
  $("selectedExpenseTotal").textContent = formatMoney(actualExpenseForMonth(month));
  $("totalDebt").textContent = formatMoney(totalDebt);
}

function renderBudgetTable() {
  const body = $("recordsBody");
  if (!records.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="12">아직 입력한 월별 기록이 없습니다.</td></tr>`;
    return;
  }

  body.innerHTML = records
    .map((record) => {
      const actual = actualExpenseForMonth(record.month);
      const actualDiff = toNumber(record.householdBudget) - actual;
      const diffClass = actualDiff < 0 ? "danger" : actualDiff > 0 ? "positive" : "";
      return `
        <tr>
          <td>${record.month}</td>
          <td>${formatMoney(record.businessIncome)}</td>
          <td>${formatMoney(record.taxReserve)}</td>
          <td>${formatMoney(record.businessExpense)}</td>
          <td>${formatMoney(record.ownerPay)}</td>
          <td>${formatMoney(record.householdBudget)}</td>
          <td>${formatMoney(householdSpend(record))}</td>
          <td>${formatMoney(actual)}</td>
          <td class="${diffClass}">${formatMoney(actualDiff)}</td>
          <td>${formatMoney(record.debtPayment)}</td>
          <td>${formatMoney(record.saving)}</td>
          <td>
            <button class="text-button" type="button" data-edit="${record.id}">수정</button>
            <button class="text-button" type="button" data-delete="${record.id}">삭제</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderExpensesTable() {
  const body = $("expensesBody");
  const month = selectedExpenseMonth();
  const filtered = expenses.filter((expense) => expense.expenseDate?.slice(0, 7) === month);

  if (!filtered.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="8">선택한 월의 지출 내역이 없습니다.</td></tr>`;
    return;
  }

  body.innerHTML = filtered
    .map(
      (expense) => `
        <tr>
          <td>${expense.expenseDate}</td>
          <td>${expense.expenseArea}</td>
          <td>${expense.expenseCategory}</td>
          <td class="text-left">${escapeHtml(expense.expenseDetail)}</td>
          <td>${expense.expenseMethod}</td>
          <td>${formatMoney(expense.expenseAmount)}</td>
          <td class="text-left">${escapeHtml(expense.expenseMemo || "")}</td>
          <td>
            <button class="text-button" type="button" data-expense-edit="${expense.id}">수정</button>
            <button class="text-button" type="button" data-expense-delete="${expense.id}">삭제</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderCategorySummary() {
  const wrap = $("categorySummary");
  const month = selectedExpenseMonth();
  const filtered = expenses.filter((expense) => expense.expenseDate?.slice(0, 7) === month);
  const total = filtered.reduce((sum, expense) => sum + toNumber(expense.expenseAmount), 0);

  const byCategory = filtered.reduce((map, expense) => {
    const key = `${expense.expenseArea} · ${expense.expenseCategory}`;
    map[key] = (map[key] || 0) + toNumber(expense.expenseAmount);
    return map;
  }, {});

  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  if (!rows.length) {
    wrap.innerHTML = `<p class="empty-note">선택한 월에 입력된 지출이 없습니다.</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="summary-total">
      <span>${month} 실제 지출 합계</span>
      <strong>${formatMoney(total)}</strong>
    </div>
    ${rows
      .map(([label, value]) => {
        const percent = total ? Math.round((value / total) * 100) : 0;
        return `
          <div class="category-row">
            <div class="category-row-top">
              <span>${label}</span>
              <strong>${formatMoney(value)}</strong>
            </div>
            <div class="bar"><i style="width: ${percent}%"></i></div>
            <small>${percent}%</small>
          </div>
        `;
      })
      .join("")}
  `;
}

function metricValue(record, metric) {
  if (metric === "householdSpend") return householdSpend(record);
  if (metric === "actualExpense") return actualExpenseForMonth(record.month);
  if (metric === "buffer") return householdBuffer(record);
  return toNumber(record[metric]);
}

function renderChart() {
  const svg = $("trendChart");
  const metric = $("chartMetric").value;
  const width = 720;
  const height = 300;
  const pad = { top: 24, right: 24, bottom: 46, left: 72 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  if (!records.length) {
    svg.innerHTML = `<text x="360" y="150" text-anchor="middle" fill="#667085">월별 데이터를 입력하면 차트가 표시됩니다.</text>`;
    $("chartLegend").textContent = "";
    return;
  }

  const values = records.map((record) => metricValue(record, metric));
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const xStep = records.length > 1 ? plotW / (records.length - 1) : 0;
  const points = records.map((record, index) => {
    const x = pad.left + (records.length > 1 ? index * xStep : plotW / 2);
    const y = pad.top + plotH - ((metricValue(record, metric) - min) / range) * plotH;
    return { x, y, record };
  });

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = pad.top + plotH * ratio;
    const value = max - range * ratio;
    return `
      <line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" stroke="#e5e7eb" />
      <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="#667085" font-size="11">${shortMoney(value)}</text>
    `;
  }).join("");

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const dots = points
    .map(
      ({ x, y, record }) => `
        <circle cx="${x}" cy="${y}" r="4.5" fill="#0f766e">
          <title>${record.month}: ${formatMoney(metricValue(record, metric))}</title>
        </circle>
      `,
    )
    .join("");

  const labels = points
    .map(
      ({ x, record }, index) => `
        <text x="${x}" y="${height - 18}" text-anchor="middle" fill="#667085" font-size="11">
          ${records.length > 8 && index % 2 ? "" : record.month.slice(2)}
        </text>
      `,
    )
    .join("");

  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
    ${gridLines}
    <line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${height - pad.bottom}" stroke="#cbd5e1" />
    <line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" stroke="#cbd5e1" />
    <path d="${path}" fill="none" stroke="#0f766e" stroke-width="3" />
    ${dots}
    ${labels}
  `;

  const latest = records.at(-1);
  $("chartLegend").textContent = `${metricLabels[metric]} 최근값: ${formatMoney(metricValue(latest, metric))}`;
}

function render() {
  saveAllData();
  renderSummary();
  renderBudgetTable();
  renderExpensesTable();
  renderCategorySummary();
  renderChart();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  download(
    "budget-tracker-data.json",
    JSON.stringify({ records, expenses, exportedAt: new Date().toISOString() }, null, 2),
    "application/json",
  );
}

function makeCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function exportBudgetCsv() {
  const headers = [
    "월",
    "사업수입",
    "세금보관",
    "경비",
    "월급이체",
    "가계예산",
    "예산배분",
    "실제지출",
    "예산-실제",
    "대출상환",
    "저축비상금",
    "메모",
  ];
  const rows = records.map((record) => [
    record.month,
    record.businessIncome,
    record.taxReserve,
    record.businessExpense,
    record.ownerPay,
    record.householdBudget,
    householdSpend(record),
    actualExpenseForMonth(record.month),
    toNumber(record.householdBudget) - actualExpenseForMonth(record.month),
    record.debtPayment,
    record.saving,
    record.memo || "",
  ]);
  download("budget-tracker-budget-records.csv", `\ufeff${makeCsv(headers, rows)}`, "text/csv;charset=utf-8");
}

function exportExpenseCsv() {
  const headers = ["날짜", "영역", "분류", "내용", "결제수단", "가격", "메모"];
  const rows = expenses.map((expense) => [
    expense.expenseDate,
    expense.expenseArea,
    expense.expenseCategory,
    expense.expenseDetail,
    expense.expenseMethod,
    expense.expenseAmount,
    expense.expenseMemo || "",
  ]);
  download("budget-tracker-expenses.csv", `\ufeff${makeCsv(headers, rows)}`, "text/csv;charset=utf-8");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (Array.isArray(imported)) {
        records = imported.map((record) => ({ ...record, id: record.id || uid() }));
        expenses = [];
      } else {
        records = Array.isArray(imported.records)
          ? imported.records.map((record) => ({ ...record, id: record.id || uid() }))
          : [];
        expenses = Array.isArray(imported.expenses)
          ? imported.expenses.map((expense) => ({ ...expense, id: expense.id || uid() }))
          : [];
      }
      render();
      alert("데이터를 가져왔습니다.");
    } catch {
      alert("가져오기 파일을 확인해주세요.");
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.tabPanel === tab);
      });
    });
  });

  $("monthForm").addEventListener("input", () => {
    updateComputedStrip();
    saveDraft();
  });

  $("monthForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const next = currentBudgetFormRecord();
    const existingIndex = records.findIndex((record) => record.id === next.id || record.month === next.month);
    if (existingIndex >= 0) {
      next.id = records[existingIndex].id;
      records[existingIndex] = next;
    } else {
      records.push(next);
    }
    clearDraft();
    render();
    resetForm();
  });

  $("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const next = currentExpenseFormRecord();
    const existingIndex = expenses.findIndex((expense) => expense.id === next.id);
    if (existingIndex >= 0) {
      expenses[existingIndex] = next;
    } else {
      expenses.push(next);
    }
    $("expenseMonthFilter").value = next.expenseDate.slice(0, 7);
    render();
    resetExpenseForm();
  });

  $("recordsBody").addEventListener("click", (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) editRecord(editId);
    if (deleteId) deleteRecord(deleteId);
  });

  $("expensesBody").addEventListener("click", (event) => {
    const editId = event.target.dataset.expenseEdit;
    const deleteId = event.target.dataset.expenseDelete;
    if (editId) editExpense(editId);
    if (deleteId) deleteExpense(deleteId);
  });

  $("resetFormBtn").addEventListener("click", () => resetForm());
  $("resetExpenseBtn").addEventListener("click", resetExpenseForm);
  $("chartMetric").addEventListener("change", renderChart);
  $("expenseMonthFilter").addEventListener("change", render);
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("downloadCsvBtn").addEventListener("click", exportBudgetCsv);
  $("downloadExpenseCsvBtn").addEventListener("click", exportExpenseCsv);
  $("importJsonInput").addEventListener("change", (event) => importJson(event.target.files[0]));
}

loadAllData();
bindEvents();
$("expenseMonthFilter").value = records.at(-1)?.month || currentMonthString();
restoreDraftOrDefault();
resetExpenseForm();
render();
