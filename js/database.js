// Database is fetched 100% dynamically from Google Sheets.
// All hardcoded data removed.
const REAL_DATABASE = {};
if (typeof window !== 'undefined') {
  window.REAL_DATABASE = REAL_DATABASE;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = REAL_DATABASE;
}
