/**
 * Linkivo — js/features/export/backup-reminder.js  (v2.5.3)
 * Purpose: a gentle reminder to make a backup (FEATURES section 6b; guests too: a guest's links live only on this device, so for them it matters most). The person picks how often
 *          (Settings > Import, export and backup > Backup reminder: Off, every week, every 2 weeks, every month); the reminder appears once when the app opens, at most once a day,
 *          only when the library has links and no Linkivo backup was made in that time. "Back up now" opens the Export popup on the Linkivo backup, "Later" snoozes it one day.
 *          The time of the last backup is kept on this device only (backup.last); a backup is counted when the Linkivo backup file is made, passphrase or not.
 * API: REMIND_OPTIONS  remindDays()  markBackupDone(now?)  reminderDue({ now, last, days, links, snoozeUntil, created }) -> boolean (pure, tested)  initBackupReminder({ engine | () => engine }) -> off
 */
import { prefs } from '../../core/local-prefs.js';
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';

export const REMIND_KEY = 'backup.remind', LAST_KEY = 'backup.last', SNOOZE_KEY = 'backup.snooze', FIRST_KEY = 'backup.seen';
export const REMIND_OPTIONS = [['off', 'Off'], ['7', 'Every week'], ['14', 'Every 2 weeks'], ['30', 'Every month']];
const DAY = 86400000;
export const remindDays = () => { const v = String(prefs.get(REMIND_KEY, '30')); return v === 'off' ? 0 : [7, 14, 30].includes(Number(v)) ? Number(v) : 30; };
export const markBackupDone = (now = Date.now()) => { prefs.set(LAST_KEY, now); prefs.remove(SNOOZE_KEY); };

/** Pure. `created`: when this device first saw a library (a brand-new library is not nagged on day one: the clock starts from the first time it had links). */
export function reminderDue({ now, last = 0, days, links, snoozeUntil = 0, created = 0 }) {
  if (!days || links < 1) return false;
  if (snoozeUntil && now < snoozeUntil) return false;
  const since = last || created; if (!since) return false;   // never backed up and never seen: start the clock, do not ask yet
  return now - since >= days * DAY;
}

export function initBackupReminder({ engine: engineOrGetter, now = () => Date.now(), delay = 6000 }) {
  let timer = null;
  const check = () => {
    try {
      const engine = typeof engineOrGetter === 'function' ? engineOrGetter() : engineOrGetter;
      const s = getSession(); if (!engine || (s.mode !== 'guest' && s.mode !== 'account')) return;
      const n = engine.counts ? engine.counts().links : 0, t = now();
      if (!prefs.get(FIRST_KEY, 0) && n > 0) prefs.set(FIRST_KEY, t);   // the clock starts the first time the library has links
      if (!reminderDue({ now: t, last: Number(prefs.get(LAST_KEY, 0)), days: remindDays(), links: n, snoozeUntil: Number(prefs.get(SNOOZE_KEY, 0)), created: Number(prefs.get(FIRST_KEY, 0)) })) return;
      prefs.set(SNOOZE_KEY, t + DAY);   // asked: not again today, whatever the answer
      toast('It has been a while since your last backup.', { duration: 12000, action: { label: 'Back up now', onClick: () => import('./export-sheet.js').then((m) => m.openExport({ engine, scope: { type: 'all' }, title: 'Back up your library' })) } });
    } catch { /* a reminder must never break the app */ }
  };
  timer = setTimeout(check, delay);
  return () => clearTimeout(timer);
}
