import fs from 'fs';

export async function loadPdf(pdfPath) {

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  return fs.readFileSync(pdfPath);
}


export async function extractPdfText(pdfPath) {

  const pdfBuffer = await loadPdf(pdfPath);

  // PDF parser will go here

  return {
    pages: [],
    text: ''
  };
}