import { extractPdfText } from './pdfTextExtractor.js';
import { parseColumnSchedule } from './scheduleParser.js';
import { normalizeColumnRows } from './normalizer.js';

export async function extractColumnScheduleFromPdf(pdfPath) {

  console.log('[PDF] Starting extraction');
  console.log('[PDF] File:', pdfPath);

  const pdfData =
    await extractPdfText(pdfPath);

  console.log(
    '[PDF] PDF data keys:',
    Object.keys(pdfData || {})
  );

  console.log(
    '[PDF] Text length:',
    pdfData?.text?.length || 0
  );

  console.log(
    '[PDF] Pages:',
    pdfData?.pages?.length || 0
  );

  console.log(
    '[PDF] First 5000 characters:'
  );

  console.log(
    pdfData?.text?.substring(0, 5000) || ''
  );


  // TEMPORARY DEBUG RESULT

  return [
    {
      DetailMark: '__DEBUG__',

      StartStorey: '',

      EndStorey: '',

      Width: 0,

      Breadth: 0,

      BottomRebar: '',

      TopRebar: '',

      Stirrups: '',

      Method: '',

      ExtractedTextLength:
        pdfData?.text?.length || 0,

      ExtractedText:
        pdfData?.text || ''
    }
  ];
}