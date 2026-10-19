/**
 * Linkivo — js/ui/confirm.js  (v2.1.0)
 * Purpose: promise-based confirmation for destructive or irreversible actions (RULES section 5).
 * API: confirmDialog({ title, message, confirmLabel, cancelLabel, danger }) -> Promise<boolean>   (false on cancel, Back or Escape)
 */
import { openSheet } from './sheet.js';

export function confirmDialog({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet({
      title, body: message, role: 'alertdialog',
      actions: [
        { label: cancelLabel, onClick: () => { answer = false; } },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => { answer = true; } }
      ],
      onClose: () => resolve(answer)
    });
  });
}
