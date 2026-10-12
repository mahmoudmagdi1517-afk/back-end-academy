const cron = require('node-cron');
const { TIMEZONE } = require('../constants');
const { runDailyJob, generateTodaySessions, checkMissingSessionLogs } = require('../services/jobs.service');

function startJobs() {
  // 01:05 Asia/Qatar daily
  cron.schedule(
    '5 1 * * *',
    async () => {
      try {
        const result = await runDailyJob();
        // eslint-disable-next-line no-console
        console.log('Daily job done', result.today);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Daily job failed', err);
      }
    },
    { timezone: TIMEZONE }
  );

  cron.schedule(
    '* * * * *',
    async () => {
      try {
        const generated = await generateTodaySessions();
        if (generated.failures.length > 0) {
          // eslint-disable-next-line no-console
          console.error('Scheduled sessions could not be generated', generated.failures);
        }
        const result = await checkMissingSessionLogs();
        if (generated.created > 0 || result.checked > 0) {
          // eslint-disable-next-line no-console
          console.log('Session schedule check done', {
            created: generated.created,
            checked: result.checked,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Session alert check failed', err);
      }
    },
    { timezone: TIMEZONE }
  );
}

module.exports = { startJobs };
