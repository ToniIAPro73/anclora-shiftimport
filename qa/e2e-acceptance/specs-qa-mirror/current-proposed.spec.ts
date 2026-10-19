import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, type QaContext } from '../helpers/qa-mirror';

let ctx: QaContext;

test.beforeAll(async () => {
  ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  await assertQaOrganization(ctx.organizationId);
});

test.describe('current/proposed existing-calendar comparison (read only)', () => {
  test('Differences shows current and proposal separately without legacy plan copy', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop project only');
    await page.goto('/app');
    const filter = page.getByTestId('calendar-employee-filter');
    await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
    await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
    const button = page.getByTestId('calendar-reconciliation-button');
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(dialog).toBeVisible();
    for (const label of ['Calendario actual', 'Propuesta detectada']) await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
    const body = await dialog.innerText();
    expect(body).not.toMatch(/Plan Empresa|Empresa antes|Empresa ahora|Plan vigente|baseline|revision/i);
  });

});
