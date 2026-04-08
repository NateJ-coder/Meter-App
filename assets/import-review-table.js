function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderFlags(flags) {
    if (!flags || flags.length === 0) {
        return '<span class="text-muted">None</span>';
    }

    return flags.map((flag) => {
        const severityClass = flag.severity === 'high'
            ? 'badge-danger'
            : flag.severity === 'medium'
                ? 'badge-warning'
                : 'badge-info';

        return `<span class="badge ${severityClass}" title="${escapeHtml(flag.message)}">${escapeHtml(flag.code || flag.type)}</span>`;
    }).join(' ');
}

function renderIssues(issues) {
    if (!issues || issues.length === 0) {
        return '<span class="text-muted">None</span>';
    }

    return issues.map((issue) => {
        const severityClass = issue.severity === 'error' ? 'badge-danger' : 'badge-warning';
        return `<span class="badge ${severityClass}" title="${escapeHtml(issue.message)}">${escapeHtml(issue.code)}</span>`;
    }).join(' ');
}

function getStatusLabel(row) {
    if (row.blockingIssues?.length) {
        return '<span class="badge badge-danger">unmatched</span>';
    }

    if (row.flags?.length) {
        return '<span class="badge badge-warning">needs review</span>';
    }

    return '<span class="badge badge-success">ready</span>';
}

export function renderImportReviewTable(rows, container, handlers = {}) {
    if (!container) {
        return;
    }

    if (!rows || rows.length === 0) {
        container.innerHTML = '<p class="text-muted">No preview rows generated yet.</p>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Approve</th>
                    <th>Unit</th>
                    <th>Meter</th>
                    <th>Current</th>
                    <th>Previous</th>
                    <th>Consumption</th>
                    <th>Flags</th>
                    <th>Issues</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row, index) => `
                    <tr data-preview-row-index="${index}">
                        <td>
                            <input type="checkbox"
                                data-preview-approve="${index}"
                                ${row.approved ? 'checked' : ''}
                                ${row.blockingIssues?.length ? 'disabled' : ''}
                            >
                        </td>
                        <td>${escapeHtml(row.displayUnit || 'N/A')}</td>
                        <td>${escapeHtml(row.displayMeter || 'N/A')}</td>
                        <td>${row.currentReading ?? 'N/A'}</td>
                        <td>${row.previousReading ?? 'N/A'}</td>
                        <td>${row.consumption ?? 'N/A'}</td>
                        <td>${renderFlags(row.flags)}</td>
                        <td>${renderIssues(row.issues)}</td>
                        <td>${getStatusLabel(row)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.querySelectorAll('[data-preview-approve]').forEach((input) => {
        input.addEventListener('change', (event) => {
            const rowIndex = Number(event.currentTarget.getAttribute('data-preview-approve'));
            handlers.onToggleApprove?.(rowIndex, event.currentTarget.checked);
        });
    });
}
