export function normalizeColumnRow(row) {

  return {
    DetailMark: row.DetailMark ?? '',
    StartStorey: row.StartStorey ?? '',
    EndStorey: row.EndStorey ?? '',

    Width: Number(row.Width) || 0,
    Breadth: Number(row.Breadth) || 0,

    BottomRebar: row.BottomRebar ?? '',
    TopRebar: row.TopRebar ?? '',

    Stirrups: row.Stirrups ?? '',

    Method: row.Method ?? ''
  };
}


export function normalizeColumnRows(rows) {

  return rows.map(normalizeColumnRow);
}