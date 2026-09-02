(function () {

    'use strict';

    /* ============================================================
       ELEMENTS
       ============================================================ */

    const fileInput =
        document.getElementById('fileInput');

    const uploadArea =
        document.getElementById('uploadArea');

    const fileStatus =
        document.getElementById('fileStatus');

    const tableBody =
        document.getElementById('tableBody');

    const rowCountBadge =
        document.getElementById('rowCountBadge');

    const columnCountBadge =
        document.getElementById('columnCountBadge');

    const detailCountBadge =
        document.getElementById('detailCountBadge');

    const tableCount =
        document.getElementById('tableCount');

    const exportBtn =
        document.getElementById('exportBtn');

    const clearBtn =
        document.getElementById('clearBtn');

    const clearConsoleBtn =
        document.getElementById('clearConsoleBtn');

    const consoleOutput =
        document.getElementById('consoleOutput');

    const textInput =
        document.getElementById('textInput');

    const parseBtn =
        document.getElementById('parseBtn');


    /* ============================================================
       CHECK REQUIRED ELEMENTS
       ============================================================ */

    const requiredElements = {
        fileInput,
        uploadArea,
        fileStatus,
        tableBody,
        rowCountBadge,
        columnCountBadge,
        detailCountBadge,
        tableCount,
        exportBtn,
        clearBtn,
        clearConsoleBtn,
        consoleOutput,
        textInput,
        parseBtn
    };

    const missingElements =
        Object.entries(requiredElements)
            .filter(([name, element]) => !element)
            .map(([name]) => name);

    if (missingElements.length > 0) {

        console.error(
            'Column Schedule Exporter: Missing HTML elements:',
            missingElements
        );

        return;
    }


    /* ============================================================
       APPLICATION DATA
       ============================================================ */

    let allRecords = [];


    /* ============================================================
       FIXED OUTPUT STRUCTURE
       ============================================================ */

    const EXPECTED_COLUMNS = [

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


    /* ============================================================
       NORMALIZE KEY
       
       Examples:

       detail_mark
       DetailMark
       Detail Mark
       DETAIL MARK
       detail-mark
       detail/mark

       all become:

       detailmark
       ============================================================ */

    function normalizeKey(key) {

        if (
            key === null ||
            key === undefined
        ) {
            return '';
        }

        return String(key)
            .trim()
            .toLowerCase()
            .replace(
                /[\s_\-\/\\().,:;]+/g,
                ''
            );
    }


    /* ============================================================
       NORMALIZE OBJECT
       ============================================================ */

    function normalizeObject(obj) {

        if (
            !obj ||
            typeof obj !== 'object' ||
            Array.isArray(obj)
        ) {
            return {};
        }

        const result = {};

        Object.keys(obj).forEach(key => {

            const normalized =
                normalizeKey(key);

            if (normalized) {

                result[normalized] =
                    obj[key];

            }

        });

        return result;
    }


    /* ============================================================
       GET VALUE
       ============================================================ */

    function getValue(
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

        for (
            const key of possibleKeys
        ) {

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


    /* ============================================================
       GET ARRAY BY KEY
       ============================================================ */

    function getArrayByKey(
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

        for (
            const key of possibleKeys
        ) {

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


    /* ============================================================
       GET COLUMN SCHEDULE
       ============================================================ */

    function getColumnSchedule(data) {

        return getArrayByKey(

            data,

            [

                'column_schedule',

                'column schedule',

                'ColumnSchedule',

                'COLUMN_SCHEDULE',

                'column-schedule',

                'column/schedule'

            ]

        );

    }


    /* ============================================================
       GET ROWS
       ============================================================ */

    function getRows(item) {

        const rows =

            getArrayByKey(

                item,

                [

                    'rows',

                    'row',

                    'row_data',

                    'row data',

                    'schedule_rows',

                    'schedule rows',

                    'scheduleRows',

                    'data'

                ]

            );

        return rows || [];
    }


    /* ============================================================
       GET DETAIL MARK
       ============================================================ */

    function getDetailMark(item) {

        return getValue(

            item,

            [

                'detail_mark',

                'detail mark',

                'detailmark',

                'detail-mark',

                'detail/mark',

                'detail'

            ]

        );

    }


    /* ============================================================
       ESCAPE HTML
       ============================================================ */

    function escapeHtml(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return '';
        }

        return String(value)

            .replace(
                /&/g,
                '&amp;'
            )

            .replace(
                /</g,
                '&lt;'
            )

            .replace(
                />/g,
                '&gt;'
            )

            .replace(
                /"/g,
                '&quot;'
            )

            .replace(
                /'/g,
                '&#039;'
            );
    }


    /* ============================================================
       CONSOLE LOG
       ============================================================ */

    function consoleLog(
        message,
        type = 'info',
        data = null
    ) {

        const timestamp =
            new Date()
                .toLocaleTimeString();

        const entry =
            document.createElement('div');

        entry.className =
            `log-entry ${type}`;

        let content =

            `<span class="timestamp">` +
            `[${timestamp}]` +
            `</span> ` +
            `${escapeHtml(message)}`;

        if (
            data !== null &&
            data !== undefined
        ) {

            if (
                typeof data === 'object'
            ) {

                content +=

                    `\n${escapeHtml(
                        JSON.stringify(
                            data,
                            null,
                            2
                        )
                    )}`;

            }
            else {

                content +=
                    ` ${escapeHtml(data)}`;

            }

        }

        entry.innerHTML =
            content;

        consoleOutput.appendChild(
            entry
        );

        consoleOutput.scrollTop =
            consoleOutput.scrollHeight;
    }


    /* ============================================================
       CREATE FIXED RECORD

       Input JSON can have different property names.

       Output ALWAYS becomes:

       DetailMark
       StartStorey
       EndStorey
       MaterialGrade
       Width
       Breadth
       MainRebar
       Stirrups
       ConstructionMethod
       ArrangementType
       Splice/Dowels
       ============================================================ */

    function createRecord(
        detailMark,
        row
    ) {

        return {

            DetailMark:
                detailMark,

            StartStorey:
                getValue(

                    row,

                    [

                        'start_storey',

                        'start storey',

                        'startstorey',

                        'start-storey',

                        'start level',

                        'start_level',

                        'startlevel'

                    ]

                ),

            EndStorey:
                getValue(

                    row,

                    [

                        'end_storey',

                        'end storey',

                        'endstorey',

                        'end-storey',

                        'end level',

                        'end_level',

                        'endlevel'

                    ]

                ),

            MaterialGrade:
                getValue(

                    row,

                    [

                        'material_grade',

                        'material grade',

                        'materialgrade',

                        'material-grade',

                        'concrete grade',

                        'concrete_grade',

                        'concretegrade',

                        'grade'

                    ]

                ),

            Width:
                getValue(

                    row,

                    [

                        'width_mm',

                        'width mm',

                        'widthmm',

                        'width',

                        'column width',

                        'column_width',

                        'columnwidth'

                    ]

                ),

            Breadth:
                getValue(

                    row,

                    [

                        'breadth_mm',

                        'breadth mm',

                        'breadthmm',

                        'breadth',

                        'depth_mm',

                        'depth mm',

                        'depth'

                    ]

                ),

            MainRebar:
                getValue(

                    row,

                    [

                        'main_rebar',

                        'main rebar',

                        'mainrebar',

                        'main-rebar',

                        'main reinforcement',

                        'main_reinforcement',

                        'mainreinforcement',

                        'main bars',

                        'mainbars'

                    ]

                ),

            Stirrups:
                getValue(

                    row,

                    [

                        'stirrups',

                        'stirrup',

                        'stirrup bars',

                        'stirrup_bar',

                        'stirrupbars',

                        'links',

                        'ties'

                    ]

                ),

            ConstructionMethod:
                getValue(

                    row,

                    [

                        'construction_method',

                        'construction method',

                        'constructionmethod',

                        'construction-method',

                        'method',

                        'construction'

                    ]

                ),

            ArrangementType:
                getValue(

                    row,

                    [

                        'arrangement_type',

                        'arrangement type',

                        'arrangementtype',

                        'arrangement-type',

                        'arrangement'

                    ]

                ),

            'Splice/Dowels':
                getValue(

                    row,

                    [

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

                    ]

                )

        };
    }


    /* ============================================================
       CHECK RECORD HAS DATA
       ============================================================ */

    function recordHasData(record) {

        return Object.values(record)
            .some(value => {

                if (
                    value === null ||
                    value === undefined
                ) {
                    return false;
                }

                return String(value)
                    .trim()
                    .length > 0;

            });
    }


    /* ============================================================
       PROCESS COLUMN SCHEDULE
       ============================================================ */

    function processColumnSchedule(data) {

        consoleLog(
            '🔍 Processing column_schedule...',
            'info'
        );

        let records = [];


        /* ========================================================
           CASE 1
           
           Root:

           {
               "column_schedule": [...]
           }
           ======================================================== */

        const columnSchedule =
            getColumnSchedule(data);

        if (columnSchedule) {

            consoleLog(

                `📊 Found column_schedule with ` +
                `${columnSchedule.length} detail marks`,

                'success'

            );

            columnSchedule.forEach(
                (item, itemIndex) => {

                    const detailMark =
                        getDetailMark(item);

                    const rows =
                        getRows(item);

                    consoleLog(

                        `📌 Detail mark #${itemIndex + 1}: ` +
                        `${detailMark || '(blank)'} ` +
                        `| ${rows.length} rows`,

                        'data'

                    );

                    rows.forEach(row => {

                        const record =
                            createRecord(
                                detailMark,
                                row
                            );

                        if (
                            recordHasData(record)
                        ) {

                            records.push(
                                record
                            );

                        }

                    });

                }
            );

            consoleLog(

                `✅ Extracted ${records.length} rows`,

                'success'

            );

            return records;
        }


        /* ========================================================
           CASE 2
           
           Direct array
           ======================================================== */

        if (Array.isArray(data)) {

            consoleLog(

                '📊 JSON is a direct array. ' +
                'Processing records...',

                'data'

            );

            data.forEach(item => {

                const record =
                    createRecord(

                        getDetailMark(item),

                        item

                    );

                if (
                    recordHasData(record)
                ) {

                    records.push(
                        record
                    );

                }

            });

            consoleLog(

                `✅ Extracted ${records.length} rows`,

                'success'

            );

            return records;
        }


        /* ========================================================
           CASE 3

           Recursively search for column_schedule
           ======================================================== */

        consoleLog(

            '🔎 column_schedule not found at root. ' +
            'Searching nested objects...',

            'warning'

        );

        function recursiveSearch(
            obj,
            path = 'root'
        ) {

            if (
                !obj ||
                typeof obj !== 'object'
            ) {
                return;
            }

            if (Array.isArray(obj)) {
                return;
            }

            for (
                const key of Object.keys(obj)
            ) {

                const value =
                    obj[key];

                const normalized =
                    normalizeKey(key);

                if (
                    normalized ===
                    'columnschedule' &&
                    Array.isArray(value)
                ) {

                    consoleLog(

                        `📊 Found column_schedule at ` +
                        `"${path}.${key}"`,

                        'success'

                    );

                    value.forEach(item => {

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

                            if (
                                recordHasData(record)
                            ) {

                                records.push(
                                    record
                                );

                            }

                        });

                    });

                    return;
                }

                if (
                    value &&
                    typeof value === 'object'
                ) {

                    recursiveSearch(

                        value,

                        `${path}.${key}`

                    );

                }

            }

        }

        recursiveSearch(data);

        consoleLog(

            `✅ Total ${records.length} records extracted`,

            records.length > 0
                ? 'success'
                : 'warning'

        );

        return records;
    }


    /* ============================================================
       RENDER TABLE
       ============================================================ */

    function renderTable(records) {

        if (
            !records ||
            records.length === 0
        ) {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="12"
                        class="empty-state"
                    >
                        📤 Upload or paste JSON data
                        to extract column schedule
                    </td>

                </tr>

            `;

            rowCountBadge.textContent =
                '0';

            columnCountBadge.textContent =
                '0';

            detailCountBadge.textContent =
                '0';

            tableCount.textContent =
                '0 rows';

            exportBtn.disabled =
                true;

            return;
        }


        const rows =
            records.map(
                (r, index) => {

                    return `

                        <tr>

                            <td class="row-num">
                                ${index + 1}
                            </td>

                            <td>
                                <strong
                                    style="color:#58a6ff;"
                                >
                                    ${escapeHtml(
                                        r.DetailMark
                                    )}
                                </strong>
                            </td>

                            <td>
                                ${escapeHtml(
                                    r.StartStorey
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    r.EndStorey
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    r.MaterialGrade
                                )}
                            </td>

                            <td
                                style="color:#f0883e;"
                            >
                                ${escapeHtml(
                                    r.Width
                                )}
                            </td>

                            <td
                                style="color:#f0883e;"
                            >
                                ${escapeHtml(
                                    r.Breadth
                                )}
                            </td>

                            <td
                                style="color:#f0883e;"
                            >
                                ${escapeHtml(
                                    r.MainRebar
                                )}
                            </td>

                            <td
                                style="color:#79c0ff;"
                            >
                                ${escapeHtml(
                                    r.Stirrups
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    r.ConstructionMethod
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    r.ArrangementType
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    r['Splice/Dowels']
                                )}
                            </td>

                        </tr>

                    `;

                }
            ).join('');

        tableBody.innerHTML =
            rows;

        rowCountBadge.textContent =
            records.length;

        tableCount.textContent =
            `${records.length} rows`;

        const detailMarks =

            [
                ...new Set(

                    records
                        .map(
                            r => r.DetailMark
                        )
                        .filter(Boolean)

                )
            ];

        detailCountBadge.textContent =
            detailMarks.length;

        columnCountBadge.textContent =
            EXPECTED_COLUMNS.length;

        exportBtn.disabled =
            false;
    }


    /* ============================================================
       EXPORT EXCEL
       ============================================================ */

    function exportToExcel() {

        if (
            !allRecords ||
            allRecords.length === 0
        ) {

            consoleLog(
                '⚠️ No data to export',
                'warning'
            );

            return;
        }


        if (
            typeof XLSX === 'undefined'
        ) {

            consoleLog(

                '❌ SheetJS XLSX library is not loaded.',

                'error'

            );

            return;
        }


        consoleLog(

            `📥 Exporting ${allRecords.length} records to Excel...`,

            'info'

        );


        /* --------------------------------------------------------
           FIXED EXCEL HEADERS
           -------------------------------------------------------- */

        const headers = [

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


        /* --------------------------------------------------------
           BUILD DATA
           -------------------------------------------------------- */

        const excelRows = [

            headers

        ];


        allRecords.forEach(r => {

            excelRows.push([

                r.DetailMark ?? '',

                r.StartStorey ?? '',

                r.EndStorey ?? '',

                r.MaterialGrade ?? '',

                r.Width ?? '',

                r.Breadth ?? '',

                r.MainRebar ?? '',

                r.Stirrups ?? '',

                r.ConstructionMethod ?? '',

                r.ArrangementType ?? '',

                r['Splice/Dowels'] ?? ''

            ]);

        });


        /* --------------------------------------------------------
           CREATE WORKBOOK
           -------------------------------------------------------- */

        const wb =
            XLSX.utils.book_new();


        const ws =
            XLSX.utils.aoa_to_sheet(
                excelRows
            );


        /* --------------------------------------------------------
           COLUMN WIDTHS
           -------------------------------------------------------- */

        ws['!cols'] = [

            { wch: 24 },

            { wch: 20 },

            { wch: 20 },

            { wch: 18 },

            { wch: 10 },

            { wch: 10 },

            { wch: 18 },

            { wch: 28 },

            { wch: 24 },

            { wch: 20 },

            { wch: 22 }

        ];


        /* --------------------------------------------------------
           FREEZE HEADER
           -------------------------------------------------------- */

        ws['!freeze'] = {

            xSplit: 0,

            ySplit: 1

        };


        /* --------------------------------------------------------
           AUTOFILTER
           -------------------------------------------------------- */

        ws['!autofilter'] = {

            ref:
                `A1:K${excelRows.length}`

        };


        /* --------------------------------------------------------
           ADD WORKSHEET
           -------------------------------------------------------- */

        XLSX.utils.book_append_sheet(

            wb,

            ws,

            'ColumnSchedule'

        );


        /* --------------------------------------------------------
           CREATE XLSX
           -------------------------------------------------------- */

        const wbout =

            XLSX.write(

                wb,

                {

                    bookType: 'xlsx',

                    type: 'array'

                }

            );


        const blob =

            new Blob(

                [wbout],

                {

                    type:
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

                }

            );


        const url =
            URL.createObjectURL(blob);


        const link =
            document.createElement('a');


        link.href =
            url;


        link.download =

            `Column_Schedule_${new Date()

                .toISOString()

                .slice(
                    0,
                    10
                )

            }.xlsx`;


        document.body.appendChild(
            link
        );


        link.click();


        document.body.removeChild(
            link
        );


        setTimeout(
            () => {

                URL.revokeObjectURL(
                    url
                );

            },
            1000
        );


        consoleLog(

            `✅ Excel exported successfully with ` +
            `${allRecords.length} rows`,

            'success'

        );


        fileStatus.textContent =

            `✅ Exported ` +
            `${allRecords.length} records to Excel`;
    }


    /* ============================================================
       PROCESS TEXT INPUT
       ============================================================ */

    function processTextInput() {

        const text =
            textInput.value.trim();


        if (!text) {

            consoleLog(

                '⚠️ Please paste some JSON data first',

                'warning'

            );

            return;
        }


        try {

            const data =
                JSON.parse(text);


            consoleLog(

                '✅ JSON parsed successfully',

                'success'

            );


            const records =
                processColumnSchedule(data);


            if (
                records.length > 0
            ) {

                allRecords =
                    records;


                renderTable(
                    allRecords
                );


                fileStatus.textContent =

                    `✅ ${records.length} ` +
                    `records extracted`;


                consoleLog(

                    `🎉 Successfully extracted ` +
                    `${records.length} records`,

                    'success'

                );

            }
            else {

                allRecords = [];

                renderTable([]);


                fileStatus.textContent =

                    '⚠️ No column schedule records found';


                consoleLog(

                    '⚠️ No column schedule records extracted',

                    'warning'

                );

            }

        }
        catch (error) {

            allRecords = [];

            renderTable([]);


            consoleLog(

                `❌ Error parsing JSON: ` +
                `${error.message}`,

                'error'

            );


            fileStatus.textContent =

                '❌ Invalid JSON format. ' +
                'Please check your data.';

        }

    }


    /* ============================================================
       LOAD FILE
       ============================================================ */

    function loadFile(file) {

        if (!file) {
            return;
        }

        consoleLog(

            `📂 Loading file: "${file.name}"`,

            'info'

        );


        const reader =
            new FileReader();


        reader.onload =
            function (event) {

                const text =
                    event.target.result;

                textInput.value =
                    text;

                processTextInput();

            };


        reader.onerror =
            function () {

                consoleLog(

                    '❌ Error reading file',

                    'error'

                );

            };


        reader.readAsText(file);
    }


    /* ============================================================
       FILE INPUT
       ============================================================ */

    fileInput.addEventListener(

        'change',

        function () {

            if (
                this.files &&
                this.files.length > 0
            ) {

                loadFile(
                    this.files[0]
                );

            }

            this.value = '';

        }

    );


    /* ============================================================
       DRAG OVER
       ============================================================ */

    uploadArea.addEventListener(

        'dragover',

        function (e) {

            e.preventDefault();

            this.classList.add(
                'dragover'
            );

        }

    );


    /* ============================================================
       DRAG LEAVE
       ============================================================ */

    uploadArea.addEventListener(

        'dragleave',

        function (e) {

            e.preventDefault();

            this.classList.remove(
                'dragover'
            );

        }

    );


    /* ============================================================
       DROP
       ============================================================ */

    uploadArea.addEventListener(

        'drop',

        function (e) {

            e.preventDefault();

            this.classList.remove(
                'dragover'
            );


            const files =
                e.dataTransfer.files;


            if (
                files &&
                files.length > 0
            ) {

                loadFile(
                    files[0]
                );

            }

        }

    );


    /* ============================================================
       UPLOAD AREA CLICK
       ============================================================ */

    uploadArea.addEventListener(

        'click',

        function (e) {

            if (
                e.target.tagName !== 'LABEL' &&
                e.target.tagName !== 'INPUT'
            ) {

                fileInput.click();

            }

        }

    );


    /* ============================================================
       PROCESS BUTTON
       ============================================================ */

    parseBtn.addEventListener(

        'click',

        processTextInput

    );


    /* ============================================================
       EXPORT BUTTON
       ============================================================ */

    exportBtn.addEventListener(

        'click',

        exportToExcel

    );


    /* ============================================================
       CLEAR DATA
       ============================================================ */

    clearBtn.addEventListener(

        'click',

        function () {

            allRecords = [];

            renderTable([]);

            textInput.value =
                '';

            fileStatus.textContent =

                'Cleared. Upload or paste data to extract.';

            consoleLog(

                '🗑️ Data cleared',

                'warning'

            );

        }

    );


    /* ============================================================
       CLEAR CONSOLE
       ============================================================ */

    clearConsoleBtn.addEventListener(

        'click',

        function () {

            consoleOutput.innerHTML =
                '';

            consoleLog(

                '🗑️ Console cleared',

                'info'

            );

        }

    );


    /* ============================================================
       INITIAL STATE
       ============================================================ */

    renderTable([]);

    fileStatus.textContent =

        'Drop JSON file here or paste data below';

    consoleLog(

        '🟢 Column Schedule Exporter ready.',

        'success'

    );

    consoleLog(

        '💡 JSON property names are normalized automatically.',

        'info'

    );

    consoleLog(

        '💡 Supported: spaces, underscores, hyphens, slash, ' +
        'upper/lower case.',

        'info'

    );

    consoleLog(

        '💡 Excel output always uses the fixed Column Schedule structure.',

        'info'

    );

})();