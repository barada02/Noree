module.exports = {
  apps: [
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
  ],
};
