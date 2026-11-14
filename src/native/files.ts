import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNative } from './platform';

/** Files in the app's data directory (phones only). Paths are relative – the absolute path changes with iOS updates. */
export const files = {
  async write(path: string, base64: string): Promise<void> {
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
  },
  /** URL an <img> can load, or null if the file is gone. */
  async src(path: string): Promise<string | null> {
    if (!isNative) return null;
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(uri);
    } catch {
      return null;
    }
  },
  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
  },
  async removeDir(path: string): Promise<void> {
    if (!isNative) return;
    await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true }).catch(() => undefined);
  },
  /** Total size in bytes of the files in a directory. */
  async dirSize(path: string): Promise<number> {
    if (!isNative) return 0;
    try {
      const { files: list } = await Filesystem.readdir({ path, directory: Directory.Data });
      return list.reduce((n, f) => n + (f.size ?? 0), 0);
    } catch {
      return 0;
    }
  },
};
