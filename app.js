const STORAGE_KEY = "solo-business-budget-tracker-v1";

const fields = [
  "month",
  "salaryIncome",
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

const moneyFields = fields.filter((field) => !["month", "memo"].includes(field));

const metricLabels = {
  householdBudget: "가계예산",
  householdSpend: "가계 지출",
  buffer: "조정 여유분",
  debtPayment: "대출상환",
  saving: "저축/비상금",
  businessIncome: "사업수입",
  taxReserve: "세금보관",
};

const $ = (id) => document.getElementById(id);

let records = loadRecords();

function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [
      {
        id: crypto.randomUUID(),
        month: "2026-06",
        salaryIncome: 2500000,
        businessIncome: 1000000,
        householdBudget: 3000000,
        taxReserve: 250000,
        businessExpense: 250000,
        ownerPay: 500000,
        fixedCost: 800000,
        livingCost: 750000,
        educationCost: 650000,
        medicalCost: 200000,
        debtPayment: 400000,
        saving: 200000,
        memo: "시작 예산",
      },
    ];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecords() {
  records.sort((a, b) => a.month.localeCompare(b.month));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function formatMoney(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function toNumber(value) {
  return Number(value) || 0;
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

function currentFormRecord() {
  const record = {};
  fields.forEach((field) => {
    record[field] = moneyFields.includes(field) ? toNumber($(field).value) : $(field).value.trim();
  });
  record.id = $("editingId").value || crypto.randomUUID();
  return record;
}

function setDefaultsFromBusinessIncome() {
  const businessIncome = toNumber($("businessIncome").value);
  if (!$("taxReserve").value) $("taxReserve").value = Math.round(businessIncome * 0.25);
  if (!$("businessExpense").value) $("businessExpense").value = Math.round(businessIncome * 0.25);
  if (!$("ownerPay").value) $("ownerPay").value = Math.round(businessIncome * 0.5);
}

function updateComputedStrip() {
  const record = currentFormRecord();
  $("businessAllocated").textContent = formatMoney(businessAllocated(record));
  $("householdAllocated").textContent = formatMoney(householdSpend(record));
  const buffer = householdBuffer(record);
  const bufferEl = $("householdBuffer");
  bufferEl.textContent = formatMoney(buffer);
  bufferEl.className = buffer < 0 ? "danger" : buffer > 0 ? "positive" : "";
}

function resetForm() {
  $("editingId").value = "";
  $("monthForm").reset();
  const now = new Date();
  $("month").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  $("salaryIncome").value = 2500000;
  $("businessIncome").value = 1000000;
  $("householdBudget").value = 3000000;
  $("taxReserve").value = 250000;
  $("businessExpense").value = 250000;
  $("ownerPay").value = 500000;
  $("fixedCost").value = 800000;
  $("livingCost").value = 750000;
  $("educationCost").value = 650000;
  $("medicalCost").value = 200000;
  $("debtPayment").value = 400000;
  $("saving").value = 200000;
  updateComputedStrip();
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  $("editingId").value = id;
  fields.forEach((field) => {
    $(field).value = record[field] ?? "";
  });
  updateComputedStrip();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  records = records.filter((item) => item.id !== id);
  saveRecords();
  render();
}

function renderSummary() {
  const latest = records.at(-1);
  const totalDebt = records.reduce((sum, record) => sum + toNumber(record.debtPayment), 0);
  const totalSaving = records.reduce((sum, record) => sum + toNumber(record.saving), 0);
  $("latestHousehold").textContent = latest ? formatMoney(latest.householdBudget) : "0원";
  $("latestBuffer").textContent = latest ? formatMoney(householdBuffer(latest)) : "0원";
  $("totalDebt").textContent = formatMoney(totalDebt);
  $("totalSaving").textContent = formatMoney(totalSaving);
}

function renderTable() {
  const body = $("recordsBody");
  if (!records.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="11">아직 입력한 월별 기록이 없습니다.</td></tr>`;
    return;
  }

  body.innerHTML = records
    .map((record) => {
      const buffer = householdBuffer(record);
      const bufferClass = buffer < 0 ? "danger" : buffer > 0 ? "positive" : "";
      return `
        <tr>
          <td>${record.month}</td>
          <td>${formatMoney(record.businessIncome)}</td>
          <td>${formatMoney(record.taxReserve)}</td>
          <td>${formatMoney(record.businessExpense)}</td>
          <td>${formatMoney(record.ownerPay)}</td>
          <td>${formatMoney(record.householdBudget)}</td>
          <td>${formatMoney(householdSpend(record))}</td>
          <td class="${bufferClass}">${formatMoney(buffer)}</td>
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

function metricValue(record, metric) {
  if (metric === "householdSpend") return householdSpend(record);
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

function shortMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
  return Math.round(value).toLocaleString("ko-KR");
}

function render() {
  saveRecords();
  renderSummary();
  renderTable();
  renderChart();
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
  download("budget-tracker-data.json", JSON.stringify(records, null, 2), "application/json");
}

function exportCsv() {
  const headers = [
    "월",
    "근로소득",
    "사업수입",
    "세금보관",
    "경비",
    "월급이체",
    "가계예산",
    "가계지출",
    "조정여유분",
    "대출상환",
    "저축비상금",
    "메모",
  ];
  const rows = records.map((record) => [
    record.month,
    record.salaryIncome,
    record.businessIncome,
    record.taxReserve,
    record.businessExpense,
    record.ownerPay,
    record.householdBudget,
    householdSpend(record),
    householdBuffer(record),
    record.debtPayment,
    record.saving,
    record.memo || "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  download("budget-tracker-records.csv", `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!Array.isArray(imported)) throw new Error("Invalid data");
      records = imported.map((record) => ({ ...record, id: record.id || crypto.randomUUID() }));
      render();
    } catch {
      alert("가져오기 파일을 확인해주세요.");
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  $("monthForm").addEventListener("input", updateComputedStrip);

  $("businessIncome").addEventListener("change", () => {
    $("taxReserve").value = Math.round(toNumber($("businessIncome").value) * 0.25);
    $("businessExpense").value = Math.round(toNumber($("businessIncome").value) * 0.25);
    $("ownerPay").value = Math.round(toNumber($("businessIncome").value) * 0.5);
    updateComputedStrip();
  });

  $("monthForm").addEventListener("submit", (event) => {
    event.preventDefault();
    setDefaultsFromBusinessIncome();
    const next = currentFormRecord();
    const existingIndex = records.findIndex((record) => record.id === next.id || record.month === next.month);
    if (existingIndex >= 0) {
      next.id = records[existingIndex].id;
      records[existingIndex] = next;
    } else {
      records.push(next);
    }
    render();
    resetForm();
  });

  $("recordsBody").addEventListener("click", (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) editRecord(editId);
    if (deleteId) deleteRecord(deleteId);
  });

  $("resetFormBtn").addEventListener("click", resetForm);
  $("chartMetric").addEventListener("change", renderChart);
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("downloadCsvBtn").addEventListener("click", exportCsv);
  $("importJsonInput").addEventListener("change", (event) => importJson(event.target.files[0]));
}

bindEvents();
resetForm();
render();
