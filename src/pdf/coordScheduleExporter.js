import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

// ============================================================
// CONFIGURATION
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, "output.xlsx");
const OUTPUT_CSV_FILE = path.join(__dirname, "output_data.csv");

const TEMP_DIR = path.join(__dirname, "temp");

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const X_TOLERANCE = 4.0;
const Y_TOLERANCE = 2.5;


// ============================================================
// HEADER STYLE SWITCH
//   "friendly" -> "Detail Mark", "Width (mm)", ...
//   "internal" -> "DetailMark",  "Thickness", ...
// ============================================================

const HEADER_STYLE = "friendly";


// ============================================================
// CANONICAL COLUMN DEFINITIONS
// Each column: { key, friendly, internal, prop, required? }
//   key      : stable internal id (used for PDF header matching)
//   friendly : label for "friendly" style
//   internal : label for "internal" style
//   prop     : JSON property name on the row object
//   required : if true, always include even if not detected
// ============================================================

const COLUMNS = [
    { key: "DetailMark",         friendly: "Detail Mark",         internal: "DetailMark",         prop: "detail_mark",         required: true  },
    { key: "DetailStartStorey",  friendly: "Start Storey",        internal: "DetailStartStorey",  prop: "start_storey" },
    { key: "DetailEndstorey",    friendly: "End Storey",          internal: "DetailEndstorey",    prop: "end_storey" },
    { key: "MaterialGrade",      friendly: "Material Grade",      internal: "MaterialGrade",      prop: "material_grade" },
    { key: "Thickness",          friendly: "Width (mm)",          internal: "Thickness",          prop: "width_mm" },
    { key: "Length",             friendly: "Breadth (mm)",        internal: "Length",             prop: "breadth_mm" },
    { key: "MainRebar",          friendly: "Main Rebar",          internal: "MainRebar",          prop: "main_rebar" },
    { key: "VerticalRebar",      friendly: "Vertical Rebar",      internal: "VerticalRebar",      prop: "vertical_rebar" },
    { key: "HorizontalRebar",    friendly: "Horizontal Rebar",    internal: "HorizontalRebar",    prop: "horizontal_rebar" },
    { key: "Stirrups",           friendly: "Stirrups",            internal: "Stirrups",           prop: "stirrups" },
    { key: "ConstructionMethod", friendly: "Construction Method", internal: "ConstructionMethod", prop: "construction_method" },
    { key: "ArrangementType",    friendly: "Arrangement Type",    internal: "ArrangementType",    prop: "arrangement_type" },
    { key: "Splice/Dowels",      friendly: "Splice/Dowels",       internal: "Splice/Dowels",      prop: "splice_dowels" },
    { key: "Remark",             friendly: "Remark",              internal: "Remark",             prop: "remark" },
    { key: "ReferTo2DDetail",    friendly: "Refer To 2D Detail",  internal: "ReferTo2DDetail",    prop: "refer_to_2d_detail" }
];

