/**
 * Linkivo — js/core/app-info.js  (v2.3.1)
 * Purpose: static facts about the app shown in the UI. VERSION must equal app.json and sw.js (checked by check.mjs).
 *          `photo` is the developer picture (hosted externally; the UI falls back to initials if it does not load).
 * API: default export { name, tagline, version, developer, site, github, repo, hosting, contact, photo }
 */
export default Object.freeze({
  name: 'Linkivo', tagline: 'Manage your links', version: '2.3.2',
  developer: 'Muhtasim Rahman', site: 'https://mdturzo.web.app', github: 'https://github.com/muhtasim-rahman',
  repo: 'https://github.com/muhtasim-rahman/linkivo', hosting: 'https://linkivo.web.app', contact: 'mdturzo.dev@gmail.com',
  photo: 'https://i.ibb.co.com/Jwt7DRN9/167641690.png'
});
