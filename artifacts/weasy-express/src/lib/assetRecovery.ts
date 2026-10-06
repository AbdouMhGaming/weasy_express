// Open tabs can refer to an old hashed chunk after a full production upload.
// Recover once, never loop if the upload itself is incomplete.
window.addEventListener("vite:preloadError", event => {
  try {
    const key = "weasy-last-asset-recovery";
    const previous = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - previous < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch { /* Storage can be blocked; allow the normal error UI to show. */ }
});
