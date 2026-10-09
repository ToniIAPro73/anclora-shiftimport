import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const root = resolve(new URL('..', import.meta.url).pathname);
const dockerEnvFile = resolve(root, '.env.docker.local');
const appEnvFile = resolve(root, '.env.local');

if (!existsSync(dockerEnvFile)) {
  throw new Error('Falta .env.docker.local. No se puede iniciar el PostgreSQL local con credenciales seguras.');
}

if (!existsSync(appEnvFile)) {
  throw new Error('Falta .env.local. No se puede iniciar la aplicación contra la base local.');
}

// Force the local application contract, including when Vercel has development
// variables configured for the linked project.
dotenv.config({ path: appEnvFile, override: true });

const run = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`${command} terminó por ${signal}`));
    } else if (code !== 0) {
      reject(new Error(`${command} terminó con código ${code}`));
    } else {
      resolvePromise();
    }
  });
});

await run('docker', [
  'compose',
  '--env-file', dockerEnvFile,
  '--file', resolve(root, 'docker-compose.local.yml'),
  'up',
  '--detach',
  '--wait',
  'postgres',
]);

await run(process.execPath, [
  '--env-file=.env.local',
  'db/migrate.mjs',
  '--target-branch=local-docker',
]);

await run('vercel', ['dev', '--local', '--listen', '5173', '--yes']);
