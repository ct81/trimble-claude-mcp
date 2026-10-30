function jsonDisplay(containerId, jsonData, view = "grid") {

    const container = document.getElementById(containerId);

    let records = Array.isArray(jsonData)
        ? jsonData
        : jsonData.data || [];

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]);
    }

    function formatValue(value) {
        if (value === null || value === undefined) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    }

    // GRID VIEW
    function gridView() {

        if (!records.length) {
            container.innerHTML = "<p>No records found.</p>";
            return;
        }

        const columns = [...new Set(records.flatMap(
            record => Object.keys(record)
        ))];

        container.innerHTML = `
            <div class="json-grid">

                <table width="100%" border="1" cellpadding="8"
                       cellspacing="0">

                    <thead>
                        <tr>
                            ${columns.map(col =>
                                `<th>${escapeHTML(col)}</th>`
                            ).join("")}
                            <th>Action</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${records.map((record, index) => `
                            <tr>
                                ${columns.map(col => `
                                    <td>${escapeHTML(
                                        formatValue(record[col])
                                    )}</td>
                                `).join("")}

                                <td>
                                    <button data-index="${index}"
                                            class="json-view-btn">
                                        View
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>

                </table>
            </div>
        `;

        container.querySelectorAll(".json-view-btn")
            .forEach(button => {
                button.addEventListener("click", () => {
                    formView(Number(button.dataset.index));
                });
            });
    }

    // FORM VIEW
    function formView(index) {

        const record = records[index];

        container.innerHTML = `
            <div class="json-form">

                <div class="json-form-header">
                    <button id="jsonBack">← Back</button>
                    <h3>Record Details</h3>
                </div>

                <div class="json-form-fields">

                    ${Object.entries(record).map(([key, value]) => `
                        <div class="json-form-field">
                            <label>${escapeHTML(key)}</label>
                            <input
                                type="text"
                                value="${escapeHTML(formatValue(value))}"
                                readonly
                            />
                        </div>
                    `).join("")}

                </div>

            </div>
        `;

        container.querySelector("#jsonBack")
            .addEventListener("click", gridView);
    }

    // INITIALIZE
    if (view === "form" && records.length) formView(0);
    else gridView();
}