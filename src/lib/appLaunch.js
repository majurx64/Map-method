export function isStandaloneApp(win) {
  return win.mapMethodDesktop?.isDesktop === true || win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone === true;
}

export async function hasInstalledApp(nav, origin) {
  if (typeof nav.getInstalledRelatedApps !== 'function') return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return apps.some((app) => {
      if (app.platform !== 'webapp') return false;
      const manifestMatches = app.url && new URL(app.url, origin).href === `${origin}/manifest.webmanifest`;
      const idMatches = app.id && new URL(app.id, origin).href === `${origin}/`;
      return Boolean(manifestMatches || (!app.url && idMatches));
    });
  } catch { return false; }
}

export async function openApp({ win, prompt, installed, showHelp, clearPrompt }) {
  if (isStandaloneApp(win)) return 'standalone';
  if (prompt) {
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') showHelp();
      return choice?.outcome || 'dismissed';
    } catch {
      showHelp();
      return 'help';
    } finally { clearPrompt(); }
  }
  // No web API can guarantee a registered OS handler. Always leave a usable fallback.
  showHelp();
  if (!installed && !await hasInstalledApp(win.navigator, win.location.origin)) return 'help';
  try { win.location.assign('web+mapmethod://open'); } catch { return 'help'; }
  return 'requested';
}
