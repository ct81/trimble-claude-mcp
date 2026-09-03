// "column_schedule": [
//   {
//     "detail_mark": "",
//     "rows": [
//       {"start_storey": "", "end_storey": "", "material_grade": "", "width_mm": null, "breadth_mm": null, "main_rebar": "", "stirrups": "", "construction_method": "", "arrangement_type": null, "splice_dowels": null}
//     ]
//   }
// ]

//Read the extracted json data by columns from PDF


// ============================================================
// COLUMN SCHEDULE EXPORTER
// ============================================================
//
// Pure logic functions (works in Node.js and browser)
// + Browser UI layer (only runs when document is available)
//
// Export these functions for MCP:
// - normalizeKey
// - normalizeObject
// - getValue
// - getArrayByKey
// - getColumnSchedule
// - getRows
// - getDetailMark
// - createRecord
// - recordHasData
// - processColumnSchedule
// - EXPECTED_COLUMNS
//
// ============================================================

// ============================================================
// COLUMN SCHEDULE EXPORTER - MCP CORE
// ============================================================
//
// Pure Node.js logic.
// No DOM.
// No browser APIs.
// No XLSX.
//
// ============================================================


// ============================================================
// FIXED OUTPUT STRUCTURE
// ============================================================

export const EXPECTED_COLUMNS = [
    'DetailMark',
    'StartStorey',
    'EndStorey',
    'MaterialGrade',
    'Width',
    'Breadth',
    'MainRebar',
    'Stirrups',
    'ConstructionMethod',
    'ArrangementType',
    'Splice/Dowels'
];


// ============================================================
// NORMALIZE KEY
// ============================================================

export function normalizeKey(key) {

    if (key === null || key === undefined) {
        return '';
    }

    return String(key)
        .trim()
        .toLowerCase()
        .replace(/[\s_\-\/\\().,:;]+/g, '');
}


// ============================================================
// NORMALIZE OBJECT
// ============================================================

export function normalizeObject(obj) {

    if (
        !obj ||
        typeof obj !== 'object' ||
        Array.isArray(obj)
    ) {
        return {};
    }

    const result = {};

    Object.keys(obj).forEach(key => {

        const normalized = normalizeKey(key);

        if (normalized) {
            result[normalized] = obj[key];
        }

    });

    return result;
}


// ============================================================
// GET VALUE
// ============================================================

export function getValue(
    obj,
    possibleKeys,
    defaultValue = ''
) {

    if (
        !obj ||
        typeof obj !== 'object'
    ) {
        return defaultValue;
    }

    const normalizedObj =
        normalizeObject(obj);

    for (const key of possibleKeys) {

        const normalizedKey =
            normalizeKey(key);

        if (
            Object.prototype.hasOwnProperty.call(
                normalizedObj,
                normalizedKey
            )
        ) {

            const value =
                normalizedObj[normalizedKey];

            if (
                value !== null &&
                value !== undefined
            ) {
                return value;
            }
        }
    }

    return defaultValue;
}


// ============================================================
// GET ARRAY BY KEY
// ============================================================

export function getArrayByKey(
    obj,
    possibleKeys
) {

    if (
        !obj ||
        typeof obj !== 'object'
    ) {
        return null;
    }

    const normalizedObj =
        normalizeObject(obj);

    for (const key of possibleKeys) {

        const normalizedKey =
            normalizeKey(key);

        const value =
            normalizedObj[normalizedKey];

        if (Array.isArray(value)) {
            return value;
        }
    }

    return null;
}


// ============================================================
// GET COLUMN SCHEDULE
// ============================================================

export function getColumnSchedule(data) {

    return getArrayByKey(data, [
        'column_schedule',
        'column schedule',
        'ColumnSchedule',
        'COLUMN_SCHEDULE',
        'column-schedule',
        'column/schedule'
    ]);
}


// ============================================================
// GET ROWS
// ============================================================

export function getRows(item) {

    const rows =
        getArrayByKey(item, [
            'rows',
            'row',
            'row_data',
            'row data',
            'schedule_rows',
            'schedule rows',
            'scheduleRows',
            'data'
        ]);

    return rows || [];
}


// ============================================================
// GET DETAIL MARK
// ============================================================

export function getDetailMark(item) {

    return getValue(item, [
        'detail_mark',
        'detail mark',
        'detailmark',
        'detail-mark',
        'detail/mark',
        'detail'
    ]);
}


// ============================================================
// CREATE RECORD
// ============================================================

