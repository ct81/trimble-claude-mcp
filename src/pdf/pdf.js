import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config.js';

import {
  extractColumnSchedule
} from './scheduleParser.js';

import {
  generateCoordScheduleWorkbook
} from './coordScheduleExporter.js';

const uploadedPdfs = new Map();
const uploadLifetimeMs = 15 * 60 * 1000;
const firebaseStorage = config.firebase.projectId &&
  config.firebase.clientEmail &&
  config.firebase.privateKey &&
  config.firebase.storageBucket
  ? getStorage(
      getApps()[0] || initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey
        }),
        storageBucket: config.firebase.storageBucket
      })
    ).bucket()
  : null;
const uploadCleanup = setInterval(() => {
  const now = Date.now();

  for (const [uploadId, upload] of uploadedPdfs) {
    if (upload.expiresAt <= now) {
      uploadedPdfs.delete(uploadId);
    }
  }
}, 60 * 1000);
uploadCleanup.unref();

export async function createPdfUpload(buffer, originalname) {
  const uploadId = crypto.randomUUID();
  const expiresAt = Date.now() + uploadLifetimeMs;

  if (firebaseStorage) {
    await firebaseStorage.file(`mcp-pdf-uploads/${uploadId}`).save(buffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          originalname,
          expiresAt: String(expiresAt)
        }
      }
    });

    return uploadId;
  }

  uploadedPdfs.set(uploadId, {
    buffer,
    originalname,
    expiresAt
  });

  return uploadId;
}

export async function getPdfUpload(uploadId) {
  if (firebaseStorage) {
    const file = firebaseStorage.file(`mcp-pdf-uploads/${uploadId}`);
    const [metadata] = await file.getMetadata().catch(() => [null]);
    const expiresAt = Number(metadata?.metadata?.expiresAt);

    if (!metadata || !expiresAt || expiresAt <= Date.now()) {
      await file.delete().catch(() => {});
      throw new Error('PDF upload not found or expired.');
    }

    const [buffer] = await file.download();
    return {
      buffer,
      originalname: metadata.metadata?.originalname || 'upload.pdf',
      expiresAt
    };
  }

  const upload = uploadedPdfs.get(uploadId);

  if (!upload || upload.expiresAt <= Date.now()) {
    uploadedPdfs.delete(uploadId);
    throw new Error('PDF upload not found or expired.');
  }

  return upload;
}

const router = express.Router();
const execFileAsync = promisify(execFile);
const tenderScript = fileURLToPath(
  new URL('../python/tender/tender.py', import.meta.url)
);
const tenderPythonPackages = path.join(path.dirname(tenderScript), '.packages');

async function runTenderScript(args, outputPath) {
  await execFileAsync(
    process.env.PYTHON_EXECUTABLE || 'python3',
    args,
    {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONPATH: [tenderPythonPackages, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter)
      }
    }
  );

  return JSON.parse(await fs.promises.readFile(outputPath, 'utf8'));
}

