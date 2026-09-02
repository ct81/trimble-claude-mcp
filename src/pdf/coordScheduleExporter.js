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

const X_TOLERANCE = 4.0;
const Y_TOLERANCE = 2.5;


// ============================================================
// MAIN
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

    console.log("");
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

    const choice =
        await askQuestion(
            "Enter 1, 2 or 3: "
        );

    switch (choice.trim()) {

        case "1":
            return await readTextFile();

        case "2":
            return await readJsonFile();

        case "3":
            return await readDirectJson();

        default:

            console.error("");
            console.error(
                "Invalid selection."
            );

            return null;
    }
}


// ============================================================
// READ TXT FILE
// ============================================================

async function readTextFile() {

    const filePath =
        await askQuestion(
            "Enter TXT file path: "
        );

    const resolvedPath =
        resolveFilePath(filePath);

    if (
        !fs.existsSync(resolvedPath)
    ) {

        console.error("");
        console.error(
            "File not found:"
        );

        console.error(
            resolvedPath
        );

        return null;
    }

    console.log("");
    console.log(
        `Reading TXT: ${resolvedPath}`
    );

    const raw =
        fs.readFileSync(
            resolvedPath,
            "utf8"
        );

    return parseJsonText(raw);
}


// ============================================================
// READ JSON FILE
// ============================================================

async function readJsonFile() {

    const filePath =
        await askQuestion(
            "Enter JSON file path: "
        );

    const resolvedPath =
        resolveFilePath(filePath);

    if (
        !fs.existsSync(resolvedPath)
    ) {

        console.error("");
        console.error(
            "File not found:"
        );

        console.error(
            resolvedPath
        );

        return null;
    }

    console.log("");
    console.log(
        `Reading JSON: ${resolvedPath}`
    );

    const raw =
        fs.readFileSync(
            resolvedPath,
            "utf8"
        );

    return parseJsonText(raw);
}


// ============================================================
// READ DIRECT JSON
// ============================================================

async function readDirectJson() {

    console.log("");
    console.log("Paste your JSON below.");
    console.log("");

    console.log(
        "Press ENTER on an empty line when finished."
    );

    console.log("");

    const lines = [];

    const rl =
        readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

    return new Promise(
        resolve => {

            rl.on(
                "line",
                line => {

                    if (
                        line.trim() === ""
                    ) {

                        rl.close();

                        const raw =
                            lines.join("\n");

                        resolve(
                            parseJsonText(raw)
                        );

                        return;
                    }

                    lines.push(line);
                }
            );
        }
    );
}


// ============================================================
// PARSE JSON
// ============================================================

function parseJsonText(raw) {

    if (
        !raw ||
        !raw.trim()
    ) {

        console.error(
            "JSON input is empty."
        );

        return null;
    }

    try {

        return JSON.parse(raw);

    } catch (error) {

        console.error("");
        console.error(
            "=============================================="
        );

        console.error(
            "INVALID JSON"
        );

        console.error(
            "=============================================="
        );

        console.error(
            error.message
        );

        console.error("");

        return null;
    }
}


// ============================================================
// RESOLVE FILE PATH
// ============================================================

function resolveFilePath(filePath) {

    let cleanPath =
        filePath.trim();

    // Remove surrounding quotes.

    if (
        (
            cleanPath.startsWith('"') &&
            cleanPath.endsWith('"')
        )
        ||
        (
            cleanPath.startsWith("'") &&
            cleanPath.endsWith("'")
        )
    ) {

        cleanPath =
            cleanPath.substring(
                1,
                cleanPath.length - 1
            );
    }

    // Absolute path.

    if (
        path.isAbsolute(cleanPath)
    ) {

        return cleanPath;
    }

    // Relative path.

    return path.join(
        __dirname,
        cleanPath
    );
}


// ============================================================
// ASK QUESTION
// ============================================================

function askQuestion(question) {

    const rl =
        readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

    return new Promise(
        resolve => {

            rl.question(
                question,
                answer => {

                    rl.close();

                    resolve(answer);
                }
            );
        }
    );
}


// ============================================================
// EXTRACT ITEMS
// ============================================================

