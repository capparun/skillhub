import manifest from '../../public/download/liepin/hl-mcp-0.3.4.json';

/** Pinned to verified extension bytes; never imply compatibility with an unknown release. */
export const liepinBrowserAssets = manifest;
export function liepinExtensionFor(version: string) {
  return manifest.compatibleProductVersions.includes(version) ? manifest : null;
}