export async function extractTenderProjectFromFiles(files, projectName = '') {
  if (!Array.isArray(files) || files.length === 0) {
    throw Object.assign(new Error('Select at least one PDF file.'), { statusCode: 400 });
  }
  if (files.length > 10) {
    throw Object.assign(new Error('A maximum of 10 PDFs can be extracted at once.'), { statusCode: 400 });
  }
  if (files.some((file) => !Buffer.isBuffer(file.buffer))) {
    throw Object.assign(new Error('Every PDF input must contain a file buffer.'), { statusCode: 400 });
  }

  const totalSize = files.reduce((total, file) => total + file.buffer.length, 0);
  if (totalSize > 100 * 1024 * 1024) {
    throw Object.assign(new Error('The combined PDF size must be 100 MB or less.'), { statusCode: 413 });
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'tender-extract-')
  );

  try {
    await Promise.all(files.map((file, index) => {
      const safeName = path.basename(file.originalname || `document-${index + 1}.pdf`)
        .replace(/[^A-Za-z0-9._-]+/g, '_') || `document-${index + 1}.pdf`;
      const filename = `${String(index + 1).padStart(2, '0')}-${safeName}`;
      return fs.promises.writeFile(
        path.join(tempDir, filename),
        file.buffer,
        { flag: 'wx' }
      );
    }));

    const outputPath = path.join(tempDir, 'project.json');
    const project = await runTenderScript([tenderScript, tempDir, outputPath], outputPath);
    project.project_name =
      String(projectName || '').trim().slice(0, 120) || 'Tender project';
    return project;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractTenderProjectFromDocuments(
  documents,
  projectName = '',
) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > 10) {
    throw Object.assign(new Error('Provide 1 to 10 text documents.'), { statusCode: 400 });
  }
  if (documents.some((document) => !document || typeof document.text !== 'string' || !document.text.trim())) {
    throw Object.assign(new Error('Each text document must include non-empty extracted PDF text.'), { statusCode: 400 });
  }

  const payload = JSON.stringify({
    project_name: String(projectName || '').trim().slice(0, 120) || 'Tender project',
    documents
  });
  if (Buffer.byteLength(payload, 'utf8') > 20 * 1024 * 1024) {
    throw Object.assign(new Error('Combined text document input must be 20 MB or less.'), { statusCode: 413 });
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'tender-text-')
  );

  try {
    const inputPath = path.join(tempDir, 'documents.json');
    const outputPath = path.join(tempDir, 'project.json');
    await fs.promises.writeFile(inputPath, payload, { flag: 'wx' });
    return await runTenderScript(
      [tenderScript, '--text-json', inputPath, outputPath],
      outputPath
    );
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

router.get('/downloads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(
    process.cwd(),
    'src',
    'pdf',
    'temp',
    filename
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'Download not found or expired'
    });
  }

  return res.download(filePath, filename);
});


// =====================================================
// MULTER
// =====================================================

const upload = multer({

  storage:
    multer.memoryStorage(),

  limits: {

    fileSize:
      50 * 1024 * 1024

  },

  fileFilter:
    (req, file, cb) => {

      if (
        file.mimetype === 'application/pdf' ||
        file.originalname
          .toLowerCase()
          .endsWith('.pdf')
      ) {

        cb(null, true);

      }
      else {

        cb(
          new Error(
            'Only PDF files are allowed'
          )
        );

      }

    }

});

const jsonUpload = multer({

  storage:
    multer.memoryStorage(),

  limits: {

    fileSize:
      50 * 1024 * 1024

  },

  fileFilter:
    (req, file, cb) => {

      const isJsonFile =
        file.mimetype === 'application/json' ||
        file.mimetype === 'application/x-json' ||
        file.originalname
          .toLowerCase()
          .endsWith('.json');

      if (isJsonFile) {

        cb(null, true);

      }
      else {

        cb(
          new Error(
            'Only JSON files are allowed'
          )
        );

      }

    }

});

const tenderUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

router.post(
  '/tender-extract',
  tenderUpload.array('files', 10),
  async (req, res) => {
    const files = req.files || [];
    try {
      const project = await extractTenderProjectFromFiles(
        files.map(({ buffer, originalname }) => ({ buffer, originalname })),
        req.body?.projectName
      );
      return res.json({ success: true, project });
    } catch (error) {
      console.error('[Tender extraction] Failed:', error);
      const status = error.statusCode || (error.code === 'ETIMEDOUT' || error.killed ? 504 : 500);
      return res.status(status).json({
        success: false,
        error: error.stderr?.trim() || error.message || 'Tender extraction failed.'
      });
    }
  }
);


// =====================================================
// EXTRACT COLUMN SCHEDULE
// =====================================================

