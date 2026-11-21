import * as fs from 'fs';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite.js');
  const localMacExecutable = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
  const vscodeExecutablePath = fs.existsSync(localMacExecutable) ? localMacExecutable : undefined;

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    vscodeExecutablePath,
    launchArgs: [
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ],
  });
}

main().catch((err: unknown) => {
  console.error('Integration test runner failed:', err);
  process.exit(1);
});
