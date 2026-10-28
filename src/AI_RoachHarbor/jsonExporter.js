/**
 * Dynamic JSON reader + exporter (CSV & Excel)
 * Works in Node.js and the browser. Handles any JSON shape.
 *
 * Excel needs SheetJS:  npm i xlsx   (browser: <script src=".../xlsx.full.min.js">)
 * CSV needs nothing.
 */

// ---------- 1. Flatten any value into { "a.b[0].c": value } ----------
function flattenJson(value, opts = {}, prefix = "", out = {}, seen = new WeakSet()) {
  const { arrayMode = "index", separator = "." } = opts;

  const isPrimitive =
    value === null || value === undefined || typeof value !== "object" || value instanceof Date;

  if (isPrimitive) {
    out[prefix || "value"] = value instanceof Date ? value.toISOString() : value ?? "";
    return out;
  }
  if (seen.has(value)) { out[prefix] = "[Circular]"; return out; }
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length === 0) { out[prefix || "value"] = ""; return out; }
    const allPrimitive = value.every(v => v === null || typeof v !== "object");
    if (arrayMode === "join" && allPrimitive) {
      out[prefix || "value"] = value.join("; ");
    } else {
      value.forEach((item, i) =>
        flattenJson(item, opts, `${prefix}[${i}]`, out, seen));
    }
  } else {
    const keys = Object.keys(value);
    if (keys.length === 0) { out[prefix || "value"] = ""; return out; }
    for (const k of keys) {
      flattenJson(value[k], opts, prefix ? `${prefix}${separator}${k}` : k, out, seen);
    }
  }
  seen.delete(value);
  return out;
}

// ---------- 2. Detect tables (sheets) in any JSON structure ----------
const isObjArray = a =>
  Array.isArray(a) && a.length > 0 && a.every(x => x && typeof x === "object");

/** Returns { tableName: [flatRow, ...] } */
function jsonToTables(input, opts = {}) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const tables = {};

  if (Array.isArray(data)) {
    // Root array: each element is a row (primitives become {value})
    tables[opts.sheetName || "Data"] = data.map(item => flattenJson(item, opts));
    return tables;
  }

  if (data && typeof data === "object") {
    const rest = {};
    for (const [key, val] of Object.entries(data)) {
      if (isObjArray(val)) tables[key] = val.map(item => flattenJson(item, opts));
      else rest[key] = val;
    }
    if (Object.keys(tables).length === 0) {
      tables[opts.sheetName || "Data"] = [flattenJson(data, opts)]; // single record
    } else if (Object.keys(rest).length) {
      tables["Info"] = [flattenJson(rest, opts)]; // leftover top-level values
    }
    return tables;
  }

  tables[opts.sheetName || "Data"] = [{ value: data }];
  return tables;
}

// ---------- 3. Helpers ----------
function getColumns(rows) {
  const cols = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => cols.add(k)));
  return [...cols];
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s; // CSV-injection guard
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows) {
  const cols = getColumns(rows);
  const lines = [cols.map(csvCell).join(",")];
  for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(","));
  return lines.join("\r\n");
}

const safeSheetName = (name, used) => {
  let base = String(name).replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Sheet";
  let n = base, i = 1;
  while (used.has(n.toLowerCase())) n = base.slice(0, 28) + "_" + i++;
  used.add(n.toLowerCase());
  return n;
};

// ---------- 4. CSV export ----------
/**
 * @returns {Object} { tableName: csvString }   (one CSV per table)
 */
function jsonToCsv(input, opts = {}) {
  const tables = jsonToTables(input, opts);
  const result = {};
  for (const [name, rows] of Object.entries(tables)) result[name] = rowsToCsv(rows);
  return result;
}

// ---------- 5. Excel export ----------
/**
 * @param {*} XLSX  the SheetJS library (pass it in; works in Node and browser)
 * @returns {Object} the workbook
 */
function jsonToWorkbook(input, XLSX, opts = {}) {
  const tables = jsonToTables(input, opts);
  const wb = XLSX.utils.book_new();
  const used = new Set();

  for (const [name, rows] of Object.entries(tables)) {
    const cols = getColumns(rows);
    const cleaned = rows.map(r => {
      const o = {};
      for (const c of cols) {
        let v = r[c];
        if (typeof v === "string" && v.length > 32767) v = v.slice(0, 32767); // Excel cell limit
        o[c] = v ?? "";
      }
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(cleaned, { header: cols });
    ws["!cols"] = cols.map(c => ({
      wch: Math.min(60, Math.max(c.length, ...cleaned.slice(0, 200).map(r => String(r[c]).length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));
  }
  return wb;
}

// ---------- 6. Save / download (auto-detects Node vs browser) ----------
function saveText(filename, text, mime = "text/csv;charset=utf-8") {
  const content = "\uFEFF" + text; // BOM so Excel reads UTF-8 correctly
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } else {
    require("fs").writeFileSync(filename, content, "utf8");
  }
}

/** One-call helper: exportJson(json, "output", { format: "csv" | "xlsx", XLSX }) */
function exportJson(input, baseName = "export", opts = {}) {
  const { format = "csv", XLSX = (typeof window !== "undefined" ? window.XLSX : require("xlsx")) } = opts;

  if (format === "xlsx") {
    const wb = jsonToWorkbook(input, XLSX, opts);
    XLSX.writeFile(wb, `${baseName}.xlsx`); // works in Node & browser
    return;
  }
  const csvs = jsonToCsv(input, opts);
  const names = Object.keys(csvs);
  for (const name of names) {
    const file = names.length === 1 ? `${baseName}.csv` : `${baseName}_${name}.csv`;
    saveText(file, csvs[name]);
  }
}

// ---------- Exports ----------
if (typeof module !== "undefined") {
  module.exports = { flattenJson, jsonToTables, jsonToCsv, jsonToWorkbook, exportJson };
}

/* ---------------- USAGE ----------------

const { exportJson, jsonToCsv } = require("./jsonExporter");

const data = {
  company: "Acme",
  employees: [
    { id: 1, name: "Ann", address: { city: "Paris" }, skills: ["js", "sql"] },
    { id: 2, name: "Bob", address: { city: "Rome" },  skills: ["go"] }
  ],
  orders: [{ id: 10, total: 99.5 }, { id: 11, total: 12 }]
};

exportJson(data, "report", { format: "xlsx" });             // sheets: employees, orders, Info
exportJson(data, "report", { format: "csv" });              // report_employees.csv, report_orders.csv, ...
exportJson(data, "report", { format: "csv", arrayMode: "join" }); // skills -> "js; sql"

// Just get CSV text:
console.log(jsonToCsv(data).employees);

Options: arrayMode "index" (skills[0], skills[1]) | "join", separator ".", sheetName "Data"
*/