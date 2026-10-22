/**
 * Linkivo — js/features/shell/update-prompt.js  (v2.1.2)
 * Purpose: the "Update available" popup shown when a newer version is found while the app is in use (at launch the update is applied
 *          silently, see core/update.js). It asks once per version per session; "Later" keeps the app running as it is.
 * API: showUpdatePrompt(version) -> void
 */
import { openSheet } from '../../ui/sheet.js';
import { applyUpdate } from '../../core/update.js';
import app from '../../core/app-info.js';

let shownFor = '';

export function showUpdatePrompt(version) {
  if (shownFor === version) return;
  shownFor = version;
  openSheet({
    title: 'Update available',
    body: `Linkivo ${version} is ready (you are on ${app.version}). Updating takes a few seconds and reloads the app.`,
    actions: [{ label: 'Later' }, { label: 'Update now', variant: 'primary', closes: false, onClick: (api) => { api.setBusy(true); applyUpdate(); } }]
  });
}