function headerLabel(col) {
    return HEADER_STYLE === "internal" ? col.internal : col.friendly;
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    console.log("");
    console.log("==============================================");
    console.log(" PDF JSON -> EXCEL");
    console.log("==============================================");
    console.log("");

    const json = await getInputJson();

    if (!json) {
        console.error("");
        console.error("No valid JSON input.");
        process.exit(1);
    }

    const items = extractItems(json);

    console.log("");
    console.log(`Coordinate objects found: ${items.length}`);

    if (items.length === 0) {
        console.error("No text coordinate objects were found.");
        process.exit(1);
    }

    const xValues = items.map(item => item.x);
    const yValues = items.map(item => item.y);
    const xCenters = clusterCoordinates(xValues, X_TOLERANCE);
    const yCenters = clusterCoordinates(yValues, Y_TOLERANCE);
    const yDescending = [...yCenters].sort((a, b) => b - a);

    console.log(`X coordinate clusters: ${xCenters.length}`);
    console.log(`Y coordinate rows: ${yDescending.length}`);

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

    // ------------------------------------------------
    // Resolve which columns actually exist on the PDF
    // ------------------------------------------------
    const detection = detectActiveColumns(items);
    const activeColumns = detection.activeColumns;

    console.log("");
    console.log("Active columns (present on PDF):");
    activeColumns.forEach(c => console.log(`  - ${c.key} (${headerLabel(c)})`));
    console.log("");

    createScheduleSheet(scheduleSheet, items, activeColumns);
    const processedRows = createDataSheet(dataSheet, items, workbook, activeColumns);

    console.log("");
    console.log("Saving Excel...");

    await workbook.xlsx.writeFile(OUTPUT_FILE);

    console.log("");
    console.log("==============================================");
    console.log(" COMPLETE");
    console.log("==============================================");
    console.log("");
    console.log(`Output: ${OUTPUT_FILE}`);

    if (processedRows && processedRows.length > 0) {
        console.log("");
        console.log(`Exporting CSV with ${processedRows.length} rows...`);

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const csvFilename = `output_data_${timestamp}.csv`;
            const csvPath = path.join(TEMP_DIR, csvFilename);

            const csvResult = await exportToCsv(processedRows, csvPath, activeColumns);

            if (csvResult) {
                console.log(`CSV saved to: ${csvPath}`);
                console.log(`To download, access: /temp/${csvFilename}`);

                fs.copyFileSync(csvPath, OUTPUT_CSV_FILE);
                console.log(`CSV also saved to: ${OUTPUT_CSV_FILE}`);
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
// COLUMN DETECTION
// ------------------------------------------------------------
// Returns { activeColumns, foundHeaders }
// activeColumns = COLUMNS entries actually detected on the PDF
// (plus any with required: true)
// ============================================================

function detectActiveColumns(items) {

    const foundHeaders = [];

    for (const col of COLUMNS) {
        const matches = findHeaderMatches(items, col.key);

        if (matches.length > 0) {
            const selected = matches.reduce((best, current) =>
                current.y > best.y ? current : best
            );

            foundHeaders.push({
                key: col.key,
                col,
                x: selected.x,
                y: selected.y,
                width: selected.width,
                height: selected.height,
                text: selected.text
            });
        }
    }

    // Position-based fallback only if we found very few headers
    if (foundHeaders.length === 0) {
        console.log("No headers detected by name. Using position-based fallback...");

        const headerY = Math.max(...items.map(item => item.y));
        const headerItems = items.filter(item => Math.abs(item.y - headerY) < 5);

        const xGroups = new Map();
        for (const item of headerItems) {
            const xKey = Math.round(item.x / 2) * 2;
            if (!xGroups.has(xKey)) xGroups.set(xKey, []);
            xGroups.get(xKey).push(item);
        }

        const sortedX = Array.from(xGroups.keys()).sort((a, b) => a - b);

        for (let i = 0; i < sortedX.length && i < COLUMNS.length; i++) {
            const xKey = sortedX[i];
            const itemsAtX = xGroups.get(xKey);
            const text = itemsAtX.map(it => it.text.trim()).join(" ");
            const avgX = itemsAtX.reduce((sum, it) => sum + it.x, 0) / itemsAtX.length;

            // Try to match by name first
            let matchedCol = null;
            const normalizedText = normalizeHeaderText(text);

            for (const col of COLUMNS) {
                const aliases = headerAliases[col.key] || [col.key];
                for (const alias of aliases) {
                    const normalizedAlias = normalizeHeaderText(alias);
                    if (normalizedText.includes(normalizedAlias) ||
                        normalizedAlias.includes(normalizedText)) {
                        matchedCol = col;
                        break;
                    }
                }
                if (matchedCol) break;
            }

            // Otherwise fall back to positional column
            if (!matchedCol) matchedCol = COLUMNS[i];

            foundHeaders.push({
                key: matchedCol.key,
                col: matchedCol,
                x: avgX,
                y: headerY,
                width: 0,
                height: 0,
                text: text
            });
        }
    }

    // Build active column set
    const seen = new Set();
    const activeColumns = [];

    for (const col of COLUMNS) {
        const isFound = foundHeaders.some(h => h.key === col.key);
        const isRequired = col.required === true;

        if ((isFound || isRequired) && !seen.has(col.key)) {
            activeColumns.push(col);
            seen.add(col.key);
        }
    }

    return { activeColumns, foundHeaders };
}


// ============================================================
// EXPORT TO CSV
// ============================================================

async function exportToCsv(rows, outputPath, activeColumns) {

    if (!rows || rows.length === 0) {
        console.log("No data rows to export to CSV.");
        return null;
    }

    console.log(`Preparing to export ${rows.length} rows to CSV...`);

    const headers = activeColumns.map(headerLabel);

    let csvContent = headers.map(escapeCsvValue).join(",") + "\n";

    let exportedCount = 0;
    for (const row of rows) {
        if (exportedCount === 0) {
            console.log("Sample row data:", JSON.stringify(row, null, 2));
        }

        const rowData = activeColumns.map(col => {
            const value = row[col.prop];
            return value !== null && value !== undefined ? escapeCsvValue(value) : "";
        });

        csvContent += rowData.join(",") + "\n";
        exportedCount++;
    }

    console.log(`Built CSV with ${exportedCount} rows.`);

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

    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}


// ============================================================
// GET CSV AS BUFFER
// ============================================================

export function getCsvBuffer(rows, activeColumns) {
    if (!rows || rows.length === 0) {
        return null;
    }

    const cols = activeColumns && activeColumns.length > 0
        ? activeColumns
        : COLUMNS;

    const headers = cols.map(headerLabel);

    let csvContent = headers.map(escapeCsvValue).join(",") + "\n";

    for (const row of rows) {
        const rowData = cols.map(col => {
            const value = row[col.prop];
            return value !== null && value !== undefined ? escapeCsvValue(value) : "";
        });
        csvContent += rowData.join(",") + "\n";
    }

    return Buffer.from(csvContent, "utf8");
}


// ============================================================
// GET EXCEL AS BUFFER
// ============================================================

export async function getExcelBuffer(json) {
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

    const detection = detectActiveColumns(items);
    const activeColumns = detection.activeColumns;

    createScheduleSheet(scheduleSheet, items, activeColumns);
    const processedRows = createDataSheet(dataSheet, items, workbook, activeColumns);

    const buffer = await workbook.xlsx.writeBuffer();

    return {
        buffer,
        processedRows,
        activeColumns: activeColumns.map(c => c.key),
        itemCount: items.length,
        xClusterCount: xCenters.length,
        yRowCount: yDescending.length,
        rowCount: processedRows ? processedRows.length : 0
    };
}


// ============================================================
// WEB SERVER RESPONSE HELPERS
// ============================================================

export function getCsvDownloadHeaders(filename = "output_data.csv") {
    return {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`
    };
}

export function getExcelDownloadHeaders(filename = "output.xlsx") {
    return {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`
    };
}


// ============================================================
// INPUT MENU
// ============================================================

async function getInputJson() {
    console.log("Select input method:");
    console.log("");
    console.log("1. TXT file");
    console.log("2. JSON file");
    console.log("3. Direct JSON string");
    console.log("");

    const choice = await askQuestion("Enter 1, 2 or 3: ");

    switch (choice.trim()) {
        case "1": return await readTextFile();
        case "2": return await readJsonFile();
        case "3": return await readDirectJson();
        default:
            console.error("");
            console.error("Invalid selection.");
            return null;
    }
}

async function readTextFile() {
    const filePath = await askQuestion("Enter TXT file path: ");
    const resolvedPath = resolveFilePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
        console.error("");
        console.error("File not found:");
        console.error(resolvedPath);
        return null;
    }

    console.log("");
    console.log(`Reading TXT: ${resolvedPath}`);

    const raw = fs.readFileSync(resolvedPath, "utf8");
    return parseJsonText(raw);
}

async function readJsonFile() {
    const filePath = await askQuestion("Enter JSON file path: ");
    const resolvedPath = resolveFilePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
        console.error("");
        console.error("File not found:");
        console.error(resolvedPath);
        return null;
    }

    console.log("");
    console.log(`Reading JSON: ${resolvedPath}`);

    const raw = fs.readFileSync(resolvedPath, "utf8");
    return parseJsonText(raw);
}

async function readDirectJson() {
    console.log("");
    console.log("Paste your JSON below.");
    console.log("");
    console.log("Press ENTER on an empty line when finished.");
    console.log("");

    const lines = [];
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.on("line", line => {
            if (line.trim() === "") {
                rl.close();
                const raw = lines.join("\n");
                resolve(parseJsonText(raw));
                return;
            }
            lines.push(line);
        });
    });
}

