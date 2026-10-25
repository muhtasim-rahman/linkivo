/**
 * Linkivo — js/core/wake-lock.js  (v2.2.1)
 * Purpose: a phone that goes to sleep pauses the browser, and a big import or title fetch stops with it. While a background task runs this asks the
 *          Screen Wake Lock API (where the browser has it) to keep the screen on, and lets go when the queue is idle. Nothing happens in browsers
 *          without the API. It cannot keep a CLOSED browser working: that needs the Worker cron of v2.5.0.
 * API: keepAwakeWhile(queue) -> stop()      (queue needs isBusy() and subscribe(fn) -> off)
 */
export function keepAwakeWhile(queue) {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return () => {};
  let lock = null, live = true;
  const acquire = async () => {
    try {
      if (!live || lock || document.visibilityState !== 'visible') return;
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { lock = null; /* denied (battery saver): the task simply runs without it */ }
  };
  const off = queue.subscribe(() => { if (!queue.isBusy()) stop(); });
  function stop() { live = false; off(); document.removeEventListener('visibilitychange', acquire); try { lock?.release(); } catch { /* ignore */ } lock = null; }
  document.addEventListener('visibilitychange', acquire);
  acquire();
  return stop;
}