function extractItems(json) {

    const result = [];

    // --------------------------------------------------------
    // FORMAT:
    //
    // {
    //   "rows": [
    //     {
    //       "pageNumber": 1,
    //       "items": [...]
    //     }
    //   ]
    // }
    // --------------------------------------------------------

    if (
        json &&
        Array.isArray(json.rows)
    ) {

        for (
            const page of json.rows
        ) {

            const pageNumber =
                page.pageNumber ?? 1;

            if (
                !Array.isArray(page.items)
            ) {

                continue;
            }

            for (
                const item of page.items
            ) {

                addItem(
                    result,
                    item,
                    pageNumber
                );
            }
        }

        return result;
    }

    // --------------------------------------------------------
    // FORMAT:
    //
    // [
    //   {
    //     text: "...",
    //     x: 123,
    //     y: 456
    //   }
    // ]
    // --------------------------------------------------------

    if (
        Array.isArray(json)
    ) {

        for (
            const item of json
        ) {

            addItem(
                result,
                item,
                1
            );
        }

        return result;
    }

    return result;
}


// ============================================================
// ADD ITEM
// ============================================================

function addItem(
    result,
    item,
    pageNumber
) {

    if (!item) {
        return;
    }

    if (
        item.text === undefined ||
        item.x === undefined ||
        item.y === undefined ||
        item.width === undefined ||
        item.height === undefined
    ) {

        return;
    }

    const x =
        Number(item.x);

    const y =
        Number(item.y);

    const width =
        Number(item.width);

    const height =
        Number(item.height);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
    ) {

        return;
    }

    result.push({

        page:
            pageNumber,

        text:
            String(item.text),

        x:
            x,

        y:
            y,

        width:
            width,

        height:
            height
    });
}


// ============================================================
// CLUSTER COORDINATES
// ============================================================

function clusterCoordinates(
    values,
    tolerance
) {

    const sorted =
        [...values].sort(
            (a, b) => a - b
        );

    const centers = [];
    const groups = [];

    for (
        const value of sorted
    ) {

        if (
            centers.length === 0
        ) {

            centers.push(value);

            groups.push([
                value
            ]);

            continue;
        }

        const lastIndex =
            centers.length - 1;

        const distance =
            Math.abs(
                value -
                centers[lastIndex]
            );

        if (
            distance <= tolerance
        ) {

            groups[lastIndex].push(
                value
            );

            centers[lastIndex] =
                groups[lastIndex]
                    .reduce(
                        (sum, v) =>
                            sum + v,
                        0
                    )
                    /
                    groups[lastIndex].length;

        } else {

            centers.push(value);

            groups.push([
                value
            ]);
        }
    }

    return centers;
}


// ============================================================
// FIND NEAREST CENTER
// ============================================================

function nearestIndex(
    value,
    centers
) {

    let bestIndex = 0;

    let bestDistance =
        Number.POSITIVE_INFINITY;

    for (
        let i = 0;
        i < centers.length;
        i++
    ) {

        const distance =
            Math.abs(
                value -
                centers[i]
            );

        if (
            distance <
            bestDistance
        ) {

            bestDistance =
                distance;

            bestIndex =
                i;
        }
    }

    return bestIndex;
}


// ============================================================
// INFO SHEET
// ============================================================

function createInfoSheet(
    sheet,
    items,
    xCenters,
    yCenters
) {

    sheet.mergeCells("A1:B1");

    sheet.getCell("A1").value =
        "PDF JSON → Excel Coordinate Reconstruction";

    sheet.getCell("A1").font = {
        bold: true,
        size: 16
    };

    const pageSet =
        new Set(
            items.map(
                item => item.page
            )
        );

    const data = [
        ["Pages", pageSet.size],
        ["Coordinate Objects", items.length],
        ["X Coordinate Clusters", xCenters.length],
        ["Y Coordinate Rows", yCenters.length]
    ];

    data.forEach(
        (row, index) => {

            const rowNumber =
                index + 3;

            sheet.getCell(
                rowNumber,
                1
            ).value =
                row[0];

            sheet.getCell(
                rowNumber,
                2
            ).value =
                row[1];

            sheet.getCell(
                rowNumber,
                1
            ).font = {
                bold: true
            };
        }
    );

    sheet.getCell("A8").value =
        "Processing";

    sheet.getCell("B8").value =
        "X coordinates determine Excel columns. Y coordinates determine Excel rows.";

    sheet.getCell("A9").value =
        "Y Direction";

    sheet.getCell("B9").value =
        "PDF Y coordinates are reversed to produce top-to-bottom Excel rows.";

    sheet.getColumn(1).width =
        28;

    sheet.getColumn(2).width =
        100;

    for (
        let row = 3;
        row <= 9;
        row++
    ) {

        sheet.getCell(
            row,
            2
        ).alignment = {
            vertical: "top",
            wrapText: true
        };
    }
}