function parseJsonText(raw) {
    if (!raw || !raw.trim()) {
        console.error("JSON input is empty.");
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error("");
        console.error("==============================================");
        console.error("INVALID JSON");
        console.error("==============================================");
        console.error(error.message);
        console.error("");
        return null;
    }
}

function resolveFilePath(filePath) {
    let cleanPath = filePath.trim();

    if (
        (cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))
    ) {
        cleanPath = cleanPath.substring(1, cleanPath.length - 1);
    }

    if (path.isAbsolute(cleanPath)) {
        return cleanPath;
    }

    return path.join(__dirname, cleanPath);
}

function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}


// ============================================================
// EXTRACT ITEMS
// ============================================================

function extractItems(json) {
    const result = [];

    if (json && Array.isArray(json.rows)) {
        for (const page of json.rows) {
            const pageNumber = page.pageNumber ?? 1;
            if (!Array.isArray(page.items)) continue;
            for (const item of page.items) addItem(result, item, pageNumber);
        }
        return result;
    }

    if (Array.isArray(json)) {
        for (const item of json) addItem(result, item, 1);
        return result;
    }

    return result;
}

function addItem(result, item, pageNumber) {
    if (!item) return;

    if (
        item.text === undefined ||
        item.x === undefined ||
        item.y === undefined ||
        item.width === undefined ||
        item.height === undefined
    ) return;

    const x = Number(item.x);
    const y = Number(item.y);
    const width = Number(item.width);
    const height = Number(item.height);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
    ) return;

    result.push({
        page: pageNumber,
        text: String(item.text),
        x, y, width, height
    });
}


// ============================================================
// CLUSTER COORDINATES
// ============================================================

function clusterCoordinates(values, tolerance) {
    const sorted = [...values].sort((a, b) => a - b);
    const centers = [];
    const groups = [];

    for (const value of sorted) {
        if (centers.length === 0) {
            centers.push(value);
            groups.push([value]);
            continue;
        }

        const lastIndex = centers.length - 1;
        const distance = Math.abs(value - centers[lastIndex]);

        if (distance <= tolerance) {
            groups[lastIndex].push(value);
            centers[lastIndex] =
                groups[lastIndex].reduce((sum, v) => sum + v, 0) /
                groups[lastIndex].length;
        } else {
            centers.push(value);
            groups.push([value]);
        }
    }

    return centers;
}


// ============================================================
// FIND NEAREST CENTER
// ============================================================

function nearestIndex(value, centers) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < centers.length; i++) {
        const distance = Math.abs(value - centers[i]);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }

    return bestIndex;
}


// ============================================================
// INFO SHEET
// ============================================================

function createInfoSheet(sheet, items, xCenters, yCenters) {
    sheet.mergeCells("A1:B1");
    sheet.getCell("A1").value = "PDF JSON → Excel Coordinate Reconstruction";
    sheet.getCell("A1").font = { bold: true, size: 16 };

    const pageSet = new Set(items.map(item => item.page));

    const data = [
        ["Pages", pageSet.size],
        ["Coordinate Objects", items.length],
        ["X Coordinate Clusters", xCenters.length],
        ["Y Coordinate Rows", yCenters.length]
    ];

    data.forEach((row, index) => {
        const rowNumber = index + 3;
        sheet.getCell(rowNumber, 1).value = row[0];
        sheet.getCell(rowNumber, 2).value = row[1];
        sheet.getCell(rowNumber, 1).font = { bold: true };
    });

    sheet.getCell("A8").value = "Processing";
    sheet.getCell("B8").value = "X coordinates determine Excel columns. Y coordinates determine Excel rows.";

    sheet.getCell("A9").value = "Y Direction";
    sheet.getCell("B9").value = "PDF Y coordinates are reversed to produce top-to-bottom Excel rows.";

    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 100;

    for (let row = 3; row <= 9; row++) {
        sheet.getCell(row, 2).alignment = { vertical: "top", wrapText: true };
    }
}


// ============================================================
// LAYOUT SHEET
// ============================================================

function createLayoutSheet(sheet, items, xCenters, yCenters) {
    const cells = new Map();

    for (const item of items) {
        const row = nearestIndex(item.y, yCenters) + 1;
        const column = nearestIndex(item.x, xCenters) + 1;
        const key = `${row}:${column}`;

        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(item);
    }

    for (const [key, objects] of cells) {
        const [row, column] = key.split(":").map(Number);

        objects.sort((a, b) => a.x - b.x);

        const text = combineText(objects);
        const cell = sheet.getCell(row, column);

        cell.value = text;
        cell.alignment = { vertical: "center", horizontal: "left", wrapText: false };
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
        };
    }

    for (let i = 0; i < xCenters.length; i++) {
        let spacing = 12;
        if (i < xCenters.length - 1) {
            spacing = Math.abs(xCenters[i + 1] - xCenters[i]);
        }
        sheet.getColumn(i + 1).width = Math.max(3, Math.min(32, spacing / 5));
    }

    for (let i = 0; i < yCenters.length; i++) {
        let spacing = 12;
        if (i < yCenters.length - 1) {
            spacing = Math.abs(yCenters[i] - yCenters[i + 1]);
        }
        sheet.getRow(i + 1).height = Math.max(12, Math.min(32, spacing * 0.8));
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];
}


