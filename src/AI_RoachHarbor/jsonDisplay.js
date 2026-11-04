// Renders any JSON value as a grid (table) or form (labelled fields). Nested objects and arrays are rendered recursively.
function jsonDisplay(containerId, jsonData, view = "grid") {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!document.getElementById("jsonDisplayStyles")) {
        const style = document.createElement("style");
        style.id = "jsonDisplayStyles";
        style.textContent = `
            .jd-table { border-collapse: collapse; width: 100%; }
            .jd-table th, .jd-table td { border: 1px solid #475569; padding: 4px 6px; text-align: left; vertical-align: top; }
            .jd-table th { background: rgba(100,116,139,.25); position: sticky; top: 0; }
            .jd-card { border: 1px solid #475569; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
            .jd-card > .jd-title { font-weight: 600; margin-bottom: 6px; }
            .jd-field { display: grid; grid-template-columns: minmax(70px, 30%) 1fr; gap: 6px; margin-bottom: 4px; align-items: start; }
            .jd-field > label { opacity: .75; word-break: break-word; }
            .jd-field input { width: 100%; box-sizing: border-box; }
            .jd-nested { margin: 0; padding-left: 8px; border-left: 2px solid #475569; }
            .jd-empty { opacity: .7; }
        `;
        document.head.appendChild(style);
    }

    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
    const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    const isScalar = (v) => v === null || typeof v !== "object";
    const scalar = (v) => (v === null || v === undefined ? "" : String(v));
    const MAX_DEPTH = 6;

    // Unwrap common envelopes such as { data: [...] } or { rows: [...] }
    function normalize(data) {
        if (typeof data === "string") {
            try { data = JSON.parse(data); } catch { return data; }
        }
        if (isObject(data)) {
            const list = Object.values(data).find((v) => Array.isArray(v) && v.length && v.every(isObject));
            if (list && Object.keys(data).length <= 3) return list;
        }
        return data;
    }

    function cell(value, depth) {
        if (isScalar(value)) return esc(scalar(value));
        if (depth >= MAX_DEPTH) return `<code>${esc(JSON.stringify(value))}</code>`;
        return `<details><summary>${Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}</summary>${table(value, depth + 1)}</details>`;
    }

    function table(value, depth = 0) {
        if (isScalar(value)) return esc(scalar(value));
        if (Array.isArray(value)) {
            if (!value.length) return `<span class="jd-empty">empty</span>`;
            if (value.every(isScalar)) {
                return `<table class="jd-table"><tbody>${value.map((v) => `<tr><td>${esc(scalar(v))}</td></tr>`).join("")}</tbody></table>`;
            }
            const rows = value.map((v) => (isObject(v) ? v : { value: v }));
            const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
            return `<table class="jd-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
                rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c], depth)}</td>`).join("")}</tr>`).join("")
            }</tbody></table>`;
        }
        return `<table class="jd-table"><tbody>${Object.entries(value).map(([k, v]) =>
            `<tr><th>${esc(k)}</th><td>${cell(v, depth)}</td></tr>`).join("")}</tbody></table>`;
    }

    function fields(value, depth = 0) {
        if (isScalar(value)) return `<input type="text" readonly value="${esc(scalar(value))}">`;
        if (depth >= MAX_DEPTH) return `<code>${esc(JSON.stringify(value))}</code>`;
        if (Array.isArray(value)) {
            if (!value.length) return `<span class="jd-empty">empty</span>`;
            return value.map((v, i) => `<div class="jd-field"><label>[${i}]</label><div>${fields(v, depth + 1)}</div></div>`).join("");
        }
        return Object.entries(value).map(([k, v]) => isScalar(v)
            ? `<div class="jd-field"><label>${esc(k)}</label>${fields(v, depth)}</div>`
            : `<div class="jd-field"><label>${esc(k)}</label><div class="jd-nested">${fields(v, depth + 1)}</div></div>`
        ).join("");
    }

    const data = normalize(jsonData);
    if (data === undefined || (Array.isArray(data) && !data.length)) {
        container.innerHTML = `<p class="jd-empty">No records found.</p>`;
        return;
    }

    if (view === "form") {
        const records = Array.isArray(data) ? data : [data];
        container.innerHTML = records.map((record, i) => `
            <div class="jd-card">
                ${records.length > 1 ? `<div class="jd-title">Record ${i + 1} of ${records.length}</div>` : ""}
                ${fields(record)}
            </div>`).join("");
    } else {
        container.innerHTML = table(data);
    }
}
