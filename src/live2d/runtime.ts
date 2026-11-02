let corePromise: Promise<void> | undefined;

/** Load bundled Core before importing the Cubism adapter; no runtime CDN. */
export function loadCubismCore(): Promise<void> {
  if (corePromise) return corePromise;
  corePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}vendor/live2dcubismcore.min.js`;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Could not load Live2D Core.')); };
    document.head.appendChild(script);
  }).catch(error => { corePromise = undefined; throw error; });
  return corePromise;
}
