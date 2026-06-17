const STORAGE_KEY = "programacao-diaria-registros";

const fields = ["data", "periodo", "local", "atividade", "responsavel", "equipe"];
const form = document.querySelector("#scheduleForm");
const recordsBody = document.querySelector("#recordsBody");
const emptyStateWrap = document.querySelector(".table-wrap");
const searchInput = document.querySelector("#searchInput");
const exportCsv = document.querySelector("#exportCsv");
const shareWhatsApp = document.querySelector("#shareWhatsApp");
const clearForm = document.querySelector("#clearForm");
const formTitle = document.querySelector("#formTitle");
const totalItems = document.querySelector("#totalItems");
const todayItems = document.querySelector("#todayItems");
const locationItems = document.querySelector("#locationItems");

let records = loadRecords();
let filterText = "";

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetForm() {
  form.reset();
  document.querySelector("#recordId").value = "";
  document.querySelector("#data").value = todayIso();
  formTitle.textContent = "Novo registro";
}

function getFilteredRecords() {
  const needle = normalizeText(filterText);
  if (!needle) return records;

  return records.filter((record) =>
    fields.some((field) => normalizeText(record[field]).includes(needle)),
  );
}

function renderSummary() {
  const today = todayIso();
  const todayLocations = new Set(
    records
      .filter((record) => record.data === today)
      .map((record) => normalizeText(record.local))
      .filter(Boolean),
  );
  totalItems.textContent = records.length;
  todayItems.textContent = records.filter((record) => record.data === today).length;
  locationItems.textContent = todayLocations.size;
}

function renderRecords() {
  const filtered = getFilteredRecords().sort((a, b) => {
    const dateSort = String(a.data).localeCompare(String(b.data));
    return dateSort || String(a.periodo).localeCompare(String(b.periodo));
  });

  recordsBody.innerHTML = filtered
    .map(
      (record) => `
        <tr>
          <td class="date-cell">${escapeHtml(formatDate(record.data))}</td>
          <td><span class="period-pill">${escapeHtml(record.periodo)}</span></td>
          <td>${escapeHtml(record.local)}</td>
          <td class="activity-cell">${escapeHtml(record.atividade)}</td>
          <td>${escapeHtml(record.responsavel)}</td>
          <td>${escapeHtml(record.equipe)}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-action="repeat" data-id="${record.id}" aria-label="Repetir em outro dia" title="Repetir em outro dia">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11V9a3 3 0 0 1 3-3h15" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v2a3 3 0 0 1-3 3H3" />
                </svg>
              </button>
              <button type="button" data-action="edit" data-id="${record.id}" aria-label="Editar" title="Editar">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <button type="button" class="danger" data-action="delete" data-id="${record.id}" aria-label="Excluir" title="Excluir">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  emptyStateWrap.classList.toggle("is-empty", filtered.length === 0);
  renderSummary();
}

function upsertRecord(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const id = document.querySelector("#recordId").value || crypto.randomUUID();
  const record = { id };

  fields.forEach((field) => {
    record[field] = String(formData.get(field) || "").trim();
  });

  const index = records.findIndex((item) => item.id === id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }

  saveRecords();
  resetForm();
  renderRecords();
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  document.querySelector("#recordId").value = record.id;
  fields.forEach((field) => {
    const input = document.querySelector(`#${field}`);
    input.value = record[field] || "";
  });
  formTitle.textContent = "Editar registro";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const label = `${formatDate(record.data)} - ${record.local}`;
  if (!confirm(`Excluir registro: ${label}?`)) return;

  records = records.filter((item) => item.id !== id);
  saveRecords();
  renderRecords();
}

function repeatRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const newDate = prompt("Informe a nova data para repetir esta atividade (AAAA-MM-DD):", record.data || todayIso());
  if (!newDate) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    alert("Use o formato AAAA-MM-DD. Exemplo: 2026-06-18.");
    return;
  }

  records.push({
    ...record,
    id: crypto.randomUUID(),
    data: newDate,
  });
  saveRecords();
  renderRecords();
}

function handleTableAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "repeat") repeatRecord(id);
  if (action === "edit") editRecord(id);
  if (action === "delete") deleteRecord(id);
}

function toCsvValue(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function buildCsvBlob() {
  const headers = ["DATA", "PERIODO", "LOCAL", "ATIVIDADE", "RESPONSAVEL", "EQUIPE"];
  const rows = records.map((record) =>
    fields.map((field) => toCsvValue(record[field])).join(";"),
  );
  const csv = [headers.join(";"), ...rows].join("\n");
  return new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
}

function downloadCsv() {
  const blob = buildCsvBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao-diaria-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareToWhatsApp() {
  const fileName = `programacao-diaria-${todayIso()}.csv`;
  const blob = buildCsvBlob();
  const file = new File([blob], fileName, { type: "text/csv" });
  const text = `Programacao diaria exportada em ${formatDate(todayIso())}.`;

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "Programacao diaria",
      text,
      files: [file],
    });
    return;
  }

  downloadCsv();
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} O arquivo CSV foi baixado para anexar no WhatsApp.`)}`, "_blank");
}

form.addEventListener("submit", upsertRecord);
recordsBody.addEventListener("click", handleTableAction);
clearForm.addEventListener("click", resetForm);
exportCsv.addEventListener("click", downloadCsv);
shareWhatsApp.addEventListener("click", shareToWhatsApp);
searchInput.addEventListener("input", (event) => {
  filterText = event.target.value;
  renderRecords();
});

resetForm();
renderRecords();
