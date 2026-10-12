require('dotenv').config();
const { connectDb } = require('./src/config/db');
const { createApp } = require('./src/app');
const { startJobs } = require('./src/jobs');
const { ensureOwner } = require('./src/services/bootstrap.service');

const PORT = process.env.PORT || 5000;

async function main() {
  await connectDb();
  await ensureOwner();
  startJobs();

  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`academy-api listening on :${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error', err);
  process.exit(1);
});
