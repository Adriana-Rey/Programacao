const STORAGE_KEY = "programacao-diaria-registros";
const SUPABASE_URL = "https://lpisimqkdivjzkmvfonh.supabase.co";
const SUPABASE_KEY = "sb_publishable_tVdOKNBDHUSVxw2Af1jAhg_wjD9ED7W";
const SUPABASE_TABLE = "Programacao";

const fields = ["data", "periodo", "local", "atividade", "responsavel", "equipe", "status", "dataStatus"];
const formFields = ["data", "periodo", "local", "atividade", "responsavel", "equipe", "status", "dataStatus"];
const form = document.querySelector("#scheduleForm");
const recordsBody = document.querySelector("#recordsBody");
const emptyStateWrap = document.querySelector(".table-wrap");
const statusChart = document.querySelector("#statusChart");
const statusLegend = document.querySelector("#statusLegend");
const searchInput = document.querySelector("#searchInput");
const shareWhatsApp = document.querySelector("#shareWhatsApp");
const exportExcel = document.querySelector("#exportExcel");
const exportStatus = document.querySelector("#exportStatus");
const clearForm = document.querySelector("#clearForm");
const formTitle = document.querySelector("#formTitle");
const totalItems = document.querySelector("#totalItems");
const todayItems = document.querySelector("#todayItems");
const locationItems = document.querySelector("#locationItems");

let records = loadLocalRecords();
let filterText = "";
let useSnakeCaseStatusDate = false;

const statusColors = {
  concluido: "#08724f",
  pendente: "#d88b00",
  andamento: "#11a7d8",
  cancelado: "#b42318",
  semstatus: "#9aa8bb",
};

function loadLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function normalizeRecord(row) {
  return {
    id: row.id || crypto.randomUUID(),
    data: row.data || "",
    periodo: row.periodo || "",
    local: row.local || "",
    atividade: row.atividade || "",
    responsavel: row.responsavel || "",
    equipe: row.equipe || "",
    status: row.status || "",
    dataStatus: row.dataStatus || row.data_status || "",
  };
}

