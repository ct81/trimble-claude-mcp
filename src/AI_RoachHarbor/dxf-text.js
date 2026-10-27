// Minimal ASCII DXF reader: turns ENTITIES into the flat records the brain script understands.
export function dxfTextToRecords(text) {
  const lines = String(text).split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);

  const records = [];
  let inEntities = false;
  let cur = null;
  const flush = () => { if (cur) records.push(cur); cur = null; };

  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 0 && value === "SECTION") {
      flush();
      inEntities = pairs[i + 1]?.[1] === "ENTITIES";
      continue;
    }
    if (code === 0 && value === "ENDSEC") { flush(); inEntities = false; continue; }
    if (!inEntities) continue;

    if (code === 0) {
      flush();
      if (value === "SEQEND" || value === "VERTEX") continue;
      cur = { Type: value, _v: [] };
      continue;
    }
    if (!cur) continue;
    const n = Number(value);
    switch (code) {
      case 5: cur.Handle = value; break;
      case 8: cur.Layer = value; break;
      case 2: cur.Name = value; break;
      case 10:
        if (cur.Type === "LWPOLYLINE") cur._v.push({ x: n });
        else if (cur.Type === "CIRCLE" || cur.Type === "ARC") cur.Center_X = n;
        else cur.Start_X = n;
        break;
      case 20:
        if (cur.Type === "LWPOLYLINE") { const p = cur._v[cur._v.length - 1]; if (p) p.y = n; }
        else if (cur.Type === "CIRCLE" || cur.Type === "ARC") cur.Center_Y = n;
        else cur.Start_Y = n;
        break;
      case 30: cur.Elevation_mm = n; break;
      case 38: if (cur.Elevation_mm === undefined) cur.Elevation_mm = n; break;
      case 11: cur.End_X = n; break;
      case 21: cur.End_Y = n; break;
      case 31: cur.End_Z = n; break;
      case 40: cur.Radius = n; break;
      default: break;
    }
  }
  flush();

  return records.map(({ _v, ...rec }) => {
    if (_v.length) rec.Vertices = _v.filter((p) => Number.isFinite(p.y));
    if (rec.Type === "LINE" && rec.Start_X !== undefined && rec.End_X !== undefined) {
      rec.Length_mm = Math.hypot(rec.End_X - rec.Start_X, (rec.End_Y ?? 0) - (rec.Start_Y ?? 0), (rec.End_Z ?? 0) - (rec.Elevation_mm ?? 0));
    }
    return rec;
  });
}
