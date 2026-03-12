const path = require('path');
const { spawn } = require('child_process');
const electronBinary = require('electron');

const child = spawn(
  electronBinary,
  [path.join(__dirname, 'main.cjs')],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:3000',
      ELECTRON_APP_MODE: 'desktop-remote',
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
