/**
 * Linkivo — js/core/app-info.js  (v2.1.0)
 * Purpose: static facts about the app shown in the UI. VERSION must equal app.json and sw.js (checked by check.mjs).
 * API: default export { name, tagline, version, developer, site, repo }
 */
export default Object.freeze({
  name: 'Linkivo', tagline: 'Manage your links', version: '2.1.0',
  developer: 'Muhtasim Rahman', site: 'https://mdturzo.web.app', repo: 'https://github.com/muhtasim-rahman/linkivo', hosting: 'https://linkivo.web.app'
});
