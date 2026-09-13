export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n') + '\r\n';
}

export function downloadCsv(fileName: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const EMPLOYEE_TEMPLATE_HEADERS = ['externalEmployeeId', 'name', 'area'];
export const EMPLOYEE_TEMPLATE_ROWS = [{ externalEmployeeId: 'EJEMPLO-001', name: 'Persona Ejemplo', area: '' }];
export const USER_TEMPLATE_HEADERS = ['email', 'displayName', 'role', 'externalEmployeeId', 'locale'];
export const USER_TEMPLATE_ROWS = [{
  email: 'usuario@example.invalid', displayName: 'Usuario Ejemplo', role: 'EMPLOYEE', externalEmployeeId: '', locale: 'es',
}];
