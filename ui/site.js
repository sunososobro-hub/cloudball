/* The one place that decides production vs dev, by host name (no build step, no second HTML file).
 * Classic script, loaded in <head> of play.html before anything paints. Result: window.SITE.dev and
 * <html data-site="dev|production">. Everything that is a development tool carries class "dev-only" and
 * is hidden by a CSS rule on data-site="production"; render/game.js reads SITE.dev for the few texts it writes.
 * Dev = localhost, a file opened from disk, and every subdomain of the Pages project (dev branch, previews).
 * Anything else, including an unknown or future custom domain, is production: the safe side for visitors.
 * tests/site.check.mjs runs this file for sample host names and checks index.html. */
(function () {
  var PAGES = 'cloudball-3uy.pages.dev';
  var h = String((typeof location !== 'undefined' && location.hostname) || '').toLowerCase().replace(/^\[|\]$/g, '');
  var dev = h === '' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.slice(-(PAGES.length + 1)) === '.' + PAGES;
  var site = { dev: dev, name: dev ? 'dev' : 'production' };
  globalThis.SITE = site;
  try { document.documentElement.dataset.site = site.name; } catch (e) { /* no DOM: nothing to mark */ }
})();
