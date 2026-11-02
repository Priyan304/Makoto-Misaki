(() => {
  let mounted = false;
  const fail = code => {
    if (mounted) return;
    document.getElementById('startup-title').textContent = 'Misaki could not finish opening';
    document.getElementById('startup-detail').textContent = 'The interface did not load correctly. Reload it to try again. Your saved preferences will be kept.';
    document.getElementById('startup-retry').hidden = false;
    const status = document.getElementById('startup-code');
    status.textContent = 'Startup code: ' + code; status.hidden = false;
    window.misakiDesktop?.reportInterface?.('error')?.catch(() => {});
  };
  const timer = setTimeout(() => fail('UI_TIMEOUT'), 15000);
  window.addEventListener('misaki-ui-ready', () => { mounted = true; clearTimeout(timer); document.getElementById('startup-screen')?.remove(); }, { once: true });
  window.addEventListener('error', () => fail('UI_SCRIPT_ERROR'));
  window.addEventListener('unhandledrejection', () => fail('UI_MODULE_ERROR'));
  document.getElementById('startup-retry').addEventListener('click', () => location.reload());
})();
