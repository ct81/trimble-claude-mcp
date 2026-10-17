export function parseDXF(dxfText) {
  if (typeof dxfText !== 'string') {
    throw new TypeError('DXF content must be a string.');
  }

  const lines = dxfText.split(/\r?\n/);
  const entities = [];
  let i = 0;
  let inEntities = false;

  while (i + 1 < lines.length) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    i += 2;
    if (code === '0' && value === 'SECTION') {
      const sectionCode = lines[i] ? lines[i].trim() : '';
      const sectionName = lines[i + 1] ? lines[i + 1].trim() : '';
      i += 2;
      if (sectionCode === '2' && sectionName === 'ENTITIES') {
        inEntities = true;
        break;
      }
    }
  }
  if (!inEntities) return entities;

  let current = null;

  while (i + 1 < lines.length) {
    const codeStr = lines[i].trim();
    const valStr = lines[i + 1].trim();
    i += 2;

    if (codeStr === '0') {
      if (current) {
        entities.push(current);
        current = null;
      }
      if (valStr === 'ENDSEC') break;
      current = {
        type: valStr,
        handle: '',
        layer: '',
        vertices: [],
        texts: []
      };
      continue;
    }
    if (!current) continue;

    const code = parseInt(codeStr, 10);
    if (Number.isNaN(code)) continue;

    switch (code) {
      case 5:
        if (!current.handle) current.handle = valStr;
        break;
      case 8:
        current.layer = valStr;
        break;
      case 10:
        current._x = parseFloat(valStr);
        if (current.type === 'LWPOLYLINE') {
          current.vertices.push({ x: parseFloat(valStr), y: 0 });
        }
        break;
      case 20:
        current._y = parseFloat(valStr);
        if (current.type === 'LWPOLYLINE' && current.vertices.length) {
          current.vertices[current.vertices.length - 1].y = parseFloat(valStr);
        }
        break;
      case 30:
        current._z = parseFloat(valStr);
        break;
      case 11:
        current._x2 = parseFloat(valStr);
        break;
      case 21:
        current._y2 = parseFloat(valStr);
        break;
      case 31:
        current._z2 = parseFloat(valStr);
        break;
      case 40:
        if (current.type === 'CIRCLE' || current.type === 'ARC') {
          current.radius = parseFloat(valStr);
        } else if (current.type === 'TEXT' || current.type === 'MTEXT') {
          current.height = parseFloat(valStr);
        }
        break;
      case 50:
        if (current.type === 'ARC') {
          current.startAngle = parseFloat(valStr);
        } else if (current.type === 'TEXT' || current.type === 'MTEXT') {
          current.rotation = parseFloat(valStr);
        }
        break;
      case 51:
        if (current.type === 'ARC') current.endAngle = parseFloat(valStr);
        break;
      case 1:
        if (current.type === 'TEXT' || current.type === 'MTEXT') {
          current.texts.push(valStr);
        }
        break;
      case 90:
        current.vertexCount = parseInt(valStr, 10);
        break;
      case 70:
        current.flags = parseInt(valStr, 10);
        break;
      case 2:
        if (current.type === 'HATCH') current.pattern = valStr;
        break;
      default:
        break;
    }
  }
  if (current) entities.push(current);
  return entities;
}

function fmt(value) {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return '';
  return typeof value === 'number' ? value.toFixed(2) : value;
}

function distance(x1, y1, x2, y2) {
  if ([x1, y1, x2, y2].some(value => value == null || Number.isNaN(value))) return '';
  return Math.hypot(x2 - x1, y2 - y1).toFixed(2);
}

