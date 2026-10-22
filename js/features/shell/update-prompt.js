/**
 * Linkivo — js/features/shell/update-prompt.js  (v2.1.1)
 * Purpose: the "Update available" popup shown when a newer version exists and the app did not switch by itself (or automatic updates are off).
 * API: showUpdatePrompt({ latest, hard }) -> void     (one popup at a time)
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { hardUpdate } from '../../core/update.js';
import app from '../../core/app-info.js';

let open = false;
export function showUpdatePrompt({ latest = 'new', hard = true } = {}) {
  if (open) return;
  open = true;
  openSheet({
    title: 'Update available',
    body: h('div', { class: 'stack' },
      h('p', { text: `Linkivo ${latest === 'new' ? 'has a new version' : latest} is ready. You are using ${app.version}.` }),
      h('p', { class: 'help', text: 'Your links and settings are kept. The app reloads once.' })),
    actions: [{ label: 'Later' }, { label: 'Update now', variant: 'primary', closes: false, onClick: async (api) => { api.setBusy(true); if (hard) await hardUpdate(); else location.reload(); } }],
    onClose: () => { open = false; }
  });
}
