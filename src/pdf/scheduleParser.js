export function parseColumnSchedule(pdfData) {

  const rows = [];

  // Find DetailMark
  const detailMarks = findDetailMarks(pdfData);

  // Find storeys
  const storeys = findStoreys(pdfData);

  // Find dimensions
  const dimensions = findDimensions(pdfData);

  // Find reinforcement
  const reinforcement = findReinforcement(pdfData);

  // Find stirrups
  const stirrups = findStirrups(pdfData);

  // Find method
  const methods = findMethods(pdfData);

  // Match everything together
  for (const detailMark of detailMarks) {

    rows.push({
      DetailMark: detailMark,
      StartStorey: '',
      EndStorey: '',
      Width: '',
      Breadth: '',
      BottomRebar: '',
      TopRebar: '',
      Stirrups: '',
      Method: ''
    });

  }

  return rows;
}