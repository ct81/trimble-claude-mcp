import {
    EXPECTED_COLUMNS,
    processColumnSchedule
} from './columnScheduleExporter.js';


// ============================================================
// COLUMN SCHEDULE UI
// ============================================================

if (typeof document !== 'undefined') {

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


    // ========================================================
    // APPLICATION DATA
    // ========================================================

    let allRecords = [];


    // ========================================================
    // ESCAPE HTML
    // ========================================================

    function escapeHtml(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }


    // ========================================================
    // CONSOLE
    // ========================================================

    function consoleLog(
        message,
        type = 'info',
        data = null
    ) {

        if (!consoleOutput) {
            console.log(message, data);
            return;
        }

        const timestamp =
            new Date().toLocaleTimeString();

        const entry =
            document.createElement('div');

        entry.className =
            `log-entry ${type}`;

        let content =
            `<span class="timestamp">[${timestamp}]</span> ` +
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


    // ========================================================
    // RENDER TABLE
    // ========================================================

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

            rowCountBadge.textContent = '0';

            columnCountBadge.textContent = '0';

            detailCountBadge.textContent = '0';

            tableCount.textContent = '0 rows';

            exportBtn.disabled = true;

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
                        .map(r => r.DetailMark)
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


    // ========================================================
    // PROCESS TEXT
    // ========================================================

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


            if (records.length > 0) {

                allRecords =
                    records;

                renderTable(
                    allRecords
                );


                fileStatus.textContent =
                    `✅ ${records.length} records extracted`;


                consoleLog(
                    `🎉 Successfully extracted ${records.length} records`,
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
                `❌ Error parsing JSON: ${error.message}`,
                'error'
            );


            fileStatus.textContent =
                '❌ Invalid JSON format. Please check your data.';
        }
    }


    // ========================================================
    // LOAD FILE
    // ========================================================

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

                textInput.value =
                    event.target.result;

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


    // ========================================================
    // FILE INPUT
    // ========================================================

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


    // ========================================================
    // DRAG OVER
    // ========================================================

    uploadArea.addEventListener(
        'dragover',
        function (e) {

            e.preventDefault();

            this.classList.add(
                'dragover'
            );
        }
    );


    // ========================================================
    // DRAG LEAVE
    // ========================================================

    uploadArea.addEventListener(
        'dragleave',
        function (e) {

            e.preventDefault();

            this.classList.remove(
                'dragover'
            );
        }
    );


    // ========================================================
    // DROP
    // ========================================================

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


    // ========================================================
    // UPLOAD AREA CLICK
    // ========================================================

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


    // ========================================================
    // PARSE BUTTON
    // ========================================================

    parseBtn.addEventListener(
        'click',
        processTextInput
    );


    // ========================================================
    // EXCEL EXPORT
    // ========================================================

    exportBtn.addEventListener(
        'click',
        function () {

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


            const wb =
                XLSX.utils.book_new();


            const ws =
                XLSX.utils.aoa_to_sheet(
                    excelRows
                );


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


            ws['!freeze'] = {
                xSplit: 0,
                ySplit: 1
            };


            ws['!autofilter'] = {
                ref:
                    `A1:K${excelRows.length}`
            };


            XLSX.utils.book_append_sheet(
                wb,
                ws,
                'ColumnSchedule'
            );


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
                    .slice(0, 10)
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
                `✅ Excel exported successfully with ${allRecords.length} rows`,
                'success'
            );


            fileStatus.textContent =
                `✅ Exported ${allRecords.length} records to Excel`;
        }
    );


    // ========================================================
    // CLEAR
    // ========================================================

    clearBtn.addEventListener(
        'click',
        function () {

            allRecords = [];

            renderTable([]);

            textInput.value = '';

            fileStatus.textContent =
                'Cleared. Upload or paste data to extract.';


            consoleLog(
                '🗑️ Data cleared',
                'warning'
            );
        }
    );


    // ========================================================
    // CLEAR CONSOLE
    // ========================================================

    clearConsoleBtn.addEventListener(
        'click',
        function () {

            consoleOutput.innerHTML = '';

            consoleLog(
                '🗑️ Console cleared',
                'info'
            );
        }
    );


    // ========================================================
    // INITIAL STATE
    // ========================================================

    renderTable([]);

    fileStatus.textContent =
        'Drop JSON file here or paste data below';


    consoleLog(
        '🟢 Column Schedule UI ready.',
        'success'
    );

    consoleLog(
        '💡 JSON property names are normalized automatically.',
        'info'
    );

    consoleLog(
        '💡 Excel output uses the fixed Column Schedule structure.',
        'info'
    );
}