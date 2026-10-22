/**
 * Linkivo — js/core/app-info.js  (v2.1.1)
 * Purpose: static facts about the app shown in the UI. `version` must equal app.json and sw.js (checked by check.mjs).
 * API: default export { name, tagline, version, developer, role, site, github, contact, repo, hosting }
 */
export default Object.freeze({
  name: 'Linkivo', tagline: 'Manage your links', version: '2.1.1',
  developer: 'Muhtasim Rahman', role: 'Developer and designer', site: 'https://mdturzo.web.app', github: 'https://github.com/muhtasim-rahman', contact: 'mdturzo.dev@gmail.com',
  repo: 'https://github.com/muhtasim-rahman/linkivo', hosting: 'https://linkivo.web.app'
});
