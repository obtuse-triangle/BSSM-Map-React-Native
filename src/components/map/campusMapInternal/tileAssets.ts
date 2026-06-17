import { Asset } from 'expo-asset';

let designTilesPathPromise: Promise<string | null> | null = null;

export function getDesignTilesPath(): Promise<string | null> {
  if (!designTilesPathPromise) {
    designTilesPathPromise = (async () => {
      try {
        const asset = Asset.fromModule(require('../../data/campus-design.mbtiles'));
        const downloaded = await asset.downloadAsync();
        if (downloaded.localUri) {
          return downloaded.localUri.replace('file://', '');
        }
        console.warn('[CampusMap] downloadAsync returned no localUri for mbtiles asset');
        return null;
      } catch (err) {
        console.error('[CampusMap] Failed to resolve mbtiles path:', err);
        return null;
      }
    })();
  }
  return designTilesPathPromise;
}
