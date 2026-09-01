import express from 'express';
import multer from 'multer';
import fs from 'fs';

import {
  extractColumnScheduleFromPdf
} from './extractColumnSchedule.js';


const router = express.Router();


const upload = multer({
  dest: 'uploads/'
});


router.post(
  '/extract-column-schedule',

  upload.single('file'),

  async (req, res) => {

    console.log(
      '[PDF] Extract column schedule endpoint called'
    );


    try {

      // ==========================================
      // Check file
      // ==========================================

      if (!req.file) {

        return res.status(400).json({
          success: false,
          error: 'PDF file is required'
        });

      }


      console.log(
        '[PDF] File:',
        req.file.originalname
      );

      console.log(
        '[PDF] Temporary path:',
        req.file.path
      );


      // ==========================================
      // Call PDF extraction
      // ==========================================

      const rows =
        await extractColumnScheduleFromPdf(
          req.file.path
        );


      // ==========================================
      // Delete temporary PDF
      // ==========================================

      try {

        fs.unlinkSync(
          req.file.path
        );

      }
      catch (deleteError) {

        console.warn(
          '[PDF] Could not delete temporary file:',
          deleteError.message
        );

      }


      // ==========================================
      // Return result
      // ==========================================

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
        '[PDF] Extraction failed:',
        error
      );


      // Try to delete temporary file
      if (req.file?.path) {

        try {

          fs.unlinkSync(
            req.file.path
          );

        }
        catch {
          // Ignore cleanup failure
        }

      }


      return res.status(500).json({

        success: false,

        error:
          error.message

      });

    }

  }
);


export default router;