// ============================================================
// COMBINE TEXT
// ============================================================

function combineText(objects) {
    const values = [];

    for (const object of objects) {
        const text = object.text.trim();
        if (!text) continue;
        if (!values.includes(text)) values.push(text);
    }

    return values.join(" ");
}


// ============================================================
// RAW COORDINATES
// ============================================================

function createRawSheet(sheet, items, xCenters, yCenters) {
    const headers = [
        "Page", "Text", "X", "Y", "Width", "Height", "Excel Row", "Excel Column"
    ];

    sheet.addRow(headers);

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "center" };

    for (const item of items) {
        const excelRow = nearestIndex(item.y, yCenters) + 1;
        const excelColumn = nearestIndex(item.x, xCenters) + 1;

        sheet.addRow([
            item.page, item.text, item.x, item.y,
            item.width, item.height, excelRow, excelColumn
        ]);
    }

    if (sheet.rowCount > 1) {
        sheet.autoFilter = {
            from: "A1",
            to: `${getExcelColumnName(headers.length)}${sheet.rowCount}`
        };
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const widths = [10, 50, 16, 16, 16, 16, 14, 16];
    widths.forEach((width, index) => {
        sheet.getColumn(index + 1).width = width;
    });

    for (let row = 2; row <= sheet.rowCount; row++) {
        for (let column = 3; column <= 6; column++) {
            sheet.getCell(row, column).numFmt = "0.000";
        }
    }
}


// ============================================================
// NORMALIZE HEADER TEXT
// ============================================================