export function entitiesToRecords(entities) {
  const records = [];
  const keep = ['LWPOLYLINE', 'LINE', 'CIRCLE', 'ARC', 'HATCH', 'TEXT', 'MTEXT'];

  for (const ent of entities) {
    if (!keep.includes(ent.type)) continue;

    const record = {
      Handle: ent.handle || '',
      Type: ent.type,
      Layer: ent.layer || '',
      Material: '',
      Elevation_mm: '',
      GridLine: '',
      Start_X: '',
      Start_Y: '',
      End_X: '',
      End_Y: '',
      Center_X: '',
      Center_Y: '',
      Radius: '',
      StartAngle: '',
      EndAngle: '',
      Closed: '',
      VertexCount: '',
      Vertices: '',
      Text: '',
      TextHeight: '',
      Rotation: '',
      Pattern: '',
      TeklaPartType: '',
      Profile: '',
      Length_mm: '',
      Width_mm: '',
      Depth_mm: ''
    };

    switch (ent.type) {
      case 'LINE':
        record.Start_X = fmt(ent._x);
        record.Start_Y = fmt(ent._y);
        record.End_X = fmt(ent._x2);
        record.End_Y = fmt(ent._y2);
        record.TeklaPartType = 'Beam';
        record.Length_mm = distance(ent._x, ent._y, ent._x2, ent._y2);
        break;

      case 'LWPOLYLINE': {
        const points = ent.vertices || [];
        if (points.length) {
          record.Start_X = fmt(points[0].x);
          record.Start_Y = fmt(points[0].y);
          record.End_X = fmt(points[points.length - 1].x);
          record.End_Y = fmt(points[points.length - 1].y);
          record.VertexCount = points.length;
          record.Closed = ent.flags === 1 ? 'Yes' : 'No';
          record.Vertices = points
            .map(point => `(${point.x.toFixed(2)},${point.y.toFixed(2)})`)
            .join(' ');
          let length = 0;
          for (let k = 0; k < points.length - 1; k++) {
            length += parseFloat(distance(
              points[k].x,
              points[k].y,
              points[k + 1].x,
              points[k + 1].y
            ) || 0);
          }
          if (ent.flags === 1 && points.length > 2) {
            length += parseFloat(distance(
              points[points.length - 1].x,
              points[points.length - 1].y,
              points[0].x,
              points[0].y
            ) || 0);
          }
          record.Length_mm = length.toFixed(2);
        }
        record.TeklaPartType = ent.flags === 1 ? 'Plate/Polygon' : 'Beam';
        break;
      }

      case 'CIRCLE':
        record.Center_X = fmt(ent._x);
        record.Center_Y = fmt(ent._y);
        record.Radius = fmt(ent.radius);
        record.TeklaPartType = 'Circular Column / Hole';
        if (ent.radius) record.Width_mm = (ent.radius * 2).toFixed(2);
        break;

      case 'ARC':
        record.Center_X = fmt(ent._x);
        record.Center_Y = fmt(ent._y);
        record.Radius = fmt(ent.radius);
        record.StartAngle = fmt(ent.startAngle);
        record.EndAngle = fmt(ent.endAngle);
        record.TeklaPartType = 'Curved Beam';
        if (ent.radius != null && ent.startAngle != null && ent.endAngle != null) {
          let sweep = ent.endAngle - ent.startAngle;
          if (sweep < 0) sweep += 360;
          record.Length_mm = ((sweep / 180) * Math.PI * ent.radius).toFixed(2);
        }
        break;

      case 'HATCH':
        record.Pattern = ent.pattern || '';
        record.TeklaPartType = 'Hatch (surface only)';
        break;

      case 'TEXT':
      case 'MTEXT':
        record.Text = ent.texts.join(' | ');
        record.Start_X = fmt(ent._x);
        record.Start_Y = fmt(ent._y);
        record.TextHeight = fmt(ent.height);
        record.Rotation = fmt(ent.rotation);
        record.TeklaPartType = 'Annotation';
        break;
    }

    records.push(record);
  }
  return records;
}

export function enrichWithNearbyText(records, maxDist = 2000) {
  const texts = records.filter(record => record.Type === 'TEXT' || record.Type === 'MTEXT');
  const parts = records.filter(record => record.Type !== 'TEXT' && record.Type !== 'MTEXT');

  for (const part of parts) {
    const px = parseFloat(part.Start_X || part.Center_X);
    const py = parseFloat(part.Start_Y || part.Center_Y);
    if (Number.isNaN(px) || Number.isNaN(py)) continue;

    let best = null;
    let bestDistance = Infinity;
    for (const text of texts) {
      const tx = parseFloat(text.Start_X);
      const ty = parseFloat(text.Start_Y);
      if (Number.isNaN(tx) || Number.isNaN(ty)) continue;
      const currentDistance = Math.hypot(tx - px, ty - py);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        best = text;
      }
    }
    if (best && bestDistance <= maxDist && /[xX×]|Dia|mm/i.test(best.Text)) {
      part.Profile = best.Text;
      const match = best.Text.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        part.Width_mm = match[1];
        part.Depth_mm = match[2];
      }
    }
  }
  return records;
}

