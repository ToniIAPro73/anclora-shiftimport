import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_ROOT } from './env';

export interface CaseArtifacts {
  dir: string;
  consoleLines: string[];
  pageErrors: string[];
  failedRequests: string[];
  writeResult(data: unknown): void;
  flush(): void;
}

/** Per-case evidence collector: artifacts/<CASE_ID>/{result.json,console.log,*.png}. */
export function createCaseArtifacts(caseId: string): CaseArtifacts {
  const dir = path.join(ARTIFACTS_ROOT, caseId);
  fs.mkdirSync(dir, { recursive: true });
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  return {
    dir,
    consoleLines,
    pageErrors,
    failedRequests,
    writeResult(data: unknown) {
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(data, null, 2));
    },
    flush() {
      fs.writeFileSync(
        path.join(dir, 'console.log'),
        [
          ...consoleLines.map((l) => `[console] ${l}`),
          ...pageErrors.map((l) => `[pageerror] ${l}`),
          ...failedRequests.map((l) => `[requestfailed] ${l}`),
        ].join('\n'),
      );
    },
  };
}
