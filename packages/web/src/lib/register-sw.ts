export type UpdateCallback = (reg: ServiceWorkerRegistration) => void;

export async function registerSW(onUpdateAvailable: UpdateCallback) {
  if (!('serviceWorker' in navigator)) return;

  const reg = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none',
  });

  // If a new SW is already waiting, surface the UI immediately
  if (reg.waiting) onUpdateAvailable(reg);

  // Detect new SW
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      // If we have an existing controller, this is an update
      if (
        installing.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        onUpdateAvailable(reg);
      }
    });
  });

  // Optional: check periodically / on tab focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
}
