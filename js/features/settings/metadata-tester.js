/**
 * Linkivo — js/features/settings/metadata-tester.js  (v2.1.0)
 * Purpose: Settings > Advanced > Metadata tester (PLAN slice 8). Paste up to 25 URLs, run them through the Worker and see, per URL,
 *          what was found, which engine answered, which engines failed and how long it took. It is also the acceptance tool for the
 *          Worker: the "Load sample" button fills 25 varied URLs (video, social, news, blocked sites, a redirect, a dead domain and
 *          two addresses the SSRF guard must refuse).
 * API: renderTester() -> Element
 */
import { h } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { fetchMeta, META_BATCH } from '../../core/worker-client.js';
import { plural } from '../../core/format.js';

export const SAMPLE_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/jNQXAC9IVRw', 'https://vimeo.com/76979871', 'https://x.com/NASA',
  'https://www.reddit.com/r/programming/', 'https://github.com/cloudflare/workers-sdk', 'https://en.wikipedia.org/wiki/Hyperlink',
  'https://developer.mozilla.org/en-US/docs/Web/HTML', 'https://www.bbc.com/news', 'https://www.nytimes.com/', 'https://medium.com/',
  'https://stackoverflow.com/questions/11227809', 'https://www.amazon.com/', 'https://www.instagram.com/instagram/', 'https://www.tiktok.com/@tiktok',
  'https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF', 'https://www.linkedin.com/company/linkedin/', 'https://www.facebook.com/facebook',
  'https://news.ycombinator.com/', 'https://www.cloudflare.com/', 'https://example.com/', 'http://httpbin.org/redirect/2',
  'https://this-domain-does-not-exist-linkivo.invalid/', 'http://localhost:8080/admin', 'http://169.254.169.254/latest/meta-data/'
];

function card(r) {
  const ok = r.ok && (r.title || r.image);
  const frame = r.frameable === true ? 'Can be embedded' : r.frameable === false ? 'Blocks embedding' : 'Embedding unknown';
  return h('article', { class: 'mt-card' },
    h('div', { class: 'mt-head' },
      r.favicon && /^https:/.test(r.favicon) ? h('img', { class: 'mt-fav', src: r.favicon, alt: '', width: 28, height: 28, referrerpolicy: 'no-referrer', loading: 'lazy' }) : h('span', { class: 'mt-fav' }),
      h('div', { class: 'row-main' },
        h('div', { class: ok ? 'mt-ok' : 'mt-bad', text: ok ? (r.title || '(no title, image only)') : `Failed: ${r.error || 'nothing found'}` }),
        h('div', { class: 'mt-url', text: r.url }))),
    ok && r.desc && h('p', { class: 'help', text: r.desc.slice(0, 220) }),
    ok && r.image && /^https:/.test(r.image) && h('img', { class: 'mt-img', src: r.image, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }),
    h('dl', { class: 'kv' },
      h('dt', { text: 'Answered by' }), h('dd', { text: r.engine || 'none' }),
      h('dt', { text: 'Time' }), h('dd', { text: r.ms != null ? `${r.ms} ms` : 'n/a' }),
      h('dt', { text: 'Embedding' }), h('dd', { text: frame }),
      r.type && [h('dt', { text: 'Type' }), h('dd', { text: r.type })],
      r.video && [h('dt', { text: 'Video' }), h('dd', { class: 'mono', text: r.video })]),
    r.log && r.log.length > 0 && h('div', { class: 'mt-log', 'aria-label': 'Engine log' }, r.log.map((l) => h('div', { class: l.ok ? 'mt-ok' : 'mt-bad', text: `${l.ok ? 'ok  ' : 'fail'} ${l.engine} ${l.ms != null ? l.ms + ' ms' : ''}${l.error ? ' - ' + l.error : ''}` }))));
}

export function renderTester() {
  const area = h('textarea', { class: 'input mono', rows: 6, placeholder: 'One URL per line (up to 25)', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'URLs to test' });
  const run = h('button', { type: 'button', class: 'btn btn-primary', text: 'Run test' });
  const sample = h('button', { type: 'button', class: 'btn', text: 'Load 25 sample URLs', on: { click: () => { area.value = SAMPLE_URLS.join('\n'); } } });
  const summary = h('p', { class: 'help', 'aria-live': 'polite' });
  const results = h('div', { class: 'mt-results' });
  const copy = h('button', { type: 'button', class: 'btn btn-sm', text: 'Copy results as JSON', hidden: true });
  let last = [];

  run.addEventListener('click', async () => {
    const urls = [...new Set(area.value.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, META_BATCH);
    if (!urls.length) { toast('Add at least one URL.', { type: 'error' }); return; }
    run.classList.add('is-loading'); run.disabled = true; results.replaceChildren(); summary.textContent = `Testing ${plural(urls.length, 'URL')}...`;
    const t0 = performance.now();
    const map = await fetchMeta(urls);
    last = urls.map((u) => map.get(u));
    results.replaceChildren(...last.map(card));
    const good = last.filter((r) => r.ok && (r.title || r.image)).length;
    summary.textContent = `${good} of ${urls.length} returned data in ${Math.round(performance.now() - t0)} ms.`;
    copy.hidden = false; run.classList.remove('is-loading'); run.disabled = false;
  });
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(last, null, 2)); toast('Results copied.'); } catch { toast('Could not copy.', { type: 'error' }); } });

  return h('div', { class: 'mt-tester' },
    h('div', { class: 'row-main' }, h('div', { class: 'row-label', text: 'Metadata tester' }), h('div', { class: 'row-desc', text: 'Sends the URLs to the Worker and shows what it found, which engine answered and which failed.' })),
    area, h('div', { class: 'page-actions' }, run, sample), summary, copy, results);
}
