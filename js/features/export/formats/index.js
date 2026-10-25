/** Linkivo — js/features/export/formats/index.js (v2.2.0) Registry of the item-based export formats. The Linkivo backup is built by native-format.js and listed first by the export popup. */
import json from './json.js';
import csv from './csv.js';
import xlsx from './xlsx.js';
import txt from './txt.js';
import markdown from './markdown.js';
import bookmarks from './html-bookmarks.js';
import webpage from './webpage.js';
import print from './print.js';
// ! printable.js (v2.2.0) is no longer listed: Web page and Print replace it. Kept on disk, unused; safe to delete in a later cleanup.
import opml from './opml.js';

export const FORMATS = [webpage, print, xlsx, csv, json, txt, markdown, bookmarks, opml];
export const getFormat = (id) => FORMATS.find((f) => f.id === id) || null;
/** Default option values of a format, merged with remembered ones. */
export function defaultOptions(fmt, saved = {}) { const o = {}; for (const opt of fmt.options) o[opt.id] = opt.id in saved ? saved[opt.id] : opt.default; return o; }