function toSupabaseRecord(record, snakeCase = useSnakeCaseStatusDate) {
  const payload = {
    id: record.id,
    data: record.data || null,
    periodo: record.periodo || "",
    local: record.local || "",
    atividade: record.atividade || "",
    responsavel: record.responsavel || "",
    equipe: record.equipe || "",
    status: record.status || "",
  };

  if (snakeCase) {
    payload.data_status = record.dataStatus || null;
  } else {
    payload.dataStatus = record.dataStatus || null;
  }

  return payload;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadRecords() {
  try {
    const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=*&order=data.asc,periodo.asc`);
    records = rows.map(normalizeRecord);
    useSnakeCaseStatusDate = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "data_status"));
    saveRecords();
  } catch (error) {
    console.warn("Usando dados locais. Falha ao carregar Supabase:", error);
    records = loadLocalRecords();
  }

  renderRecords();
}

async function saveRecordToSupabase(record) {
  try {
    await supabaseRequest(`${SUPABASE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(toSupabaseRecord(record)),
    });
  } catch (error) {
    const message = String(error.message || "");
    if (!useSnakeCaseStatusDate && message.includes("dataStatus")) {
      useSnakeCaseStatusDate = true;
      await supabaseRequest(`${SUPABASE_TABLE}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toSupabaseRecord(record, true)),
      });
      return;
    }
    throw error;
  }
}

async function deleteRecordFromSupabase(id) {
  await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
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

function escapeExcelCell(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setExportStatus(message, links = []) {
  exportStatus.innerHTML = [
    `<span>${escapeHtml(message)}</span>`,
    ...links.map(
      (link) =>
        `<a href="${link.href}" ${link.download ? `download="${escapeHtml(link.download)}"` : ""} target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`,
    ),
  ].join("");
}

function clearExportStatus() {
  exportStatus.innerHTML = "";
}

async function shareFileOrShowLinks({ blob, fileName, mimeType, title, text, successMessage, fallbackMessage, links }) {
  const file = new File([blob], fileName, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title,
      text,
      files: [file],
    });
    setExportStatus(successMessage);
    return true;
  }

  setExportStatus(fallbackMessage, links);
  return false;
}

function setButtonLoading(button, isLoading, label) {
  button.disabled = isLoading;
  if (label) button.dataset.originalLabel = button.textContent.trim();
  if (isLoading && label) button.lastChild.textContent = label;
  if (!isLoading && button.dataset.originalLabel) button.lastChild.textContent = button.dataset.originalLabel;
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

function renderStatusChart(filteredRecords) {
  const labels = [
    { key: "concluido", label: "Concluído" },
    { key: "pendente", label: "Pendente" },
    { key: "andamento", label: "Andamento" },
    { key: "cancelado", label: "Cancelado" },
    { key: "semstatus", label: "Sem status" },
  ];
  const counts = Object.fromEntries(labels.map((item) => [item.key, 0]));

  filteredRecords.forEach((record) => {
    const key = normalizeText(record.status).replace(/\s+/g, "") || "semstatus";
    counts[counts[key] === undefined ? "semstatus" : key] += 1;
  });

  const total = filteredRecords.length;
  let cursor = 0;
  const segments = labels
    .filter((item) => counts[item.key] > 0)
    .map((item) => {
      const start = cursor;
      const end = cursor + (counts[item.key] / Math.max(total, 1)) * 360;
      cursor = end;
      return `${statusColors[item.key]} ${start}deg ${end}deg`;
    });

  statusChart.style.background = total
    ? `conic-gradient(${segments.join(", ")})`
    : "conic-gradient(#d8e3ed 0deg 360deg)";
  statusChart.dataset.total = total;

  statusLegend.innerHTML = labels
    .map(
      (item) => `
        <span>
          <i style="background:${statusColors[item.key]}"></i>
          ${escapeHtml(item.label)}: <strong>${counts[item.key]}</strong>
        </span>
      `,
    )
    .join("");
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
  renderStatusChart(filtered);
}

async function upsertRecord(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const id = document.querySelector("#recordId").value || crypto.randomUUID();
  const record = { id };

  formFields.forEach((field) => {
    record[field] = String(formData.get(field) || "").trim();
  });

  const index = records.findIndex((item) => item.id === id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }

  saveRecords();
  try {
    await saveRecordToSupabase(record);
    resetForm();
    await loadRecords();
  } catch (error) {
    console.error("Falha ao salvar no Supabase:", error);
    alert("Não foi possível salvar no Supabase. O registro ficou salvo apenas neste aparelho.");
    resetForm();
    renderRecords();
  }
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  document.querySelector("#recordId").value = record.id;
  formFields.forEach((field) => {
    const input = document.querySelector(`#${field}`);
    input.value = record[field] || "";
  });
  formTitle.textContent = "Editar registro";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const label = `${formatDate(record.data)} - ${record.local}`;
  if (!confirm(`Excluir registro: ${label}?`)) return;

  records = records.filter((item) => item.id !== id);
  saveRecords();
  renderRecords();

  try {
    await deleteRecordFromSupabase(id);
    await loadRecords();
  } catch (error) {
    console.error("Falha ao excluir no Supabase:", error);
    alert("Não foi possível excluir no Supabase. Atualize a página para conferir os dados online.");
  }
}

async function repeatRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const newDate = prompt("Informe a nova data para repetir esta atividade (AAAA-MM-DD):", record.data || todayIso());
  if (!newDate) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    alert("Use o formato AAAA-MM-DD. Exemplo: 2026-06-18.");
    return;
  }

  const repeated = {
    ...record,
    id: crypto.randomUUID(),
    data: newDate,
  };
  records.push(repeated);
  saveRecords();
  renderRecords();

  try {
    await saveRecordToSupabase(repeated);
    await loadRecords();
  } catch (error) {
    console.error("Falha ao repetir no Supabase:", error);
    alert("Não foi possível repetir no Supabase. A cópia ficou salva apenas neste aparelho.");
  }
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

function crc32(bytes) {
  let crc = -1;

  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ -1) >>> 0;
}