// ============================================================
// LAYOUT SHEET
// ============================================================

function createLayoutSheet(
    sheet,
    items,
    xCenters,
    yCenters
) {

    const cells =
        new Map();

    for (
        const item of items
    ) {

        const row =
            nearestIndex(
                item.y,
                yCenters
            ) + 1;

        const column =
            nearestIndex(
                item.x,
                xCenters
            ) + 1;

        const key =
            `${row}:${column}`;

        if (
            !cells.has(key)
        ) {

            cells.set(
                key,
                []
            );
        }

        cells.get(key).push(
            item
        );
    }

    for (
        const [key, objects]
        of cells
    ) {

        const [
            row,
            column
        ] =
            key
                .split(":")
                .map(Number);

        objects.sort(
            (a, b) =>
                a.x - b.x
        );

        const text =
            combineText(objects);

        const cell =
            sheet.getCell(
                row,
                column
            );

        cell.value =
            text;

        cell.alignment = {
            vertical: "center",
            horizontal: "left",
            wrapText: false
        };

        cell.border = {
            top: {
                style: "thin"
            },
            left: {
                style: "thin"
            },
            bottom: {
                style: "thin"
            },
            right: {
                style: "thin"
            }
        };
    }

    // --------------------------------------------------------
    // COLUMN WIDTHS
    // --------------------------------------------------------

    for (
        let i = 0;
        i < xCenters.length;
        i++
    ) {

        let spacing = 12;

        if (
            i < xCenters.length - 1
        ) {

            spacing =
                Math.abs(
                    xCenters[i + 1] -
                    xCenters[i]
                );
        }

        sheet.getColumn(
            i + 1
        ).width =
            Math.max(
                3,
                Math.min(
                    32,
                    spacing / 5
                )
            );
    }

    // --------------------------------------------------------
    // ROW HEIGHTS
    // --------------------------------------------------------

    for (
        let i = 0;
        i < yCenters.length;
        i++
    ) {

        let spacing = 12;

        if (
            i < yCenters.length - 1
        ) {

            spacing =
                Math.abs(
                    yCenters[i] -
                    yCenters[i + 1]
                );
        }

        sheet.getRow(
            i + 1
        ).height =
            Math.max(
                12,
                Math.min(
                    32,
                    spacing * 0.8
                )
            );
    }

    sheet.views = [
        {
            state: "frozen",
            ySplit: 1
        }
    ];
}


// ============================================================
// COMBINE TEXT
// ============================================================

function combineText(objects) {

    const values = [];

    for (
        const object of objects
    ) {

        const text =
            object.text.trim();

        if (!text) {
            continue;
        }

        // Prevent duplicate text

        if (
            !values.includes(text)
        ) {

            values.push(text);
        }
    }

    return values.join(" ");
}


// ============================================================
// RAW COORDINATES
// ============================================================

function createRawSheet(
    sheet,
    items,
    xCenters,
    yCenters
) {

    const headers = [
        "Page",
        "Text",
        "X",
        "Y",
        "Width",
        "Height",
        "Excel Row",
        "Excel Column"
    ];

    sheet.addRow(headers);

    sheet.getRow(1).font = {
        bold: true
    };

    sheet.getRow(1).alignment = {
        horizontal: "center",
        vertical: "center"
    };

    for (
        const item of items
    ) {

        const excelRow =
            nearestIndex(
                item.y,
                yCenters
            ) + 1;

        const excelColumn =
            nearestIndex(
                item.x,
                xCenters
            ) + 1;

        sheet.addRow([
            item.page,
            item.text,
            item.x,
            item.y,
            item.width,
            item.height,
            excelRow,
            excelColumn
        ]);
    }

    // --------------------------------------------------------
    // AUTOFILTER
    // --------------------------------------------------------

    if (sheet.rowCount > 1) {

        sheet.autoFilter = {
            from: "A1",
            to: `${getExcelColumnName(headers.length)}${sheet.rowCount}`
        };
    }

    // --------------------------------------------------------
    // FREEZE HEADER
    // --------------------------------------------------------

    sheet.views = [
        {
            state: "frozen",
            ySplit: 1
        }
    ];

    // --------------------------------------------------------
    // COLUMN WIDTHS
    // --------------------------------------------------------

    const widths = [
        10,
        50,
        16,
        16,
        16,
        16,
        14,
        16
    ];

    widths.forEach(
        (width, index) => {

            sheet.getColumn(
                index + 1
            ).width =
                width;
        }
    );

    // --------------------------------------------------------
    // NUMBER FORMAT
    // --------------------------------------------------------

    for (
        let row = 2;
        row <= sheet.rowCount;
        row++
    ) {

        for (
            let column = 3;
            column <= 6;
            column++
        ) {

            sheet.getCell(
                row,
                column
            ).numFmt =
                "0.000";
        }
    }
}


