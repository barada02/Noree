// Must be the first import in main.ts. Deploys keep this file in ~/noree-api/.env and never overwrite it.
try {
  process.loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
