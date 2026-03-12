function readModeOverride() {
  if (typeof window === 'undefined') return '';
  try {
    const queryMode = new URLSearchParams(window.location.search).get('mode')?.trim().toLowerCase() || '';
    if (queryMode === 'desktop' || queryMode === 'browser') {
      window.sessionStorage.setItem('runtime_mode_override', queryMode);
      return queryMode;
    }

    const storedMode = window.sessionStorage.getItem('runtime_mode_override')?.trim().toLowerCase() || '';
    return storedMode;
  } catch {
    return '';
  }
}

export function isDesktopClient() {
  if (typeof window === 'undefined') return false;
  const modeOverride = readModeOverride();
  if (modeOverride === 'desktop') return true;
  if (modeOverride === 'browser') return false;
  return window.desktopConfig?.mode === 'desktop-remote';
}

export function isBrowserClient() {
  return !isDesktopClient();
}