router.post(

  '/extract-column-schedule',

  upload.single('file'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            'PDF file is required'

        });

      }


      console.log(
        'PDF received:',
        req.file.originalname
      );

      console.log(
        'PDF size:',
        req.file.size
      );


      // ================================================
      // EXTRACT ROWS
      // ================================================

      const rows =
        await extractColumnSchedule(
          req.file.buffer
        );


      // ================================================
      // RESPONSE
      // ================================================

      return res.json({

        success: true,

        file:
          req.file.originalname,

        count:
          rows.length,

        rows

      });

    }
    catch (error) {

      console.error(
        'PDF extraction error:',
        error
      );

      return res.status(500).json({

        success: false,

        error:
          error.message

      });

    }

  }

);

router.post(

  '/uploads',

  upload.single('file'),

  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'PDF file is required'
      });
    }

    const uploadId = await createPdfUpload(
      req.file.buffer,
      req.file.originalname
    );

    return res.status(201).json({
      success: true,
      uploadId,
      file: req.file.originalname,
      expiresInSeconds: uploadLifetimeMs / 1000
    });
  }

);


// =====================================================
// COLUMN SCHEDULE EXPORTER JSON UPLOAD
// =====================================================

router.post(

  '/column-schedule-exporter',

  jsonUpload.single('file'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            'JSON file is required'

        });

      }

      const text =
        req.file.buffer.toString('utf8');

      let data;

      try {

        data =
          JSON.parse(text);

      }
      catch (error) {

        return res.status(400).json({

          success: false,

          error:
            `Invalid JSON file: ${error.message}`

        });

      }

      const rows =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.column_schedule)
            ? data.column_schedule.flatMap(item => Array.isArray(item?.rows) ? item.rows : [])
            : [];

      return res.json({

        success: true,

        file:
          req.file.originalname,

        count:
          rows.length,

        rows,

        data

      });

    }
    catch (error) {

      console.error(
        'JSON upload error:',
        error
      );

      return res.status(400).json({

        success: false,

        error:
          error.message

      });

    }

  }

);

// =====================================================
// COORDINATE SCHEDULE EXPORTER JSON TO EXCEL
// =====================================================

router.post(

  '/coord-schedule-exporter',

  jsonUpload.single('file'),

  async (req, res) => {

    try {

      if (!req.file && !req.body) {

        return res.status(400).json({

          success: false,

          error:
            'JSON file is required'

        });

      }

      let data;

      try {

        data = req.file
          ? JSON.parse(req.file.buffer.toString('utf8'))
          : req.body;

      }
      catch (error) {

        return res.status(400).json({

          success: false,

          error:
            `Invalid JSON file: ${error.message}`

        });

      }

      const outputFile =
        path.join(process.cwd(), `output-${Date.now()}.xlsx`);

      const result =
        await generateCoordScheduleWorkbook(
          data,
          outputFile
        );

      if (req.query.download === 'csv') {
        if (!result.csvBuffer) {
          return res.status(422).json({
            success: false,
            error: 'No CSV rows were generated'
          });
        }

        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="coord-schedule-output.csv"',
          'X-Coordinate-Item-Count': String(result.itemCount),
          'X-Coordinate-X-Clusters': String(result.xClusterCount),
          'X-Coordinate-Y-Rows': String(result.yRowCount)
        });
        return res.send(result.csvBuffer);
      }

      if (req.query.download === '1') {
        res.set({
          'X-Coordinate-Item-Count': String(result.itemCount),
          'X-Coordinate-X-Clusters': String(result.xClusterCount),
          'X-Coordinate-Y-Rows': String(result.yRowCount)
        });
        return res.download(
          result.outputFile,
          'coord-schedule-output.xlsx'
        );
      }

      return res.json({

        success: true,

        file:
          req.file.originalname,

        outputFile:
          result.outputFile,

        itemCount:
          result.itemCount,

        xClusterCount:
          result.xClusterCount,

        yRowCount:
          result.yRowCount,

        data

      });

    }
    catch (error) {

      console.error(
        'Coord schedule export error:',
        error
      );

      return res.status(500).json({

        success: false,

        error:
          error.message

      });

    }

  }

);

export default router;