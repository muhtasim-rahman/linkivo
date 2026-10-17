// ============================================================
// Linkivo — config.js
// Loads app.json config and exposes it globally
// ============================================================

const Config = (() => {
  let _config = null;

  async function load() {
    try {
      const res = await fetch('/app.json');
      _config = await res.json();
      document.title = _config.name;
      return _config;
    } catch (e) {
      console.error('[Config] Failed to load app.json', e);
      _config = { name: 'Linkivo', version: 'v1.0.0', tagline: 'Smart Link Manager' };
      return _config;
    }
  }

  function get(key) {
    if (!_config) return null;
    return key ? _config[key] : _config;
  }

  return { load, get };
})();

export default Config;
