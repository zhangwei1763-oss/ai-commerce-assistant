import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const configPath = path.join(projectRoot, 'desktop.config.json');

function parseArgs(argv) {
  const parsed = {
    apiBaseUrl: '',
    dirOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--dir') {
      parsed.dirOnly = true;
      continue;
    }
    if (current === '--api-base-url') {
      parsed.apiBaseUrl = (argv[index + 1] || '').trim();
      index += 1;
    }
  }

  return parsed;
}

function isValidHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function readConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error('desktop.config.json 不存在，请先配置远程 API 地址。');
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return typeof parsed?.apiBaseUrl === 'string' ? parsed.apiBaseUrl.trim() : '';
}

function writeConfig(apiBaseUrl) {
  const content = `${JSON.stringify({ apiBaseUrl: apiBaseUrl.replace(/\/$/, '') }, null, 2)}\n`;
  fs.writeFileSync(configPath, content, 'utf8');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.apiBaseUrl) {
    if (!isValidHttpUrl(args.apiBaseUrl)) {
      throw new Error('API 地址必须以 http:// 或 https:// 开头。');
    }
    writeConfig(args.apiBaseUrl);
  }

  const configuredApiBaseUrl = readConfig();
  if (!configuredApiBaseUrl || !isValidHttpUrl(configuredApiBaseUrl)) {
    throw new Error('desktop.config.json 中的 apiBaseUrl 无效，请先填写远程 API 地址。');
  }

  run('npm', ['run', 'build']);
  run('npx', ['electron-builder', ...(args.dirOnly ? ['--dir'] : [])]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : '桌面客户端打包失败');
  process.exit(1);
}
