/* First-party bootstrap only. Theme files never contribute JavaScript. */
(function () {
  var safe = new URLSearchParams(location.search).get('theme-safe') === '1';
  var fallback = document.querySelector('meta[name="campus-default-mode"]').content;
  var mode = fallback;
  try { mode = localStorage.getItem('campus.theme.mode.v1') || fallback; } catch (_) {}
  if (mode !== 'system' && mode !== 'light' && mode !== 'dark') mode = fallback;
  if (safe) mode = 'light';
  if (mode !== 'light' && mode !== 'dark') mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.campusMode = mode;
}());