function writeUint16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function writeUint32(value) {
  return new Uint8Array([
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  ]);
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);

    const localHeader = concatBytes([
      writeUint32(0x04034b50),
      writeUint16(20),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint32(checksum),
      writeUint32(dataBytes.length),
      writeUint32(dataBytes.length),
      writeUint16(nameBytes.length),
      writeUint16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, dataBytes);

    centralParts.push(
      concatBytes([
        writeUint32(0x02014b50),
        writeUint16(20),
        writeUint16(20),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint32(checksum),
        writeUint32(dataBytes.length),
        writeUint32(dataBytes.length),
        writeUint16(nameBytes.length),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint16(0),
        writeUint32(0),
        writeUint32(offset),
        nameBytes,
      ]),
    );

    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = concatBytes([
    writeUint32(0x06054b50),
    writeUint16(0),
    writeUint16(0),
    writeUint16(files.length),
    writeUint16(files.length),
    writeUint32(centralSize),
    writeUint32(offset),
    writeUint16(0),
  ]);

  return concatBytes([...localParts, ...centralParts, end]);
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let name = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function makeSheetXml(rows) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const cellRef = `${columnName(colIndex)}${rowIndex + 1}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="13" customWidth="1"/>
    <col min="2" max="2" width="13" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="42" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
    <col min="6" max="6" width="22" customWidth="1"/>
    <col min="7" max="7" width="16" customWidth="1"/>
    <col min="8" max="8" width="13" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function buildXlsxBlob(rows) {
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Programação Diária" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: makeSheetXml(rows),
    },
  ];

  return new Blob([createZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function buildPdfBlob(selectedDate = "", options = {}) {
  const includeLogo = options.includeLogo !== false;
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 28;
  const bottom = 35;
  const logo = includeLogo ? await getLogoAsset() : null;
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
  triggerDownload(blob, `programacao-diaria-${todayIso()}.pdf`);
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
  clearExportStatus();
  const selectedDate = askShareDate();
  if (!selectedDate) return;

  const selectedRecords = records.filter((record) => record.data === selectedDate);
  if (!selectedRecords.length) {
    alert(`Nao ha registros cadastrados para ${formatDate(selectedDate)}.`);
    return;
  }

  const fileName = `programacao-diaria-${selectedDate}.pdf`;
  const text = `*Programação Diária ${formatDate(selectedDate)}*`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  setButtonLoading(shareWhatsApp, true, "Gerando...");

  try {
    let blob;
    try {
      blob = await buildPdfBlob(selectedDate);
    } catch {
      blob = await buildPdfBlob(selectedDate, { includeLogo: false });
    }
    const pdfUrl = URL.createObjectURL(blob);

    await shareFileOrShowLinks({
      blob,
      fileName,
      mimeType: "application/pdf",
      title: "Programação Diária",
      text,
      successMessage: "PDF pronto para compartilhar. Escolha o WhatsApp na tela aberta pelo celular.",
      fallbackMessage: "Este navegador não permite anexar o PDF automaticamente. Use os links:",
      links: [
        { href: pdfUrl, download: fileName, label: "Baixar PDF" },
        { href: whatsappUrl, label: "Abrir WhatsApp" },
      ],
    });
  } catch (error) {
    if (error?.name === "AbortError") return;
    setExportStatus("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    setButtonLoading(shareWhatsApp, false);
  }
}

async function exportToExcel() {
  clearExportStatus();
  setButtonLoading(exportExcel, true, "Gerando...");

  try {
    const recordsToExport = getFilteredRecords().sort((a, b) => {
      const dateSort = String(a.data).localeCompare(String(b.data));
      return dateSort || String(a.periodo).localeCompare(String(b.periodo), "pt-BR", { sensitivity: "base" });
    });
    const headers = ["Data", "Período", "Local", "Atividade", "Responsável", "Equipe", "Status", "Data"];
    const bodyRows = recordsToExport
      .map(
        (record) => `
          <tr>
            <td>${escapeExcelCell(formatDate(record.data))}</td>
            <td>${escapeExcelCell(record.periodo)}</td>
            <td>${escapeExcelCell(record.local)}</td>
            <td class="wrap">${escapeExcelCell(record.atividade)}</td>
            <td>${escapeExcelCell(record.responsavel)}</td>
            <td class="wrap">${escapeExcelCell(record.equipe)}</td>
            <td>${escapeExcelCell(record.status)}</td>
            <td>${escapeExcelCell(formatDate(record.dataStatus))}</td>
          </tr>
        `,
      )
      .join("");
    const workbook = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; }
            th { font-weight: bold; text-align: center; background: #ffffff; }
            th, td { border: 1px solid #b7c9dc; padding: 2px 4px; vertical-align: top; }
            .wrap { white-space: normal; }
          </style>
        </head>
        <body>
          <table>
            <colgroup>
              <col style="width:110px" />
              <col style="width:85px" />
              <col style="width:90px" />
              <col style="width:390px" />
              <col style="width:130px" />
              <col style="width:120px" />
              <col style="width:85px" />
              <col style="width:110px" />
            </colgroup>
            <thead>
              <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `;
    const fileName = `programacao-diaria-${todayIso()}.xls`;
    const blob = new Blob([`\uFEFF${workbook}`], { type: "application/vnd.ms-excel;charset=utf-8" });
    const excelUrl = URL.createObjectURL(blob);
    triggerDownload(blob, fileName);
    setExportStatus("Arquivo Excel no layout XLS gerado. Se o download não iniciou, toque aqui:", [
      { href: excelUrl, download: fileName, label: "Baixar Excel" },
    ]);
  } catch {
    setExportStatus("Não foi possível gerar o Excel. Tente novamente.");
  } finally {
    setButtonLoading(exportExcel, false);
  }
}

form.addEventListener("submit", upsertRecord);
recordsBody.addEventListener("click", handleTableAction);
clearForm.addEventListener("click", resetForm);
shareWhatsApp.addEventListener("click", shareToWhatsApp);
exportExcel.addEventListener("click", exportToExcel);
searchInput.addEventListener("input", (event) => {
  filterText = event.target.value;
  renderRecords();
});

resetForm();
loadRecords();
