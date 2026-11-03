module.exports = {
  apps: [
    {
      name: 'noree-api',
      script: 'dist/main.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