export function createRecord(
    detailMark,
    row
) {

    return {

        DetailMark: detailMark,

        StartStorey: getValue(row, [
            'start_storey',
            'start storey',
            'startstorey',
            'start-storey',
            'start level',
            'start_level',
            'startlevel'
        ]),

        EndStorey: getValue(row, [
            'end_storey',
            'end storey',
            'endstorey',
            'end-storey',
            'end level',
            'end_level',
            'endlevel'
        ]),

        MaterialGrade: getValue(row, [
            'material_grade',
            'material grade',
            'materialgrade',
            'material-grade',
            'concrete grade',
            'concrete_grade',
            'concretegrade',
            'grade'
        ]),

        Width: getValue(row, [
            'width_mm',
            'width mm',
            'widthmm',
            'width',
            'column width',
            'column_width',
            'columnwidth'
        ]),

        Breadth: getValue(row, [
            'breadth_mm',
            'breadth mm',
            'breadthmm',
            'breadth',
            'depth_mm',
            'depth mm',
            'depth'
        ]),

        MainRebar: getValue(row, [
            'main_rebar',
            'main rebar',
            'mainrebar',
            'main-rebar',
            'main reinforcement',
            'main_reinforcement',
            'mainreinforcement',
            'main bars',
            'mainbars'
        ]),

        Stirrups: getValue(row, [
            'stirrups',
            'stirrup',
            'stirrup bars',
            'stirrup_bar',
            'stirrupbars',
            'links',
            'ties'
        ]),

        ConstructionMethod: getValue(row, [
            'construction_method',
            'construction method',
            'constructionmethod',
            'construction-method',
            'method',
            'construction'
        ]),

        ArrangementType: getValue(row, [
            'arrangement_type',
            'arrangement type',
            'arrangementtype',
            'arrangement-type',
            'arrangement'
        ]),

        'Splice/Dowels': getValue(row, [
            'splice_dowels',
            'splice dowels',
            'splicedowels',
            'splice-dowels',
            'splice/dowels',
            'splice / dowels',
            'splice',
            'dowels',
            'splice and dowels',
            'splice_and_dowels',
            'spliceanddowels'
        ])
    };
}


// ============================================================
// CHECK RECORD HAS DATA
// ============================================================

export function recordHasData(record) {

    if (
        !record ||
        typeof record !== 'object'
    ) {
        return false;
    }

    return Object.values(record).some(value => {

        if (
            value === null ||
            value === undefined
        ) {
            return false;
        }

        return String(value).trim().length > 0;
    });
}


// ============================================================
// PROCESS ONE SCHEDULE ITEM
// ============================================================

function processScheduleItem(
    item,
    records
) {

    if (
        !item ||
        typeof item !== 'object'
    ) {
        return;
    }

    const detailMark =
        getDetailMark(item);

    const rows =
        getRows(item);

    rows.forEach(row => {

        const record =
            createRecord(
                detailMark,
                row
            );

        if (recordHasData(record)) {
            records.push(record);
        }

    });
}


// ============================================================
// PROCESS COLUMN SCHEDULE
// ============================================================

export function processColumnSchedule(data) {

    const records = [];


    // --------------------------------------------------------
    // CASE 1:
    // Root has column_schedule
    // --------------------------------------------------------

    const columnSchedule =
        getColumnSchedule(data);

    if (columnSchedule) {

        columnSchedule.forEach(item => {

            processScheduleItem(
                item,
                records
            );

        });

        return records;
    }


    // --------------------------------------------------------
    // CASE 2:
    // Direct array
    // --------------------------------------------------------

    if (Array.isArray(data)) {

        data.forEach(item => {

            const nestedSchedule =
                getColumnSchedule(item);

            if (nestedSchedule) {

                nestedSchedule.forEach(
                    scheduleItem => {

                        processScheduleItem(
                            scheduleItem,
                            records
                        );

                    }
                );

            }
            else {

                const record =
                    createRecord(
                        getDetailMark(item),
                        item
                    );

                if (recordHasData(record)) {
                    records.push(record);
                }
            }

        });

        return records;
    }


    // --------------------------------------------------------
    // CASE 3:
    // Recursively find column_schedule
    // --------------------------------------------------------

    function recursiveSearch(obj) {

        if (
            !obj ||
            typeof obj !== 'object'
        ) {
            return;
        }


        if (Array.isArray(obj)) {

            obj.forEach(item => {

                recursiveSearch(item);

            });

            return;
        }


        for (const key of Object.keys(obj)) {

            const value =
                obj[key];

            const normalized =
                normalizeKey(key);


            if (
                normalized === 'columnschedule' &&
                Array.isArray(value)
            ) {

                value.forEach(item => {

                    processScheduleItem(
                        item,
                        records
                    );

                });

                continue;
            }


            if (
                value &&
                typeof value === 'object'
            ) {

                recursiveSearch(value);

            }
        }
    }


    recursiveSearch(data);

    return records;
}