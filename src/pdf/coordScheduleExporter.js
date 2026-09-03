import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import express from "express";
import cors from "cors";

// ============================================================
// CONFIGURATION
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, "output.xlsx");
const OUTPUT_CSV_FILE = path.join(__dirname, "output_data.csv");

// For web server responses, you can also use a temp directory
const TEMP_DIR = path.join(__dirname, "temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const X_TOLERANCE = 4.0;
const Y_TOLERANCE = 2.5;


// ============================================================
// MAIN - CLI Version
// ============================================================

async function main() {

    console.log("");
    console.log("==============================================");
    console.log(" PDF JSON -> EXCEL");
    console.log("==============================================");
    console.log("");

    // --------------------------------------------------------
    // GET INPUT
    // --------------------------------------------------------

    const json = await getInputJson();

    if (!json) {

        console.error("");
        console.error("No valid JSON input.");
        process.exit(1);
    }

    // --------------------------------------------------------
    // EXTRACT ITEMS
    // --------------------------------------------------------

    const items = extractItems(json);

    console.log("");
    console.log(
        `Coordinate objects found: ${items.length}`
    );

    if (items.length === 0) {

        console.error(
            "No text coordinate objects were found."
        );

        process.exit(1);
    }

    // --------------------------------------------------------
    // CLUSTER COORDINATES
    // --------------------------------------------------------

    const xValues = items.map(
        item => item.x
    );

    const yValues = items.map(
        item => item.y
    );

    const xCenters = clusterCoordinates(
        xValues,
        X_TOLERANCE
    );

    const yCenters = clusterCoordinates(
        yValues,
        Y_TOLERANCE
    );

    // PDF Y coordinates increase upward.
    // Reverse them for Excel top-to-bottom layout.

    const yDescending = [...yCenters]
        .sort((a, b) => b - a);

    console.log(
        `X coordinate clusters: ${xCenters.length}`
    );

    console.log(
        `Y coordinate rows: ${yDescending.length}`
    );

    // --------------------------------------------------------
    // CREATE WORKBOOK
    // --------------------------------------------------------

    const workbook = new ExcelJS.Workbook();

    workbook.creator =
        "PDF Coordinate to Excel";

    workbook.lastModifiedBy =
        "PDF Coordinate to Excel";

    workbook.created =
        new Date();

    workbook.modified =
        new Date();

    // --------------------------------------------------------
    // CREATE WORKSHEETS
    // --------------------------------------------------------

    const infoSheet =
        workbook.addWorksheet("Info");

    const layoutSheet =
        workbook.addWorksheet("Layout");

    const rawSheet =
        workbook.addWorksheet("Raw Coordinates");

    const scheduleSheet =
        workbook.addWorksheet("Column Schedule");

    const dataSheet =
        workbook.addWorksheet("Data");

    // --------------------------------------------------------
    // CREATE CONTENT
    // --------------------------------------------------------

    createInfoSheet(
        infoSheet,
        items,
        xCenters,
        yDescending
    );

    createLayoutSheet(
        layoutSheet,
        items,
        xCenters,
        yDescending
    );

    createRawSheet(
        rawSheet,
        items,
        xCenters,
        yDescending
    );

    createScheduleSheet(
        scheduleSheet,
        items
    );

    const processedRows = createDataSheet(
        dataSheet,
        items,
        workbook
    );

    // --------------------------------------------------------
    // SAVE EXCEL
    // --------------------------------------------------------

    console.log("");
    console.log("Saving Excel...");

    await workbook.xlsx.writeFile(
        OUTPUT_FILE
    );

    console.log("");
    console.log("==============================================");
    console.log(" COMPLETE");
    console.log("==============================================");
    console.log("");

    console.log(
        `Output: ${OUTPUT_FILE}`
    );

    // --------------------------------------------------------
    // EXPORT CSV
    // --------------------------------------------------------

    if (processedRows && processedRows.length > 0) {
        console.log("");
        console.log(`Exporting CSV with ${processedRows.length} rows...`);

        try {
            // Generate a unique filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const csvFilename = `output_data_${timestamp}.csv`;
            const csvPath = path.join(TEMP_DIR, csvFilename);

            const csvResult = await exportToCsv(processedRows, csvPath);

            if (csvResult) {
                console.log(`CSV saved to: ${csvPath}`);

                // Also save a copy to the main output location
                const mainCsvPath = OUTPUT_CSV_FILE;
                fs.copyFileSync(csvPath, mainCsvPath);
                console.log(`CSV also saved to: ${mainCsvPath}`);
            }
        } catch (error) {
            console.error("Error exporting CSV:", error.message);
        }
    } else {
        console.log("");
        console.log("No data rows to export to CSV.");
    }

    console.log("");
}


// ============================================================
// EXPORT TO CSV
// ============================================================

async function exportToCsv(rows, outputPath) {

    if (!rows || rows.length === 0) {
        console.log("No data rows to export to CSV.");
        return null;
    }

    console.log(`Preparing to export ${rows.length} rows to CSV...`);

    // Define headers
    const headers = [
        "Detail Mark",
        "Start Storey",
        "End Storey",
        "Material Grade",
        "Width (mm)",
        "Breadth (mm)",
        "Main Rebar",
        "Stirrups",
        "Construction Method",
        "Arrangement Type",
        "Splice/Dowels",
        "Remark",
        "Refer To 2D Detail"
    ];

    // Build CSV content
    let csvContent = headers.join(",") + "\n";

    let exportedCount = 0;
    for (const row of rows) {
        const rowData = [
            escapeCsvValue(row.detail_mark || ""),
            escapeCsvValue(row.start_storey || ""),
            escapeCsvValue(row.end_storey || ""),
            escapeCsvValue(row.material_grade || ""),
            row.width_mm !== null && row.width_mm !== undefined ? row.width_mm : "",
            row.breadth_mm !== null && row.breadth_mm !== undefined ? row.breadth_mm : "",
            escapeCsvValue(row.main_rebar || ""),
            escapeCsvValue(row.stirrups || ""),
            escapeCsvValue(row.construction_method || ""),
            escapeCsvValue(row.arrangement_type || ""),
            escapeCsvValue(row.splice_dowels || ""),
            escapeCsvValue(row.remark || ""),
            escapeCsvValue(row.refer_to_2d_detail || "")
        ];

        csvContent += rowData.join(",") + "\n";
        exportedCount++;
    }

    console.log(`Built CSV with ${exportedCount} rows.`);

    // Write to file
    try {
        fs.writeFileSync(outputPath, csvContent, "utf8");
        console.log(`CSV file written to: ${outputPath}`);
        console.log(`File size: ${fs.statSync(outputPath).size} bytes`);
        return outputPath;
    } catch (error) {
        console.error(`Error writing CSV file: ${error.message}`);
        throw error;
    }
}


// ============================================================
// ESCAPE CSV VALUE
// ============================================================

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const str = String(value);

    // If the value contains commas, quotes, or newlines, wrap in quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}


// ============================================================
// GENERATE FILES - For Web Server
// ============================================================

export async function generateFiles(json) {
    if (!json) {
        throw new Error("JSON input is required.");
    }

    const items = extractItems(json);

    if (items.length === 0) {
        throw new Error("No text coordinate objects were found.");
    }

    const xValues = items.map(item => item.x);
    const yValues = items.map(item => item.y);
    const xCenters = clusterCoordinates(xValues, X_TOLERANCE);
    const yCenters = clusterCoordinates(yValues, Y_TOLERANCE);
    const yDescending = [...yCenters].sort((a, b) => b - a);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "PDF Coordinate to Excel";
    workbook.lastModifiedBy = "PDF Coordinate to Excel";
    workbook.created = new Date();
    workbook.modified = new Date();

    const infoSheet = workbook.addWorksheet("Info");
    const layoutSheet = workbook.addWorksheet("Layout");
    const rawSheet = workbook.addWorksheet("Raw Coordinates");
    const scheduleSheet = workbook.addWorksheet("Column Schedule");
    const dataSheet = workbook.addWorksheet("Data");

    createInfoSheet(infoSheet, items, xCenters, yDescending);
    createLayoutSheet(layoutSheet, items, xCenters, yDescending);
    createRawSheet(rawSheet, items, xCenters, yDescending);
    createScheduleSheet(scheduleSheet, items);
    const processedRows = createDataSheet(dataSheet, items, workbook);

    // Get Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer();

    // Generate CSV
    let csvBuffer = null;
    if (processedRows && processedRows.length > 0) {
        csvBuffer = generateCsvBuffer(processedRows);
    }

    return {
        excelBuffer,
        csvBuffer,
        processedRows,
        itemCount: items.length,
        xClusterCount: xCenters.length,
        yRowCount: yDescending.length,
        rowCount: processedRows ? processedRows.length : 0
    };
}


// ============================================================
// GENERATE CSV BUFFER
// ============================================================

export function generateCsvBuffer(rows) {
    if (!rows || rows.length === 0) {
        return null;
    }

    const headers = [
        "Detail Mark",
        "Start Storey",
        "End Storey",
        "Material Grade",
        "Width (mm)",
        "Breadth (mm)",
        "Main Rebar",
        "Stirrups",
        "Construction Method",
        "Arrangement Type",
        "Splice/Dowels",
        "Remark",
        "Refer To 2D Detail"
    ];

    let csvContent = headers.join(",") + "\n";

    for (const row of rows) {
        const rowData = [
            escapeCsvValue(row.detail_mark || ""),
            escapeCsvValue(row.start_storey || ""),
            escapeCsvValue(row.end_storey || ""),
            escapeCsvValue(row.material_grade || ""),
            row.width_mm !== null && row.width_mm !== undefined ? row.width_mm : "",
            row.breadth_mm !== null && row.breadth_mm !== undefined ? row.breadth_mm : "",
            escapeCsvValue(row.main_rebar || ""),
            escapeCsvValue(row.stirrups || ""),
            escapeCsvValue(row.construction_method || ""),
            escapeCsvValue(row.arrangement_type || ""),
            escapeCsvValue(row.splice_dowels || ""),
            escapeCsvValue(row.remark || ""),
            escapeCsvValue(row.refer_to_2d_detail || "")
        ];

        csvContent += rowData.join(",") + "\n";
    }

    return Buffer.from(csvContent, "utf8");
}


// ============================================================
// EXPRESS SERVER
// ============================================================

const app = express();

// Configure CORS properly
app.use(cors({
    origin: '*', // Allow all origins for testing
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'PDF to Excel/CSV Converter API',
        endpoints: [
            'POST /convert/excel - Download Excel file',
            'POST /convert/csv - Download CSV file',
            'POST /convert/both - Download both files as base64'
        ]
    });
});

