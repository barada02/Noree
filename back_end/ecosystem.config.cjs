const { existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const sandboxDir = join(homedir(), 'noree-sandbox');

const apps = [
  {
    name: 'noree-api',
    script: 'dist/main.js',
    // One process only: sync state lives in memory, so a second instance would split the document.
    instances: 1,
    // Time to save open documents before pm2 force-kills on a restart.
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  },
];

// Only when installed, so a failed sandbox setup can never stop the main app from deploying.
if (existsSync(join(sandboxDir, '.venv', 'bin', 'uvicorn')) && existsSync(join(sandboxDir, 'run-sandbox.sh'))) {
  apps.push({
    name: 'noree-sandbox',
    script: 'run-sandbox.sh',
    cwd: sandboxDir,
    interpreter: 'bash',
    max_restarts: 5,
    restart_delay: 5000,
    kill_timeout: 5000,
  });
}

module.exports = { apps };