// ============================================================
// NORMALIZE HEADER TEXT
// ============================================================

function normalizeHeaderText(text) {

    let value =
        String(text || "")
            .trim()
            .toLowerCase();

    // Remove whitespace
    value =
        value.replace(/\s+/g, "");

    // Normalize slash
    value =
        value.replace(/\\/g, "/");

    // Remove punctuation except slash
    value =
        value.replace(/[,.:;'"`]/g, "");

    // --------------------------------------------------------
    // Fix duplicated words caused by PDF extraction
    //
    // Example:
    // SpliceSplice/Dowels
    //       ↓
    // Splice/Dowels
    // --------------------------------------------------------

    value =
        value.replace(
            /^splicesplice\//,
            "splice/"
        );

    value =
        value.replace(
            /^splicesplicedowels$/,
            "splicedowels"
        );

    // Arrangement Type
    value =
        value.replace(
            /^arrangementarrangementtype$/,
            "arrangementtype"
        );

    // Refer To 2D Detail variations
    value =
        value.replace(
            /^refertorefer2ddetail$/,
            "refer2ddetail"
        );

    return value;
}


// ============================================================
// HEADER ALIASES
// ============================================================

const headerAliases = {

    "DetailMark": [
        "DetailMark",
        "Detail Mark"
    ],

    "DetailStartStorey": [
        "DetailStartStorey",
        "Detail Start Storey",
        "DetailStartStorey"
    ],

    "DetailEndstorey": [
        "DetailEndstorey",
        "DetailEndStorey",
        "Detail End Storey"
    ],

    "MaterialGrade": [
        "MaterialGrade",
        "Material Grade"
    ],

    "Breadth": [
        "Breadth"
    ],

    "Length": [
        "Length"
    ],

    "Width": [
        "Width"
    ],

    "Thickness": [
        "Thickness"
    ],

    "ArrangementType": [
        "ArrangementType",
        "Arrangement Type"
    ],

    "Splice/Dowels": [
        "Splice/Dowels",
        "Splice / Dowels",
        "SpliceDowels",
        "Splice Dowels"
    ],

    "Remark": [
        "Remark"
    ],

    "ReferTo2DDetail": [
        "ReferTo2DDetail",
        "Refer To 2D Detail",
        "ReferTo2D Details",
        "Refer To 2D Details"
    ]
};


// ============================================================
// FIND HEADER MATCHES
// ============================================================

function findHeaderMatches(
    items,
    headerName
) {

    const aliases =
        headerAliases[headerName] ||
        [headerName];

    const normalizedAliases =
        aliases.map(
            alias =>
                normalizeHeaderText(alias)
        );

    return items.filter(
        item => {

            const text =
                normalizeHeaderText(
                    item.text
                );

            return normalizedAliases.includes(
                text
            );
        }
    );
}

// ============================================================
// COLUMN SCHEDULE
// ============================================================

function createScheduleSheet(
    sheet,
    items
) {

    // --------------------------------------------------------
    // ALL SCHEDULE HEADERS
    // --------------------------------------------------------

    const headerNames = [
        "DetailMark",
        "DetailStartStorey",
        "DetailEndstorey",
        "MaterialGrade",
        "Breadth",
        "Length",
        "Width",
        "Thickness",
        "ArrangementType",
        "Splice/Dowels",
        "Remark",
        "ReferTo2DDetail"
    ];

    const foundHeaders = [];

    // --------------------------------------------------------
    // FIND HEADERS
    // --------------------------------------------------------

    for (
        const headerName
        of headerNames
    ) {

        const matches =
            findHeaderMatches(
                items,
                headerName
            );

        if (
            matches.length > 0
        ) {

            // ------------------------------------------------
            // Select the upper-most occurrence.
            // In PDF coordinates, larger Y is higher.
            // ------------------------------------------------

            const selected =
                matches.reduce(
                    (best, current) =>
                        current.y > best.y
                            ? current
                            : best
                );

            foundHeaders.push({

                name:
                    headerName,

                x:
                    selected.x,

                y:
                    selected.y,

                width:
                    selected.width,

                height:
                    selected.height,

                text:
                    selected.text
            });
        }
    }

    // --------------------------------------------------------
    // DEBUG HEADER INFORMATION
    // --------------------------------------------------------

    console.log("");
    console.log(
        "Detected schedule headers:"
    );

    if (
        foundHeaders.length === 0
    ) {

        console.log(
            "  NONE"
        );

    } else {

        foundHeaders.forEach(
            header => {

                console.log(
                    `  ${header.name} -> X=${header.x}, Y=${header.y}, text="${header.text}"`
                );
            }
        );
    }

    console.log("");

    // --------------------------------------------------------
    // NO HEADERS
    // --------------------------------------------------------

    if (
        foundHeaders.length === 0
    ) {

        sheet.getCell(
            "A1"
        ).value =
            "No schedule headers detected.";

        return;
    }

    // --------------------------------------------------------
    // SORT HEADERS LEFT TO RIGHT
    // --------------------------------------------------------

    foundHeaders.sort(
        (a, b) =>
            a.x - b.x
    );

    // --------------------------------------------------------
    // WRITE HEADERS
    // --------------------------------------------------------

    foundHeaders.forEach(
        (header, index) => {

            const cell =
                sheet.getCell(
                    1,
                    index + 1
                );

            cell.value =
                header.name;

            cell.font = {
                bold: true
            };

            cell.alignment = {
                horizontal: "center",
                vertical: "center",
                wrapText: true
            };

            cell.border = {
                top: {
                    style: "thin"
                },
                left: {
                    style: "thin"
                },
                bottom: {
                    style: "thin"
                },
                right: {
                    style: "thin"
                }
            };
        }
    );

    sheet.getRow(1).height =
        30;

    // --------------------------------------------------------
    // HEADER Y
    // --------------------------------------------------------

    const headerY =
        Math.max(
            ...foundHeaders.map(
                h => h.y
            )
        );

    // --------------------------------------------------------
    // FILTER SCHEDULE ITEMS
    // --------------------------------------------------------

    const scheduleItems =
        items.filter(
            item => {

                // Items below the header
                // in PDF coordinate direction.

                if (
                    item.y >
                    headerY + 2
                ) {

                    return false;
                }

                // Limit to schedule area.

                if (
                    item.x < 60 ||
                    item.x > 800
                ) {

                    return false;
                }

                return true;
            }
        );

console.log("");
console.log("Schedule items:");
console.log("----------------------------------------------");

scheduleItems.forEach(item => {

    const column =
        findScheduleColumn(
            item.x,
            foundHeaders
        );

    const header =
        foundHeaders[column - 1];

    console.log(
        `X=${item.x.toFixed(2)} ` +
        `Y=${item.y.toFixed(2)} ` +
        `COL=${column} ` +
        `HEADER=${header ? header.name : "NONE"} ` +
        `TEXT="${item.text}"`
    );
});

console.log("----------------------------------------------");

    // --------------------------------------------------------
    // SCHEDULE Y ROWS
    // --------------------------------------------------------

    const yValues =
        scheduleItems.map(
            item => item.y
        );

    if (
        yValues.length === 0
    ) {

        console.log(
            "No schedule data rows detected."
        );

        return;
    }

    const scheduleRows =
        clusterCoordinates(
            yValues,
            Y_TOLERANCE
        )
        .sort(
            (a, b) => b - a
        );

    // --------------------------------------------------------
    // CREATE SCHEDULE CELLS
    // --------------------------------------------------------

    const scheduleCells =
        new Map();

    for (
        const item of scheduleItems
    ) {

        const row =
            nearestIndex(
                item.y,
                scheduleRows
            ) + 2;

        const column =
            findScheduleColumn(
                item.x,
                foundHeaders
            );

        if (
            column < 1
        ) {

            continue;
        }

        const key =
            `${row}:${column}`;

        if (
            !scheduleCells.has(key)
        ) {

            scheduleCells.set(
                key,
                []
            );
        }

        scheduleCells
            .get(key)
            .push(item);
    }

    // --------------------------------------------------------
    // WRITE SCHEDULE CELLS
    // --------------------------------------------------------

    for (
        const [key, objects]
        of scheduleCells
    ) {

        const [
            row,
            column
        ] =
            key
                .split(":")
                .map(Number);

        objects.sort(
            (a, b) =>
                a.x - b.x
        );

        const text =
            combineText(objects);

        const cell =
            sheet.getCell(
                row,
                column
            );

        cell.value =
            text;

        cell.alignment = {
            vertical: "center",
            horizontal: "center",
            wrapText: true
        };

        cell.border = {
            top: {
                style: "thin"
            },
            left: {
                style: "thin"
            },
            bottom: {
                style: "thin"
            },
            right: {
                style: "thin"
            }
        };
    }

    // --------------------------------------------------------
    // COLUMN WIDTHS
    // --------------------------------------------------------

    const widths = [
        25, // DetailMark
        22, // DetailStartStorey
        22, // DetailEndstorey
        18, // MaterialGrade
        14, // Breadth
        14, // Length
        14, // Width
        14, // Thickness
        24, // ArrangementType
        24, // Splice/Dowels
        30, // Remark
        24  // ReferTo2DDetail
    ];

    for (
        let i = 0;
        i < foundHeaders.length;
        i++
    ) {

        sheet.getColumn(
            i + 1
        ).width =
            widths[i] || 15;
    }

    // --------------------------------------------------------
    // FREEZE HEADER
    // --------------------------------------------------------

    sheet.views = [
        {
            state: "frozen",
            ySplit: 1
        }
    ];

    // --------------------------------------------------------
    // AUTOFILTER
    // --------------------------------------------------------

    if (
        sheet.rowCount > 1
    ) {

        sheet.autoFilter = {
            from: "A1",
            to:
                `${getExcelColumnName(foundHeaders.length)}${sheet.rowCount}`
        };
    }
}


// ============================================================
// FIND SCHEDULE COLUMN
// ============================================================

function findScheduleColumn(
    x,
    headers
) {

    if (
        !headers ||
        headers.length === 0
    ) {
        return -1;
    }

    // --------------------------------------------------------
    // Headers are already sorted left -> right.
    // Determine the boundary between each pair of columns.
    // --------------------------------------------------------

    for (
        let i = 0;
        i < headers.length - 1;
        i++
    ) {

        const current =
            headers[i];

        const next =
            headers[i + 1];

        const currentCenter =
            current.x +
            (
                Number(current.width || 0) /
                2
            );

        const nextCenter =
            next.x +
            (
                Number(next.width || 0) /
                2
            );

        const boundary =
            (
                currentCenter +
                nextCenter
            ) / 2;

        if (
            x < boundary
        ) {

            return i + 1;
        }
    }

    // Everything to the right of the
    // last boundary belongs to last column.

    return headers.length;
}

// ============================================================
// EXPORTABLE API ENTRYPOINT
// ============================================================

export async function generateCoordScheduleWorkbook(json, outputPath = OUTPUT_FILE) {

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

    createInfoSheet(infoSheet, items, xCenters, yDescending);
    createLayoutSheet(layoutSheet, items, xCenters, yDescending);
    createRawSheet(rawSheet, items, xCenters, yDescending);
    createScheduleSheet(scheduleSheet, items);

    await workbook.xlsx.writeFile(outputPath);

    return {
        success: true,
        outputFile: outputPath,
        itemCount: items.length,
        xClusterCount: xCenters.length,
        yRowCount: yDescending.length
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

function getExcelColumnName(
    columnNumber
) {

    let result = "";

    let number =
        columnNumber;

    while (
        number > 0
    ) {

        const remainder =
            (number - 1) % 26;

        result =
            String.fromCharCode(
                65 + remainder
            ) +
            result;

        number =
            Math.floor(
                (number - 1) / 26
            );
    }

    return result;
}


// ============================================================
// ERROR HANDLING
// ============================================================

main()
    .catch(
        error => {

            console.error("");
            console.error(
                "=============================================="
            );

            console.error(
                "ERROR"
            );

            console.error(
                "=============================================="
            );

            console.error(
                error
            );

            process.exit(1);
        }
    );