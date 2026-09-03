//Extract from PDF

import fs from 'node:fs';
import path from 'node:path';
import { extractColumnSchedule as extractColumnScheduleFromPdfjs } from './scheduleParser.js';

export async function extractColumnScheduleFromBuffer(buffer) {
  return extractColumnScheduleFromPdfjs(buffer);
}

export async function extractColumnScheduleFromPdf(pdfPath) {
  if (!pdfPath) {
    throw new Error('PDF path is required.');
  }

  const resolvedPath = path.resolve(pdfPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`PDF file not found: ${resolvedPath}`);
  }

  const buffer = fs.readFileSync(resolvedPath);

  return extractColumnScheduleFromPdfjs(buffer);
}