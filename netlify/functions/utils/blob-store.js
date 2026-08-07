/**
 * Wraps @netlify/blobs' getStore() with a filesystem fallback for local dev.
 *
 * getStore() throws MissingBlobsEnvironmentError when the site isn't linked
 * (no siteID available), which is always true for `netlify dev` without
 * `netlify link`. In that case, fall back to JSON files under
 * .netlify/local-blobs/<store-name>/<key>.json — never used in production,
 * since a deployed function always has a real Blobs environment.
 */
import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

const LOCAL_DIR = path.join(process.cwd(), '.netlify', 'local-blobs');

function keyToFile(dir, key) {
  return path.join(dir, `${encodeURIComponent(key)}.json`);
}

function localStore(name) {
  const dir = path.join(LOCAL_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return {
    async get(key) {
      try {
        return fs.readFileSync(keyToFile(dir, key), 'utf8');
      } catch {
        return null;
      }
    },
    async set(key, value) {
      fs.writeFileSync(keyToFile(dir, key), value, 'utf8');
    },
    async delete(key) {
      try {
        fs.unlinkSync(keyToFile(dir, key));
      } catch {}
    },
  };
}

export function getBlobStore(name) {
  try {
    return getStore(name);
  } catch {
    return localStore(name);
  }
}
