import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  empA1: string;
  emails: Record<string, string>;
};

type Locale = 'es' | 'en';

test.setTimeout(180_000);

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mondayPlusWeeks(weeks: number): string {
  const value = new Date(`${isoDate(new Date())}T00:00:00.000Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day) + weeks * 7);
  return isoDate(value);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

function monthLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    month: 'long', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
});

async function configurePresentation(page: Page, locale: Locale, theme: 'dark' | 'light') {
  await page.addInitScript(({ nextLocale, nextTheme }) => {
    window.localStorage.setItem('anclora_shiftimport_locale_v1', nextLocale);
    window.localStorage.setItem('anclora_theme_mode', nextTheme);
  }, { nextLocale: locale, nextTheme: theme });
}

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password: fixture.password } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function movePlannerToWeek(page: Page, periodStart: string, locale: Locale) {
  const nextWeek = locale === 'es' ? 'Semana siguiente' : 'Next week';
  const weekNavigation = page.getByRole('group', { name: locale === 'es' ? 'Navegación semanal' : 'Weekly navigation' });
  const weekLabel = weekNavigation.locator('span');
  const planner = page.getByTestId('weekly-planner');
  const weeks = Math.round((new Date(`${periodStart}T00:00:00Z`).getTime()
    - new Date(`${mondayPlusWeeks(0)}T00:00:00Z`).getTime()) / (7 * 24 * 60 * 60 * 1000));
  for (let index = 0; index < weeks; index += 1) {
    const previousLabel = await weekLabel.textContent();
    await page.getByRole('button', { name: nextWeek }).click();
    await expect(weekLabel).not.toHaveText(previousLabel ?? '');
    await expect(planner).not.toHaveAttribute('data-state', 'loading');
  }
}

async function addShiftThroughUi(page: Page, locale: Locale, date: string, startTime: string, endTime: string) {
  const copy = locale === 'es'
    ? { add: `Añadir turno para E2E Uno el ${date}`, form: 'Añadir turno', start: 'Inicio', end: 'Fin', location: 'Ubicación', save: 'Guardar', notice: 'Turno actualizado en el borrador.' }
    : { add: `Add shift for E2E Uno on ${date}`, form: 'Add shift', start: 'Start', end: 'End', location: 'Location', save: 'Save', notice: 'Shift updated in the draft.' };
  await page.getByRole('button', { name: copy.add }).click();
  const form = page.getByRole('form', { name: copy.form });
  await expect(form).toBeVisible();
  await form.getByLabel(copy.start).fill(startTime);
  await form.getByLabel(copy.end).fill(endTime);
  await form.getByLabel(copy.location).fill('M15 E2E');
  await form.getByRole('button', { name: copy.save }).click();
  await expect(page.getByRole('status')).toContainText(copy.notice);
}

async function runHappyFlow(page: Page, locale: Locale, theme: 'dark' | 'light', periodStart: string) {
  await configurePresentation(page, locale, theme);
  await page.setViewportSize(locale === 'es' ? { width: 1440, height: 900 } : { width: 390, height: 844 });

  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) {
      consoleErrors.push(message.text());
    }
  });

  await loginAs(page, fixture.emails.planner);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.getByRole('button', { name: locale === 'es' ? 'Planificar' : 'Plan' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  await expect(page.getByRole('heading', { name: locale === 'es' ? 'Planificador semanal' : 'Weekly planner' })).toBeVisible();
  await movePlannerToWeek(page, periodStart, locale);

  const emptyState = locale === 'es' ? 'Todavía no hay un borrador para esta semana' : 'There is no draft for this week yet';
  const createDraft = locale === 'es' ? 'Crear borrador semanal' : 'Create weekly draft';
  await expect(page.getByText(emptyState)).toBeVisible();
  await page.getByRole('button', { name: createDraft }).click();
  await expect(page.getByRole('status')).toContainText(locale === 'es' ? 'Borrador semanal creado.' : 'Weekly draft created.');

  const firstDate = addDays(periodStart, 1);
  const secondDate = addDays(periodStart, 2);
  await addShiftThroughUi(page, locale, firstDate, '09:00', '17:00');

  const addLabel = locale === 'es' ? `Añadir turno para E2E Uno el ${firstDate}` : `Add shift for E2E Uno on ${firstDate}`;
  const formCopy = locale === 'es'
    ? { form: 'Añadir turno', start: 'Inicio', end: 'Fin', save: 'Guardar', cancel: 'Cancelar', overlap: 'Ese horario se solapa con otro turno del mismo empleado.', rest: 'Ese horario deja menos de 11 horas de descanso.' }
    : { form: 'Add shift', start: 'Start', end: 'End', save: 'Save', cancel: 'Cancel', overlap: 'That time overlaps another shift for the same employee.', rest: 'That time leaves less than 11 hours of rest.' };

  await page.getByRole('button', { name: addLabel }).click();
  let form = page.getByRole('form', { name: formCopy.form });
  await form.getByLabel(formCopy.start).fill('10:00');
  await form.getByLabel(formCopy.end).fill('12:00');
  await form.getByRole('button', { name: formCopy.save }).click();
  await expect(form).toContainText(formCopy.overlap);
  await form.getByRole('button', { name: formCopy.cancel }).click();

  const secondAddLabel = locale === 'es' ? `Añadir turno para E2E Uno el ${secondDate}` : `Add shift for E2E Uno on ${secondDate}`;
  await page.getByRole('button', { name: secondAddLabel }).click();
  form = page.getByRole('form', { name: formCopy.form });
  await form.getByLabel(formCopy.start).fill('03:59');
  await form.getByLabel(formCopy.end).fill('12:00');
  await form.getByRole('button', { name: formCopy.save }).click();
  await expect(form).toContainText(formCopy.rest);
  await form.getByRole('button', { name: formCopy.cancel }).click();
  // The two 422 responses above are intentional negative-path assertions;
  // only unexpected browser errors should fail the final flow check.
  consoleErrors.length = 0;

  const publish = locale === 'es' ? 'Publicar' : 'Publish';
  await page.getByRole('button', { name: publish }).click();
  await expect(page.getByRole('heading', { name: locale === 'es' ? 'Publicar planificación' : 'Publish schedule' })).toBeVisible();
  await page.getByRole('button', { name: locale === 'es' ? 'Confirmar publicación' : 'Confirm publication' }).click();
  await expect(page.getByText(locale === 'es' ? 'Solo lectura' : 'Read-only')).toBeVisible();

  const schedulesResponse = await page.request.get(`/api/schedules?areaId=${fixture.areaA}`, {
    headers: { 'x-organization-id': fixture.orgA },
  });
  expect(schedulesResponse.ok()).toBeTruthy();
  const schedule = (await schedulesResponse.json()).schedules.find((item: { periodStart: string }) => item.periodStart === periodStart);
  expect(schedule).toBeTruthy();
  const snapshotResponse = await page.request.get(`/api/schedules/${schedule.scheduleId}/versions/${schedule.id}`, {
    headers: { 'x-organization-id': fixture.orgA },
  });
  expect(snapshotResponse.ok()).toBeTruthy();
  const publishedSnapshot = await snapshotResponse.json();
  expect(publishedSnapshot.version.status).toBe('PUBLISHED');
  expect(publishedSnapshot.assignments).toEqual([
    expect.objectContaining({ employeeId: fixture.empA1, date: firstDate, startTime: '09:00', endTime: '17:00' }),
  ]);

  await page.getByRole('button', { name: locale === 'es' ? 'Volver al calendario' : 'Back to calendar' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const targetMonth = monthLabel(firstDate, locale);
  const monthNames = locale === 'es'
    ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    : ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const targetMonthIndex = monthNames.indexOf(targetMonth.toLowerCase());
  const currentMonth = new Date();
  const targetDate = new Date(`${firstDate}T00:00:00Z`);
  const monthDelta = (targetDate.getUTCFullYear() - currentMonth.getFullYear()) * 12
    + targetDate.getUTCMonth() - currentMonth.getMonth();
  const monthButton = page.locator('.month-nav-button').nth(1);
  for (let index = 0; index < Math.max(0, monthDelta); index += 1) await monthButton.click();
  await expect(page.locator('.month-nav-label')).toContainText(`${monthNames[targetMonthIndex][0].toUpperCase()}${monthNames[targetMonthIndex].slice(1)} ${targetDate.getUTCFullYear()}`);
  const employeeSelector = page.getByRole('button', { name: locale === 'es' ? 'Empleado:' : 'Employee:' });
  await employeeSelector.click();
  await page.getByRole('option', { name: /E2E Uno/ }).click();
  // MonthGrid renders the published shift's type and time; location remains
  // available in the detail editor/API snapshot, not in the compact badge.
  const targetCell = page.locator('.month-day-cell').filter({
    has: page.locator(`button[aria-label*="${firstDate}"]`),
  });
  await expect(targetCell.locator('.month-shift-badge').filter({ hasText: '09:00–17:00' })).toBeVisible();

  await page.getByRole('button', { name: locale === 'es' ? 'Planificar' : 'Plan' }).click();
  await movePlannerToWeek(page, periodStart, locale);
  await expect(page.getByText(locale === 'es' ? 'Solo lectura' : 'Read-only')).toBeVisible();
  await page.getByRole('button', { name: locale === 'es' ? 'Crear nueva versión' : 'Create new version' }).click();
  await expect(page.getByRole('status')).toContainText(locale === 'es' ? 'Nueva versión creada como borrador.' : 'New version created as a draft.');

  await page.getByRole('button', { name: locale === 'es' ? 'Historial de versiones' : 'Version history' }).click();
  const history = page.getByRole('dialog');
  await expect(history).toBeVisible();
  await expect(history).toContainText(locale === 'es' ? 'Versión 1' : 'Version 1');
  await expect(history).toContainText(locale === 'es' ? 'Versión 2' : 'Version 2');
  const firstVersionRow = history.getByRole('row').filter({ hasText: locale === 'es' ? 'Versión 1' : 'Version 1' });
  await firstVersionRow.getByRole('button', { name: locale === 'es' ? 'Ver versión' : 'View version' }).click();
  await expect(page.getByText(locale === 'es' ? 'Solo lectura' : 'Read-only')).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'es' ? 'Volver a la versión actual' : 'Back to current version' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
}

test('happy path ES desktop dark: scheduling is real browser to DB', async ({ page }) => {
  await runHappyFlow(page, 'es', 'dark', mondayPlusWeeks(13));
});

test('happy path EN mobile light: scheduling is real browser to DB', async ({ page }) => {
  await runHappyFlow(page, 'en', 'light', mondayPlusWeeks(14));
});