// Download Excel
app.post('/convert/excel', async (req, res) => {
    try {
        const result = await generateFiles(req.body);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="output.xlsx"');
        res.setHeader('Content-Length', result.excelBuffer.length);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(result.excelBuffer);
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download CSV
app.post('/convert/csv', async (req, res) => {
    try {
        const result = await generateFiles(req.body);

        if (!result.csvBuffer) {
            return res.status(404).json({ error: 'No data to export to CSV' });
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="output_data.csv"');
        res.setHeader('Content-Length', result.csvBuffer.length);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(result.csvBuffer);
    } catch (error) {
        console.error('Error generating CSV:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download both as base64 (for frontend to handle)
app.post('/convert/both', async (req, res) => {
    try {
        const result = await generateFiles(req.body);

        res.json({
            success: true,
            excel: result.excelBuffer.toString('base64'),
            csv: result.csvBuffer ? result.csvBuffer.toString('base64') : null,
            rowCount: result.rowCount,
            itemCount: result.itemCount
        });
    } catch (error) {
        console.error('Error generating files:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve temp files (for debugging)
app.get('/temp/:filename', (req, res) => {
    const filePath = path.join(TEMP_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});


// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

export function startServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Excel endpoint: POST http://localhost:${PORT}/convert/excel`);
        console.log(`📄 CSV endpoint: POST http://localhost:${PORT}/convert/csv`);
        console.log(`📦 Both files: POST http://localhost:${PORT}/convert/both`);
    });
}

// ... (keep all the other functions like getInputJson, readTextFile, etc. from your original code) ...

// ============================================================
// CLI ENTRYPOINT
// ============================================================

// Check if --server flag is passed
const isServerMode = process.argv.includes('--server');

if (isServerMode) {
    startServer();
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error("\nCoord schedule exporter failed:");
        console.error(error);
        process.exit(1);
    });
}