export function recordsToCSV(records) {
  if (!records.length) return '';
  const headers = Object.keys(records[0]);
  const escape = value => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...records.map(record => headers.map(header => escape(record[header])).join(','))
  ].join('\n');
}

export function dxfToCSV(dxfText) {
  const entities = parseDXF(dxfText);
  const records = enrichWithNearbyText(entitiesToRecords(entities));
  return { csv: recordsToCSV(records), records };
}

export function initializeDxfCsvExporter(doc = globalThis.document) {
  const fileInput = doc.getElementById('fileInput');
  const convertBtn = doc.getElementById('convertBtn');
  const downloadBtn = doc.getElementById('downloadBtn');
  const tableWrap = doc.getElementById('tableWrap');
  const statsBox = doc.getElementById('stats');
  const errorBox = doc.getElementById('errorBox');

  if (!fileInput || !convertBtn || !downloadBtn || !tableWrap || !statsBox || !errorBox) {
    return;
  }

  let lastCSV = '';
  let lastFileName = 'output.csv';

  fileInput.addEventListener('change', () => {
    convertBtn.disabled = !fileInput.files.length;
    downloadBtn.disabled = true;
    errorBox.innerHTML = '';
  });

  convertBtn.addEventListener('click', async () => {
    errorBox.innerHTML = '';
    const file = fileInput.files[0];
    if (!file) return;

    try {
      const { csv, records } = dxfToCSV(await file.text());
      lastCSV = csv;
      lastFileName = `${file.name.replace(/\.[^.]+$/, '')}.csv`;

      renderStats(records);
      renderTable(records);
      downloadBtn.disabled = records.length === 0;

      if (records.length === 0) {
        errorBox.innerHTML = '<div class="err">No supported entities found in the DXF file.</div>';
      }
    } catch (error) {
      console.error(error);
      const message = doc.createElement('div');
      message.className = 'err';
      message.textContent = `Error: ${error.message}`;
      errorBox.replaceChildren(message);
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!lastCSV) return;
    const blob = new Blob(['\uFEFF' + lastCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = lastFileName;
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  function renderStats(records) {
    const counts = {};
    for (const record of records) {
      counts[record.Type] = (counts[record.Type] || 0) + 1;
    }
    const layers = new Set(records.map(record => record.Layer)).size;
    statsBox.style.display = 'flex';
    statsBox.innerHTML =
      `<span><b>Total entities:</b> ${records.length}</span>` +
      `<span><b>Layers:</b> ${layers}</span>` +
      Object.entries(counts)
        .map(([type, count]) => `<span><b>${escapeHtml(type)}:</b> ${count}</span>`)
        .join('');
  }

  function renderTable(records) {
    if (!records.length) {
      tableWrap.innerHTML = '<div class="empty">No records to display.</div>';
      return;
    }
    const headers = Object.keys(records[0]);
    const maxRows = 500;
    const shown = records.slice(0, maxRows);

    let html = '<table><thead><tr>';
    for (const header of headers) html += `<th>${escapeHtml(header)}</th>`;
    html += '</tr></thead><tbody>';

    for (const record of shown) {
      html += '<tr>';
      for (const header of headers) {
        const cls = ['Material', 'Elevation_mm', 'GridLine'].includes(header)
          ? ' class="manual"'
          : '';
        html += `<td${cls}>${escapeHtml(record[header])}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';

    if (records.length > maxRows) {
      html += `<div class="empty">Showing first ${maxRows} of ${records.length} rows. Full data will be in the CSV download.</div>`;
    }
    tableWrap.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

if (typeof document !== 'undefined') {
  initializeDxfCsvExporter(document);
}
