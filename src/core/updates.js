// "A new version is available": compares the running version with ./version.json (fetched without cache).
// Pure helpers + a small checker; the UI shows a banner with a Reload button. Static hosting has no server push,
// so the page asks again on a timer and whenever the tab becomes visible.

/** True when the published version differs from the one running (builds are not ordered, any change means "reload"). */
export const isNewer = (current, remote) => typeof remote === 'string' && remote.length > 0 && current !== 'dev' && remote !== current;

export function createUpdateChecker({ current, fetchJson, onNewer, intervalMs = 10 * 60 * 1000, setIntervalFn = setInterval }) {
  let notified = false;
  let timer = 0;
  async function check() {
    if (notified || current === 'dev') return false;
    try {
      const data = await fetchJson();
      if (data && isNewer(current, data.version)) {
        notified = true;
        onNewer(data.version);
        return true;
      }
    } catch {
      /* offline or blocked: try again later, never bother the player */
    }
    return false;
  }
  return {
    check,
    start() {
      timer = setIntervalFn(check, intervalMs);
      return timer;
    },
    get notified() {
      return notified;
    },
  };
}
