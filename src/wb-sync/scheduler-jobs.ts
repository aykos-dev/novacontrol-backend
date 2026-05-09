export const SCHEDULER_JOBS = [
  {
    id: 'full-sync',
    label: 'Full WB sync',
    description: 'Pulls report data from Wildberries for all active clients every 30 minutes.',
    scheduleLabel: 'Every 30 minutes',
  },
  {
    id: 'daily-expense-report',
    label: 'Daily expense report (Telegram)',
    description: 'Sends today’s expense breakdown per client to Telegram.',
    scheduleLabel: 'Daily at 23:00',
  },
  {
    id: 'morning-balance-report',
    label: 'Morning balance report (Telegram)',
    description: 'Sends the morning balance summary to Telegram.',
    scheduleLabel: 'Daily at 09:00',
  },
  {
    id: 'alert-reset',
    label: 'Midnight alert reset',
    description: 'Resets daily alert deduplication state.',
    scheduleLabel: 'Midnight',
  },
] as const;

export type SchedulerJobId = (typeof SCHEDULER_JOBS)[number]['id'];

const JOB_IDS = new Set<string>(SCHEDULER_JOBS.map((j) => j.id));

export function isSchedulerJobId(id: string): id is SchedulerJobId {
  return JOB_IDS.has(id);
}