function normalizeHeaderText(text) {
    let value = String(text || "").trim().toLowerCase();

    value = value.replace(/\s+/g, "");
    value = value.replace(/\\/g, "/");
    value = value.replace(/[,.:;'"`]/g, "");

    value = value.replace(/^splicesplice\//, "splice/");
    value = value.replace(/^splicesplicedowels$/, "splicedowels");
    value = value.replace(/^arrangementarrangementtype$/, "arrangementtype");
    value = value.replace(/^refertorefer2ddetail$/, "refer2ddetail");

    return value;
}


// ============================================================
// HEADER ALIASES
// ============================================================

const headerAliases = {
    "DetailMark": ["DetailMark", "Detail Mark", "Mark", "mark"],
    "DetailStartStorey": ["DetailStartStorey", "Detail Start Storey"],
    "DetailEndstorey": ["DetailEndstorey", "DetailEndStorey", "Detail End Storey"],
    "MaterialGrade": ["MaterialGrade", "Material Grade"],
    "Breadth": ["Breadth"],
    "Length": ["Length"],
    "Width": ["Width"],
    "Thickness": ["Thickness"],
    "MainRebar": ["MainRebar", "Main Rebar", "Length"],
    "VerticalRebar": ["VerticalRebar", "Vertical Rebar", "V-Rebar", "V Rebar"],
    "HorizontalRebar": ["HorizontalRebar", "Horizontal Rebar", "H-Rebar", "H Rebar"],
    "Stirrups": ["Stirrups", "Thickness"],
    "ConstructionMethod": ["ConstructionMethod", "Construction Method", "ArrangementType"],
    "ArrangementType": ["ArrangementType", "Arrangement Type"],
    "Splice/Dowels": ["Splice/Dowels", "Splice / Dowels", "SpliceDowels", "Splice Dowels"],
    "Remark": ["Remark"],
    "ReferTo2DDetail": ["ReferTo2DDetail", "Refer To 2D Detail", "ReferTo2D Details", "Refer To 2D Details"]
};


// ============================================================
// FIND HEADER MATCHES
// ============================================================

function findHeaderMatches(items, headerName) {
    const aliases = headerAliases[headerName] || [headerName];

    const normalizedAliases = aliases.map(alias => normalizeHeaderText(alias));

    return items.filter(item => {
        const text = normalizeHeaderText(item.text);
        return normalizedAliases.includes(text);
    });
}


// ============================================================
// COLUMN SCHEDULE
// ============================================================

function createScheduleSheet(sheet, items, activeColumns) {

    const foundHeaders = [];

    for (const col of activeColumns) {
        const matches = findHeaderMatches(items, col.key);

        if (matches.length > 0) {
            const selected = matches.reduce((best, current) =>
                current.y > best.y ? current : best
            );

            foundHeaders.push({
                key: col.key,
                col,
                x: selected.x,
                y: selected.y,
                width: selected.width,
                height: selected.height,
                text: selected.text
            });
        }
    }

    console.log("");
    console.log("Detected schedule headers:");
    if (foundHeaders.length === 0) {
        console.log("  NONE");
    } else {
        foundHeaders.forEach(header => {
            console.log(`  ${header.key} -> X=${header.x}, Y=${header.y}, text="${header.text}"`);
        });
    }
    console.log("");

    if (foundHeaders.length === 0) {
        sheet.getCell("A1").value = "No schedule headers detected.";
        return;
    }

    foundHeaders.sort((a, b) => a.x - b.x);

    foundHeaders.forEach((header, index) => {
        const cell = sheet.getCell(1, index + 1);
        cell.value = headerLabel(header.col);
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
        };
    });

    sheet.getRow(1).height = 30;

    const headerY = Math.max(...foundHeaders.map(h => h.y));

    const scheduleItems = items.filter(item => {
        if (item.y > headerY + 2) return false;
        if (item.x < 60 || item.x > 800) return false;
        return true;
    });

    const yValues = scheduleItems.map(item => item.y);

    if (yValues.length === 0) {
        console.log("No schedule data rows detected.");
        return;
    }

    const scheduleRows = clusterCoordinates(yValues, Y_TOLERANCE).sort((a, b) => b - a);

    const scheduleCells = new Map();

    for (const item of scheduleItems) {
        const row = nearestIndex(item.y, scheduleRows) + 2;
        const column = findScheduleColumn(item.x, foundHeaders);

        if (column < 1) continue;

        const key = `${row}:${column}`;
        if (!scheduleCells.has(key)) scheduleCells.set(key, []);
        scheduleCells.get(key).push(item);
    }

    for (const [key, objects] of scheduleCells) {
        const [row, column] = key.split(":").map(Number);

        objects.sort((a, b) => a.x - b.x);

        const text = combineText(objects);
        const cell = sheet.getCell(row, column);

        cell.value = text;
        cell.alignment = { vertical: "center", horizontal: "center", wrapText: true };
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
        };
    }

    const widths = {
        DetailMark: 25, DetailStartStorey: 20, DetailEndstorey: 20,
        MaterialGrade: 16, Thickness: 14, Length: 14, Width: 14, Breadth: 14,
        MainRebar: 20, VerticalRebar: 20, HorizontalRebar: 20, Stirrups: 20,
        ConstructionMethod: 20, ArrangementType: 20, "Splice/Dowels": 18,
        Remark: 22, ReferTo2DDetail: 22
    };

    for (let i = 0; i < foundHeaders.length; i++) {
        sheet.getColumn(i + 1).width = widths[foundHeaders[i].key] || 15;
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    if (sheet.rowCount > 1) {
        sheet.autoFilter = {
            from: "A1",
            to: `${getExcelColumnName(foundHeaders.length)}${sheet.rowCount}`
        };
    }
}


// ============================================================
// FIND SCHEDULE COLUMN
// ============================================================

function findScheduleColumn(x, headers) {
    if (!headers || headers.length === 0) return -1;

    for (let i = 0; i < headers.length - 1; i++) {
        const current = headers[i];
        const next = headers[i + 1];

        const currentCenter = current.x + (Number(current.width || 0) / 2);
        const nextCenter = next.x + (Number(next.width || 0) / 2);
        const boundary = (currentCenter + nextCenter) / 2;

        if (x < boundary) return i + 1;
    }

    return headers.length;
}


// ============================================================
// DATA SHEET
// ============================================================

function createDataSheet(sheet, items, workbook, activeColumns) {

    const headerKeys = activeColumns.map(c => c.key);

    let foundHeaders = [];

    for (const headerKey of headerKeys) {
        const matches = findHeaderMatches(items, headerKey);
        if (matches.length > 0) {
            const selected = matches.reduce((best, current) =>
                current.y > best.y ? current : best
            );
            foundHeaders.push({
                key: headerKey,
                x: selected.x,
                y: selected.y,
                text: selected.text
            });
        }
    }

    // Position-based fallback
    if (foundHeaders.length < headerKeys.length) {
        console.log("Not all headers found. Using position-based detection...");

        const headerY = Math.max(...items.map(item => item.y));
        const headerItems = items.filter(item => Math.abs(item.y - headerY) < 5);

        const xGroups = new Map();
        for (const item of headerItems) {
            const xKey = Math.round(item.x / 2) * 2;
            if (!xGroups.has(xKey)) xGroups.set(xKey, []);
            xGroups.get(xKey).push(item);
        }

        const sortedX = Array.from(xGroups.keys()).sort((a, b) => a - b);

        const detectedHeaders = [];
        for (const xKey of sortedX) {
            const itemsAtX = xGroups.get(xKey);
            const text = itemsAtX.map(i => i.text.trim()).join(" ");

            let matchedHeader = null;
            const normalizedText = normalizeHeaderText(text);

            for (const h of headerKeys) {
                const aliases = headerAliases[h] || [h];
                for (const alias of aliases) {
                    const normalizedAlias = normalizeHeaderText(alias);
                    if (normalizedText.includes(normalizedAlias) ||
                        normalizedAlias.includes(normalizedText)) {
                        matchedHeader = h;
                        break;
                    }
                }
                if (matchedHeader) break;
            }

            if (!matchedHeader) {
                const idx = detectedHeaders.length;
                if (idx < headerKeys.length) matchedHeader = headerKeys[idx];
            }

            if (matchedHeader) {
                const avgX = itemsAtX.reduce((sum, i) => sum + i.x, 0) / itemsAtX.length;
                detectedHeaders.push({
                    key: matchedHeader,
                    x: avgX,
                    y: headerY,
                    text: text
                });
            }
        }

        if (detectedHeaders.length > foundHeaders.length) {
            foundHeaders = detectedHeaders;
        }
    }

    foundHeaders.sort((a, b) => a.x - b.x);

    if (foundHeaders.length === 0) {
        const xValues = items.map(item => item.x);
        const xCenters = clusterCoordinates(xValues, X_TOLERANCE);
        const xSorted = [...xCenters].sort((a, b) => a - b);

        xSorted.forEach((x, index) => {
            const headerKey = headerKeys[index] || `Column${index + 1}`;
            foundHeaders.push({ key: headerKey, x: x, y: 0, text: headerKey });
        });
    }

    const xSortedHeaders = [...foundHeaders].sort((a, b) => a.x - b.x);

    const headerY = xSortedHeaders.length > 0
        ? Math.max(...xSortedHeaders.map(h => h.y))
        : 0;

    const scheduleItems = items.filter(item => {
        if (item.y > headerY + 2) return false;
        if (item.x < 60 || item.x > 800) return false;
        return true;
    });

    if (scheduleItems.length === 0) {
        sheet.getCell("A1").value = "No schedule data found.";
        return [];
    }

    const yValues = scheduleItems.map(item => item.y);
    const scheduleRows = clusterCoordinates(yValues, Y_TOLERANCE).sort((a, b) => b - a);

    console.log("");
    console.log("Found headers with positions (X-sorted):");
    xSortedHeaders.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.key} -> X=${h.x.toFixed(2)}`);
    });
    console.log("");

    const rowGroups = new Map();
    for (const item of scheduleItems) {
        const row = nearestIndex(item.y, scheduleRows);
        const col = findScheduleColumn(item.x, xSortedHeaders);
        if (col < 1) continue;

        const key = `${row}:${col}`;
        if (!rowGroups.has(key)) rowGroups.set(key, []);
        rowGroups.get(key).push(item);
    }

    const sortedRows = [...scheduleRows].sort((a, b) => b - a);

    const allRows = [];
    let currentDetailMark = "";

    for (const rowY of sortedRows) {
        const rowIndex = nearestIndex(rowY, scheduleRows);
        const rowData = new Map();

        for (const [key, objects] of rowGroups) {
            const [r, c] = key.split(":").map(Number);
            if (r === rowIndex + 1) {
                const text = combineText(objects);
                const header = xSortedHeaders[c - 1];
                if (header) rowData.set(header.key, text);
            }
        }

        const detailMarkValue =
            rowData.get("DetailMark") ||
            rowData.get("Mark") ||
            "";
        const isDetailMarkRow = /^43[C|P]/.test(detailMarkValue);

        if (isDetailMarkRow) {
            currentDetailMark = detailMarkValue;
            console.log(`Detail mark found: "${currentDetailMark}" at row ${rowIndex + 1}`);
        } else if (currentDetailMark) {
            let hasData = false;
            for (const [, value] of rowData) {
                if (value && value.trim() && value.trim() !== "A") {
                    hasData = true;
                    break;
                }
            }
            if (hasData) {
                allRows.push({
                    detail_mark: currentDetailMark,
                    rowData: rowData,
                    rowIndex: rowIndex
                });
            }
        }
    }

    const processedRows = [];

    for (const row of allRows) {
        const rowData = row.rowData;
        const rowIndex = row.rowIndex;
        const currentDetailMark = row.detail_mark;

        let materialGrade = rowData.get("MaterialGrade") || "";
        let width = rowData.get("Width") || rowData.get("Thickness") || "";
        let breadth = rowData.get("Breadth") || rowData.get("Length") || "";
        let mainRebar = rowData.get("MainRebar") || rowData.get("Length") || "";
        let verticalRebar = rowData.get("VerticalRebar") || "";
        let horizontalRebar = rowData.get("HorizontalRebar") || "";
        let stirrups = rowData.get("Stirrups") || rowData.get("Thickness") || "";
        let constructionMethod = rowData.get("ConstructionMethod") || rowData.get("ArrangementType") || "";
        let arrangementType = rowData.get("ArrangementType") || "";
        let spliceDowels = rowData.get("Splice/Dowels") || "";
        let remark = rowData.get("Remark") || "";
        let startStorey = rowData.get("DetailStartStorey") || "";
        let endStorey = rowData.get("DetailEndstorey") || "";

        // FILTER 1
        let hasOtherData = false;
        for (const [, value] of rowData) {
            const trimmedValue = value.trim();
            if (trimmedValue && trimmedValue !== "A") {
                hasOtherData = true;
                break;
            }
        }
        if (!hasOtherData) {
            console.log(`Filter 1: Skipping row ${rowIndex + 1} - only contains "A" values`);
            continue;
        }

        // FILTER 2
        const firstThreeKeys = xSortedHeaders.slice(0, 3).map(h => h.key);
        let firstThreeEmpty = true;
        for (const headerKey of firstThreeKeys) {
            const value = rowData.get(headerKey) || "";
            if (value.trim() !== "") {
                firstThreeEmpty = false;
                break;
            }
        }
        if (firstThreeEmpty) {
            console.log(`Filter 2: Skipping row ${rowIndex + 1} - first 3 cells are empty`);
            continue;
        }

        // FILTER 3
        const col2Key = xSortedHeaders.length > 1 ? xSortedHeaders[1].key : null;
        const col3Key = xSortedHeaders.length > 2 ? xSortedHeaders[2].key : null;

        let col2Empty = true;
        let col3Empty = true;

        if (col2Key) {
            const value = rowData.get(col2Key) || "";
            if (value.trim() !== "") col2Empty = false;
        }
        if (col3Key) {
            const value = rowData.get(col3Key) || "";
            if (value.trim() !== "") col3Empty = false;
        }
        if (col2Empty && col3Empty) {
            console.log(`Filter 3: Skipping row ${rowIndex + 1} - columns 2 & 3 are empty`);
            continue;
        }

        const allText = Array.from(rowData.values()).filter(v => v).join(" ");
        console.log(`Row ${rowIndex + 1} combined: "${allText}"`);

        // Arrangement type
        const arrangementPattern = /\b(\d+)-TIER\b/i;
        const arrangementMatch = allText.match(arrangementPattern);
        if (arrangementMatch) {
            arrangementType = arrangementMatch[0].toUpperCase();
        }

        // Splice/dowels
        const splicePattern = /\b\d+[A-Z]\d+\s*[\(p\)]+\b/gi;
        const spliceMatches = allText.match(splicePattern);
        if (spliceMatches && spliceMatches.length > 0) {
            const validSplices = spliceMatches.filter(match => {
                const cleanMatch = match.replace(/[^A-Z0-9]/g, "");
                if (mainRebar && mainRebar.replace(/[^A-Z0-9]/g, "") === cleanMatch) return false;
                if (stirrups && stirrups.includes(cleanMatch)) return false;
                if (!match.includes("p") && !match.includes("s")) return false;
                return true;
            });
            if (validSplices.length > 0) spliceDowels = validSplices[0];
        }

        if (!spliceDowels) {
            const flexPattern = /\b(\d+[A-Z]\d+)\s*[\(p\)]+\b/gi;
            const flexMatches = allText.match(flexPattern);
            if (flexMatches && flexMatches.length > 0) {
                const validMatches = flexMatches.filter(m => {
                    const cleanMatch = m.replace(/[^A-Z0-9]/g, "");
                    if (mainRebar && mainRebar.replace(/[^A-Z0-9]/g, "") === cleanMatch) return false;
                    return true;
                });
                if (validMatches.length > 0) spliceDowels = validMatches[0];
            }
        }

        if (!spliceDowels) {
            const directSplice = rowData.get("Splice/Dowels") || "";
            if (directSplice && /[A-Z]\d+[\(p\)]/.test(directSplice)) {
                spliceDowels = directSplice;
            }
        }

        // Breadth extraction
        let breadthValue = rowData.get("Breadth") || rowData.get("Length") || "";

        if (!breadthValue || isNaN(parseFloat(breadthValue))) {
            const allNumbers = allText.match(/\b\d+\b/g);
            if (allNumbers && allNumbers.length > 0) {
                const dimensionNumbers = allNumbers.filter(n => {
                    const num = parseInt(n);
                    return num >= 100 && num <= 9999;
                });
                if (dimensionNumbers.length >= 2) {
                    breadthValue = dimensionNumbers[1];
                } else if (dimensionNumbers.length === 1) {
                    if (width && !isNaN(parseFloat(width))) breadthValue = dimensionNumbers[0];
                }
            }

            if (!breadthValue && mainRebar) {
                const rebarWithBreadth = mainRebar.match(/^(\d+)\s+([A-Z]\d+)/);
                if (rebarWithBreadth) {
                    breadthValue = rebarWithBreadth[1];
                    mainRebar = rebarWithBreadth[2];
                }
            }

            if (!breadthValue) {
                const pattern = /(\d+)\s+(\d+)\s+([A-Z]\d+)/;
                const match = allText.match(pattern);
                if (match) {
                    const firstNum = match[1];
                    const secondNum = match[2];
                    const rebar = match[3];
                    if (!width || isNaN(parseFloat(width))) width = firstNum;
                    breadthValue = secondNum;
                    if (!mainRebar) mainRebar = rebar;
                }
            }
        }

        if (breadthValue && breadthValue.includes(" ")) {
            const parts = breadthValue.split(/\s+/);
            for (const part of parts) {
                if (/^\d+$/.test(part) && parseInt(part) >= 100) {
                    breadthValue = part;
                    break;
                }
            }
        }

        if (breadthValue && !isNaN(parseFloat(breadthValue))) {
            breadth = breadthValue;
        } else {
            breadth = "";
        }

        // Main rebar and stirrups
        if (mainRebar && /^\d{3,4}$/.test(mainRebar.trim())) mainRebar = "";

        const stirrupsPattern = /\d+[A-Z]\d+-\d+\+\d+[A-Z]\d+-\d+/g;
        const stirrupsMatches = allText.match(stirrupsPattern);
        if (stirrupsMatches && stirrupsMatches.length > 0) {
            stirrups = stirrupsMatches[0];
        }

        const mainRebarPattern = /\b\d{1,3}[A-Z]\d{1,3}\b/g;
        const rebarMatches = allText.match(mainRebarPattern);
        if (rebarMatches && rebarMatches.length > 0) {
            const potentialRebars = rebarMatches.filter(match => {
                if (stirrups && stirrups.includes(match)) return false;
                if (spliceDowels && spliceDowels.includes(match)) return false;
                if (/^\d+$/.test(match)) return false;
                return true;
            });
            if (potentialRebars.length > 0) mainRebar = potentialRebars[0];
        }

        if (!mainRebar) {
            const fallbackPattern = /[A-Z]\d+/g;
            const fallbackMatches = allText.match(fallbackPattern);
            if (fallbackMatches && fallbackMatches.length > 0) {
                const validMatches = fallbackMatches.filter(m => {
                    if (stirrups && stirrups.includes(m)) return false;
                    if (spliceDowels && spliceDowels.includes(m)) return false;
                    return true;
                });
                if (validMatches.length > 0) mainRebar = validMatches[0];
            }
        }

        if (mainRebar && /^\d+\s+/.test(mainRebar)) {
            const parts = mainRebar.split(/\s+/);
            for (const part of parts) {
                if (/[A-Z]/.test(part)) { mainRebar = part; break; }
            }
        }

        if (mainRebar && /^\d{3,4}$/.test(mainRebar.trim())) mainRebar = "";

        if (materialGrade && /^[A-Z]\d+\/\d+/.test(materialGrade)) {
            const parts = materialGrade.split(/\s+/);
            if (parts.length >= 2) {
                materialGrade = parts[0];
                if (parts.length >= 2 && /^\d+$/.test(parts[1])) width = parts[1];
            }
        }

        materialGrade = materialGrade.replace(/\s+\d+.*$/, "").trim();
        width = width.replace(/\s+.*$/, "").trim();
        breadth = breadth.toString().trim();

        // ----------------------------------------------------
        // Build the row object dynamically from activeColumns
        // so absent columns are absent from the JSON.
        // ----------------------------------------------------
        const valuesByProp = {
            detail_mark: currentDetailMark || rowData.get("Mark") || "",
            start_storey: startStorey,
            end_storey: endStorey,
            material_grade: materialGrade,
            width_mm: parseFloat(width) || null,
            breadth_mm: parseFloat(breadth) || null,
            main_rebar: mainRebar || null,
            vertical_rebar: verticalRebar || null,
            horizontal_rebar: horizontalRebar || null,
            stirrups: stirrups || null,
            construction_method: constructionMethod || null,
            arrangement_type: arrangementType || null,
            splice_dowels: spliceDowels || null,
            remark: remark || "",
            refer_to_2d_detail: rowData.get("ReferTo2DDetail") || ""
        };

        const rowObj = {};
        for (const col of activeColumns) {
            rowObj[col.prop] = valuesByProp[col.prop];
        }

        processedRows.push(rowObj);
    }

    console.log("");
    console.log(`Total processed rows: ${processedRows.length}`);
    console.log("");

    // --------------------------------------------------------
    // Write JSON to Data sheet
    // --------------------------------------------------------
    const jsonData = { column_schedule: processedRows };
    const jsonString = JSON.stringify(jsonData, null, 2);
    const lines = jsonString.split('\n');

    lines.forEach((line, index) => {
        const cell = sheet.getCell(index + 1, 1);
        cell.value = line;
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: false };
        cell.font = { name: "Courier New", size: 10 };
    });

    sheet.getColumn(1).width = 80;

    const summaryRow = lines.length + 2;
    sheet.getCell(summaryRow, 1).value = "==========================================";
    sheet.getCell(summaryRow + 1, 1).value = `Total Rows: ${processedRows.length}`;
    sheet.getCell(summaryRow + 2, 1).value = "==========================================";

    // --------------------------------------------------------
    // Data Table sheet - headers and body driven by activeColumns
    // --------------------------------------------------------
    const dataTableSheet = workbook.addWorksheet("Data Table");

    activeColumns.forEach((col, index) => {
        const cell = dataTableSheet.getCell(1, index + 1);
        cell.value = headerLabel(col);
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "center" };
        cell.border = {
            top: { style: "medium" },
            left: { style: "medium" },
            bottom: { style: "medium" },
            right: { style: "medium" }
        };
    });

    let rowNum = 2;
    for (const row of processedRows) {
        activeColumns.forEach((col, colIndex) => {
            const value = row[col.prop];
            const cell = dataTableSheet.getCell(rowNum, colIndex + 1);
            cell.value = value !== null && value !== undefined ? value : "";
            cell.alignment = { horizontal: "center", vertical: "center" };
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" }
            };
        });
        rowNum++;
    }

    const layoutWidths = {
        DetailMark: 25, DetailStartStorey: 20, DetailEndstorey: 20,
        MaterialGrade: 16, Thickness: 14, Length: 14,
        MainRebar: 20, VerticalRebar: 20, HorizontalRebar: 20, Stirrups: 20,
        ConstructionMethod: 20, ArrangementType: 18, "Splice/Dowels": 18,
        Remark: 22, ReferTo2DDetail: 22
    };

    activeColumns.forEach((col, index) => {
        dataTableSheet.getColumn(index + 1).width = layoutWidths[col.key] || 16;
    });

    dataTableSheet.views = [{ state: "frozen", ySplit: 1 }];

    if (dataTableSheet.rowCount > 1) {
        dataTableSheet.autoFilter = {
            from: "A1",
            to: `${getExcelColumnName(activeColumns.length)}${dataTableSheet.rowCount}`
        };
    }

    const summaryRowTable = dataTableSheet.rowCount + 2;
    dataTableSheet.getCell(summaryRowTable, 1).value = "Summary:";
    dataTableSheet.getCell(summaryRowTable + 1, 1).value = `Total Rows: ${processedRows.length}`;

    return processedRows;
}


// ============================================================
// EXPORTABLE API ENTRYPOINT
// ============================================================

export async function generateCoordScheduleWorkbook(json, outputPath = OUTPUT_FILE, csvPath = OUTPUT_CSV_FILE) {

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

    const detection = detectActiveColumns(items);
    const activeColumns = detection.activeColumns;

    createScheduleSheet(scheduleSheet, items, activeColumns);
    const processedRows = createDataSheet(dataSheet, items, workbook, activeColumns);

    await workbook.xlsx.writeFile(outputPath);

    let csvExported = false;
    let csvBuffer = null;

    if (processedRows && processedRows.length > 0) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const csvFilename = `output_data_${timestamp}.csv`;
            const tempCsvPath = path.join(TEMP_DIR, csvFilename);

            const csvResult = await exportToCsv(processedRows, tempCsvPath, activeColumns);
            if (csvResult) {
                csvExported = true;
                csvBuffer = getCsvBuffer(processedRows, activeColumns);
                fs.copyFileSync(tempCsvPath, csvPath);
            }
        } catch (error) {
            console.error("Error exporting CSV:", error.message);
        }
    }

    return {
        success: true,
        outputFile: outputPath,
        csvFile: csvExported ? csvPath : null,
        csvBuffer: csvBuffer,
        activeColumns: activeColumns.map(c => c.key),
        itemCount: items.length,
        xClusterCount: xCenters.length,
        yRowCount: yDescending.length,
        rowCount: processedRows ? processedRows.length : 0
    };
}


// ============================================================
// CLI ENTRYPOINT
// ============================================================

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error("\nCoord schedule exporter failed:");
        console.error(error);
        process.exit(1);
    });
}


// ============================================================
// EXCEL COLUMN NAME
// ============================================================

function getExcelColumnName(columnNumber) {
    let result = "";
    let number = columnNumber;

    while (number > 0) {
        const remainder = (number - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        number = Math.floor((number - 1) / 26);
    }

    return result;
}


// ============================================================
// ERROR HANDLING
// ============================================================

// Intentionally left blank here so the module can be imported
// safely from MCP and other server-side callers.