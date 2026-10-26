/**
 * Linkivo — js/features/library/lib-prefs.js  (v2.2.0)
 * Purpose: names and defaults of the Library, folder and import preferences, shared by the pages and the settings catalog.
 * API: LIB (pref keys)   DEFAULTS   pref(key)  setPref(key, value)
 */
import { prefs } from '../../core/local-prefs.js';

export const LIB = {
  view: 'lib.view', sort: 'lib.sort', fview: 'folder.view', fsort: 'folder.sort', showUrl: 'lib.showUrl', showPoints: 'lib.showPoints', showAdded: 'lib.showAdded',
  confirmDelete: 'lib.confirmDelete', clipboard: 'lib.clipboard',
  impBare: 'import.bare', impDedupe: 'import.dedupe', impClean: 'import.clean', impEnrich: 'import.enrich', impSpeed: 'import.speed', impReview: 'import.review', impIcons: 'import.skipIcons', keepAwake: 'import.keepAwake',
  exportFormat: 'export.format', exportOpts: 'export.opts'
};
export const DEFAULTS = {
  [LIB.view]: 'grid', [LIB.sort]: 'manual', [LIB.fview]: 'list', [LIB.fsort]: 'new', [LIB.showUrl]: true, [LIB.showPoints]: false, [LIB.showAdded]: true,
  [LIB.confirmDelete]: true, [LIB.clipboard]: true,
  [LIB.impBare]: false, [LIB.impDedupe]: true, [LIB.impClean]: false, [LIB.impEnrich]: true, [LIB.impSpeed]: 'normal', [LIB.impReview]: true, [LIB.impIcons]: true, [LIB.keepAwake]: true,
  [LIB.exportFormat]: 'linkivo', [LIB.exportOpts]: {}
};
export const pref = (key) => prefs.get(key, DEFAULTS[key]);
export const setPref = (key, value) => prefs.set(key, value);
