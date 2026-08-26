/**
 * Siembra datos de demostración 100% sintéticos para las capturas del
 * manual de usuario (docs/manual/screenshots). No usa PII real.
 * Uso: node --env-file=.env.development.local scripts/seed-manual-demo.mjs
 * Imprime el JSON de la fixture en stdout y lo guarda en
 * tmp/manual-demo-fixture.json para que capture-manual-screenshots.mjs lo lea.
 */
import { neon } from '@neondatabase/serverless';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../api/_lib/passwords.js';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const PASSWORD = 'Manual-Demo-2026';

function isoDate(day) {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function main() {
  const hash = hashPassword(PASSWORD);

  const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES ('Cadena Aurora Hoteles', 'company', 'team') RETURNING id`)[0].id;

  const mkUser = async (email, name) =>
    (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, ${name}) RETURNING id`)[0].id;

  const adminId = await mkUser('manual-admin@demo.local', 'Marta Soler');
  const empId = await mkUser('manual-empleado@demo.local', 'Diego Ramos');

  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${org}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${empId}, ${org}, 'EMPLOYEE')`;

  const areaRecepcion = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${org}, 'Recepción', 'REC') RETURNING id`)[0].id;
  const areaCocina = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${org}, 'Cocina', 'COC') RETURNING id`)[0].id;

  const empMarta = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${org}, 'Marta Soler', ${adminId}, 'A-001', ${areaRecepcion}) RETURNING id`)[0].id;
  const empDiego = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${org}, 'Diego Ramos', ${empId}, 'E-102', ${areaRecepcion}) RETURNING id`)[0].id;
  const empElena = (await sql`INSERT INTO employees (organization_id, name, external_employee_id, area_id) VALUES (${org}, 'Elena Vidal', 'E-103', ${areaCocina}) RETURNING id`)[0].id;

  const shiftRows = [
    [empMarta, 3, '08:00', '16:00', 'Recepción'],
    [empMarta, 4, '08:00', '16:00', 'Recepción'],
    [empMarta, 5, '08:00', '16:00', 'Recepción'],
    [empMarta, 8, '16:00', '00:00', 'Recepción'],
    [empMarta, 9, '16:00', '00:00', 'Recepción'],
    [empDiego, 3, '16:00', '00:00', 'Recepción'],
    [empDiego, 4, '16:00', '00:00', 'Recepción'],
    [empDiego, 5, '08:00', '16:00', 'Recepción'],
    [empDiego, 10, '08:00', '16:00', 'Recepción'],
    [empDiego, 11, '08:00', '16:00', 'Recepción'],
    [empElena, 3, '07:00', '15:00', 'Cocina'],
    [empElena, 4, '07:00', '15:00', 'Cocina'],
    [empElena, 6, '15:00', '23:00', 'Cocina'],
    [empElena, 7, '15:00', '23:00', 'Cocina'],
  ];
  for (const [employeeId, day, start, end, location] of shiftRows) {
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin, area_id) VALUES (${org}, ${employeeId}, ${isoDate(day)}, ${start}, ${end}, ${location}, 'MAN', ${areaRecepcion})`;
  }

  const fixture = {
    org, adminId, empId,
    emails: { admin: 'manual-admin@demo.local', empleado: 'manual-empleado@demo.local' },
    password: PASSWORD,
    empMarta, empDiego, empElena, areaRecepcion, areaCocina,
  };
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/manual-demo-fixture.json', JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify(fixture, null, 2));
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
