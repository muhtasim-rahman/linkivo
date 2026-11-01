/**
 * Linkivo — js/features/shell/pages/profile-thumbs.js  (v2.4.2)
 * Purpose: the saved screenshot address of a link, if it has one (linkMeta.shot, stored the first time a thum.io screenshot was taken). Pure, so it can be tested.
 * API: shotFromMeta(meta) -> https url | ''
 */
export const shotFromMeta = (meta) => (meta && typeof meta.shot === 'string' && /^https:\/\//.test(meta.shot) ? meta.shot : '');
