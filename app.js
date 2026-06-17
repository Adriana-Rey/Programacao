const STORAGE_KEY = "programacao-diaria-registros";

const fields = ["data", "periodo", "local", "atividade", "responsavel", "equipe", "status", "dataStatus"];
const form = document.querySelector("#scheduleForm");
const recordsBody = document.querySelector("#recordsBody");
const emptyStateWrap = document.querySelector(".table-wrap");
const searchInput = document.querySelector("#searchInput");
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
          <td><span class="status-pill status-${normalizeText(record.status) || "vazio"}">${escapeHtml(record.status)}</span></td>
          <td class="date-cell">${escapeHtml(formatDate(record.dataStatus))}</td>
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

function cleanPdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\r\n]/g, " ");
}

function escapePdfText(value) {
  return cleanPdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfText(value, maxChars) {
  const sourceLines = cleanPdfText(value).split(/\r?\n/);
  const lines = [];

  sourceLines.forEach((sourceLine) => {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    let line = "";

    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });

    lines.push(line || " ");
  });

  return lines;
}

function makePdfText(x, y, text, size = 8, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET\n`;
}

async function getLogoAsset() {
  try {
    const img = document.querySelector(".brand-logo");
    if (!img) return null;

    if (!img.complete || !img.naturalWidth) {
      await new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }

    if (!img.naturalWidth || !img.naturalHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

function concatBytes(parts) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

async function buildPdfBlob(selectedDate = "") {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 28;
  const bottom = 35;
  const logo = await getLogoAsset();
  const columns = [
    { title: "Data", field: "data", width: 50, chars: 10, format: formatDate },
    { title: "Periodo", field: "periodo", width: 54, chars: 10 },
    { title: "Local", field: "local", width: 66, chars: 12 },
    { title: "Atividade", field: "atividade", width: 164, chars: 31 },
    { title: "Responsavel", field: "responsavel", width: 76, chars: 14 },
    { title: "Equipe", field: "equipe", width: 52, chars: 10 },
    { title: "Status", field: "status", width: 58, chars: 10 },
    { title: "Data", field: "dataStatus", width: 50, chars: 10, format: formatDate },
  ];
  const reportRecords = selectedDate
    ? records.filter((record) => record.data === selectedDate)
    : records;
  const sorted = [...reportRecords].sort((a, b) => {
    const periodSort = String(a.periodo).localeCompare(String(b.periodo), "pt-BR", { sensitivity: "base" });
    const responsibleSort = String(a.responsavel).localeCompare(String(b.responsavel), "pt-BR", { sensitivity: "base" });
    return periodSort || responsibleSort || String(a.local).localeCompare(String(b.local), "pt-BR", { sensitivity: "base" });
  });
  const pages = [];
  let content = "";
  let y = pageHeight - margin;

  function startPage() {
    content = "";
    y = pageHeight - margin;
    const logoWidth = 150;
    const logoHeight = logo ? Math.round((logoWidth * logo.height) / logo.width) : 0;
    const titleX = logo ? margin + logoWidth + 16 : margin;

    if (logo) {
      content += `q ${logoWidth} 0 0 ${logoHeight} ${margin} ${y - logoHeight + 4} cm /Im1 Do Q\n`;
    }

    content += makePdfText(titleX, y - 12, "Programação Diária", 16);
    content += makePdfText(titleX, y - 30, formatDate(selectedDate || todayIso()), 10, "F2");
    y -= Math.max(72, logoHeight + 14);
    addHeader();
  }

  function finishPage() {
    pages.push(content);
  }

  function addHeader() {
    let x = margin;
    content += "0.93 0.96 0.99 rg\n";
    content += `${margin} ${y - 13} ${pageWidth - margin * 2} 18 re f\n`;
    content += "0 0 0 rg\n";
    columns.forEach((column) => {
      content += makePdfText(x + 2, y - 8, column.title, 7);
      x += column.width;
    });
    y -= 22;
  }

  startPage();

  sorted.forEach((record) => {
    const cellLines = columns.map((column) => {
      const value = column.format ? column.format(record[column.field]) : record[column.field];
      return wrapPdfText(value, column.chars);
    });
    const rowHeight = Math.max(20, Math.max(...cellLines.map((line) => line.length)) * 9 + 6);

    if (y - rowHeight < bottom) {
      finishPage();
      startPage();
    }

    let x = margin;
    content += "0.82 0.86 0.91 RG\n";
    content += `${margin} ${y - rowHeight + 5} ${pageWidth - margin * 2} ${rowHeight} re S\n`;
    cellLines.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        content += makePdfText(x + 2, y - 8 - lineIndex * 9, line, 7);
      });
      x += columns[index].width;
    });
    y -= rowHeight;
  });

  if (!sorted.length) {
    content += makePdfText(margin, y - 8, "Nenhum registro cadastrado.", 9);
  }

  finishPage();

  const encoder = new TextEncoder();
  const encode = (value) => encoder.encode(value);
  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  if (logo) {
    objects.push({
      bytes: logo.bytes,
      header: `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      footer: "\nendstream",
    });
  }

  const pageRefs = [];
  pages.forEach((pageContent) => {
    const contentId = objects.length + 2;
    const pageId = objects.length + 1;
    const xObject = logo ? " /XObject << /Im1 5 0 R >>" : "";
    pageRefs.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${encode(pageContent).length} >>\nstream\n${pageContent}endstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  const parts = [encode("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(parts.reduce((total, part) => total + part.length, 0));
    parts.push(encode(`${index + 1} 0 obj\n`));
    if (typeof object === "string") {
      parts.push(encode(object));
    } else {
      parts.push(encode(object.header));
      parts.push(object.bytes);
      parts.push(encode(object.footer));
    }
    parts.push(encode("\nendobj\n"));
  });
  const xrefOffset = parts.reduce((total, part) => total + part.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encode(xref));

  return new Blob([concatBytes(parts)], { type: "application/pdf" });
}

async function downloadPdf() {
  const blob = await buildPdfBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao-diaria-${todayIso()}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function askShareDate() {
  const dates = [...new Set(records.map((record) => record.data).filter(Boolean))].sort();
  const defaultDate = dates.includes(todayIso()) ? todayIso() : dates.at(-1) || todayIso();
  const selectedDate = prompt("Informe a data para compartilhar (AAAA-MM-DD):", defaultDate);

  if (!selectedDate) return "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    alert("Use o formato AAAA-MM-DD. Exemplo: 2026-06-18.");
    return "";
  }

  return selectedDate;
}

async function shareToWhatsApp() {
  const selectedDate = askShareDate();
  if (!selectedDate) return;

  const selectedRecords = records.filter((record) => record.data === selectedDate);
  if (!selectedRecords.length) {
    alert(`Nao ha registros cadastrados para ${formatDate(selectedDate)}.`);
    return;
  }

  const fileName = `programacao-diaria-${selectedDate}.pdf`;
  const blob = await buildPdfBlob(selectedDate);
  const file = new File([blob], fileName, { type: "application/pdf" });
  const text = `Programação Diária de ${formatDate(selectedDate)} em PDF.`;

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "Programação Diária",
      text,
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} O arquivo PDF foi baixado para anexar no WhatsApp.`)}`, "_blank");
}

form.addEventListener("submit", upsertRecord);
recordsBody.addEventListener("click", handleTableAction);
clearForm.addEventListener("click", resetForm);
shareWhatsApp.addEventListener("click", shareToWhatsApp);
searchInput.addEventListener("input", (event) => {
  filterText = event.target.value;
  renderRecords();
});

resetForm();
renderRecords();
