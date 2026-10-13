const prefixes = {
    Azores: ['AZ'], 'Carissa Lane': ['CL'], Genesis: ['GEN'],
    Hazelmere: ['HZM', 'HM'], "L'Montagne": ['LM'], Queensgate: ['QG'],
    'Rivonia Gate': ['RG'], Taragona: ['TG'], 'Villino Glen': ['VG'],
    'Phanda Lodge': ['PH', 'PHA'], 'Vista Del Monte': ['VD'], Bonifay: ['BC', 'BON'],
    Akasia: ['AK']
};

export function normalizeUnit(value) {
    const match = /^(?:unit\s*)?0*(\d{1,5})\s*([a-z]?)$/i.exec(String(value).trim());
    if (!match) throw new Error('Use an exact unit number, such as 28 or 28A.');
    return `${Number(match[1])}${match[2].toUpperCase()}`;
}

export function unitFromLabel(building, label) {
    const prefix = (prefixes[building] ?? []).join('|');
    const pattern = new RegExp(`^(?:(?:${prefix || 'UNIT'})\\s*)?(?:UNIT\\s*)?(\\d{1,5}\\s*[A-Z]?)$`, 'i');
    const match = pattern.exec(String(label).trim());
    return match ? normalizeUnit(match[1]) : null;
}

export function captureMonth(date) {
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit'
    }).formatToParts(date);
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}

export function readNavigation(search, buildings) {
    const params = new URLSearchParams(search);
    let building = params.get('building') ?? '';
    if (building.toLowerCase() === 'hzm') building = 'Hazelmere';
    if (building) {
        building = buildings.find(name => name.toLowerCase() === building.toLowerCase());
        if (!building) throw new Error('Unknown building in the dashboard link. Select a building to continue.');
    }
    const month = params.get('month') ?? '';
    if (month && !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) {
        throw new Error('Invalid month in dashboard link. Use YYYY-MM.');
    }
    const rawUnit = params.get('unit') ?? '';
    return { building: building || '', month, unit: rawUnit ? normalizeUnit(rawUnit) : '' };
}

export function filterCaptures(rows, { building, month, unit }) {
    return rows.filter(row =>
        (!month || captureMonth(row.capturedAtDate) === month) &&
        (!unit || unitFromLabel(building, row.label) === unit)
    );
}
