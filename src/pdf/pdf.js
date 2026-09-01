import express from 'express';
import multer from 'multer';
import fs from 'fs';

import {
  extractColumnScheduleFromPdf
} from '../pdf/extractColumnSchedule.js';

const router = express.Router();

const upload = multer({
  dest: 'uploads/'
});


router.post(
  '/extract-column-schedule',
  upload.single('file'),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'PDF file is required'
        });
      }

      console.log(
        'Processing PDF:',
        req.file.originalname
      );

      const rows =
        await extractColumnScheduleFromPdf(
          req.file.path
        );

      // Remove temporary file
      try {
        fs.unlinkSync(req.file.path);
      }
      catch (deleteError) {
        console.warn(
          'Unable to delete temporary file:',
          deleteError.message
        );
      }

      return res.json({
        success: true,
        file: req.file.originalname,
        count: rows.length,
        rows
      });

    }
    catch (error) {

      console.error(
        'Column schedule extraction failed:',
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }
  }
);


export default router;