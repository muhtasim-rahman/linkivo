/**
 * Linkivo — js/core/countries.js  (v2.4.4)
 * Purpose: the country list of the Edit profile dropdown (owner): every country with its flag emoji. Names come from the browser (Intl.DisplayNames), so no list of
 *          names ships with the app. By the owner's decision the list has Palestine and has NO entry for Israel.
 * API: COUNTRY_CODES   flagOf(code) -> emoji   countryList(locale?) -> [{ code, name, flag }] sorted by name   findCountry(nameOrCode) -> entry | null   countryLabel(name) -> "flag name"
 *      (Windows shows a flag emoji as the two letters of the code; that is how Windows draws it, the list still reads fine.)
 */
export const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(' ');
const OVERRIDE = { PS: 'Palestine', XK: 'Kosovo', TW: 'Taiwan', HK: 'Hong Kong', MO: 'Macao', CD: 'DR Congo', CG: 'Congo', CZ: 'Czechia', MK: 'North Macedonia', SZ: 'Eswatini', CV: 'Cape Verde', TR: 'Turkey', VA: 'Vatican City', CI: "Cote d'Ivoire", FK: 'Falkland Islands', MM: 'Myanmar', BN: 'Brunei', LA: 'Laos', KP: 'North Korea', KR: 'South Korea', RU: 'Russia', SY: 'Syria', IR: 'Iran', VN: 'Vietnam', BO: 'Bolivia', VE: 'Venezuela', TZ: 'Tanzania', MD: 'Moldova', FM: 'Micronesia', TL: 'Timor-Leste', PN: 'Pitcairn Islands' };
export const flagOf = (code) => (/^[A-Z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
let cache = null;
export function countryList(locale = 'en') {
  if (cache && cache.locale === locale) return cache.list;
  let dn = null; try { dn = new Intl.DisplayNames([locale], { type: 'region' }); } catch { dn = null; }
  const list = COUNTRY_CODES.map((code) => ({ code, name: OVERRIDE[code] || (dn && dn.of(code)) || code, flag: flagOf(code) })).sort((a, b) => a.name.localeCompare(b.name, locale));
  cache = { locale, list }; return list;
}
export function findCountry(v) {
  const t = String(v || '').trim().toLowerCase(); if (!t) return null;
  return countryList().find((c) => c.name.toLowerCase() === t || c.code.toLowerCase() === t) || null;
}
export const countryLabel = (name) => { const c = findCountry(name); return c ? `${c.flag} ${c.name}` : String(name || ''); };
