import { extractPdfText } from './pdfTextExtractor.js';
import { parseColumnSchedule } from './scheduleParser.js';
import { normalizeColumnRows } from './normalizer.js';


export async function extractColumnScheduleFromPdf(pdfPath) {

  // ==========================================
  // 1. Load and extract PDF
  // ==========================================

  const pdfData = await extractPdfText(pdfPath);


  // ==========================================
  // 2. Parse column schedule
  // ==========================================

  const rows = parseColumnSchedule(pdfData);


  // ==========================================
  // 3. Normalize result
  // ==========================================

  const normalizedRows =
    normalizeColumnRows(rows);


  // ==========================================
  // 4. Return
  // ==========================================

  return normalizedRows;
}