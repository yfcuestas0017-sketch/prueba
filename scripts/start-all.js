import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Iniciando Servidor Backend Express (backend/server.js) y Frontend React (frontend)...');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const server = spawn(process.execPath, [path.join(rootDir, 'backend', 'server.js')], {
  cwd: rootDir,
  stdio: 'inherit',
  windowsHide: true,
});

const client = spawn(npxCmd, ['vite'], {
  cwd: path.join(rootDir, 'frontend'),
  stdio: 'inherit',
  shell: isWin,
  windowsHide: true,
});

const cleanup = () => {
  if (server && !server.killed) server.kill();
  if (client && !client.killed) client.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
