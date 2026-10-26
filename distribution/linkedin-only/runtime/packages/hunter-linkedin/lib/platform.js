import { fileURLToPath } from 'node:url';

/**
 * Resolve a Node CLI package to its JavaScript entry point and launch it with
 * the current Node executable. This avoids platform-specific npm shims such as
 * opencli.cmd on Windows.
 */
export function resolveNodeCliInvocation(specifier, args = [], options = {}) {
  const resolve = options.resolve || import.meta.resolve;
  const nodeExecutable = options.nodeExecutable || process.execPath;
  const entryUrl = resolve(specifier);
  return {
    command: nodeExecutable,
    args: [fileURLToPath(entryUrl), ...args],
  };
}

/** Bring the controlled browser page to the foreground when the adapter exposes it. */
export async function bringPageToFront(page) {
  const candidates = [
    page && typeof page.bringToFront === 'function' ? () => page.bringToFront() : null,
    page?._page && typeof page._page.bringToFront === 'function' ? () => page._page.bringToFront() : null,
  ].filter(Boolean);

  for (const activate of candidates) {
    try {
      await activate();
      return true;
    } catch {
      // Try the next adapter surface.
    }
  }
  return false;
}

export function getChromeCandidates(platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app', '/Applications/Chromium.app'];
  }
  if (platform === 'win32') {
    return [
      env.PROGRAMFILES && `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      env['PROGRAMFILES(X86)'] && `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      env.PROGRAMFILES && `${env.PROGRAMFILES}\\Chromium\\Application\\chrome.exe`,
    ].filter(Boolean);
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}
