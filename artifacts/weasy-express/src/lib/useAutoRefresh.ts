import { useEffect, useRef } from "react";

/**
 * Automatically re-calls `callback` on a regular interval and whenever the
 * browser tab regains focus or becomes visible again.
 *
 * @param callback  Function to call — typically your data-fetch function.
 * @param intervalMs  How often to poll in ms (default 20 s).
 */
export function useAutoRefresh(callback: () => void, intervalMs = 20_000) {
  // Keep a stable ref so changing `callback` identity never restarts the interval.
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    function fire() { cbRef.current(); }

    // Re-fetch when the user switches back to this tab
    function onVisibilityChange() {
      if (document.visibilityState === "visible") fire();
    }
    function onFocus() { fire(); }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    const id = setInterval(fire, intervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, [intervalMs]);
}
