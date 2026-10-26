import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

function extensionIdFromKey(publicKey: string): string {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest();
  return [...digest.subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .split('')
    .map((hex) => String.fromCharCode(97 + Number.parseInt(hex, 16)))
    .join('');
}

function extensionAssets(clientId: string): Plugin {
  return {
    name: 'extension-assets',
    apply: 'build',
    closeBundle() {
      const dist = resolve(root, 'extension/dist');
      const publicKey = readFileSync(resolve(root, 'extension/public-key.txt'), 'utf8').trim();
      if (publicKey.length < 100) {
        throw new Error('extension/public-key.txt is missing the Chrome extension public key.');
      }

      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version?: string };
      const manifest: Record<string, unknown> = {
        manifest_version: 3,
        name: 'Bookmarks',
        version: pkg.version || '2.0.0',
        description: 'Save the current page and browse your Bookmarks library.',
        key: publicKey,
        action: {
          default_title: 'Bookmarks',
          default_popup: 'popup.html',
          default_icon: {
            16: 'icons/icon128.png',
            32: 'icons/icon128.png',
            48: 'icons/icon128.png',
            128: 'icons/icon128.png',
          },
        },
        icons: {
          16: 'icons/icon128.png',
          48: 'icons/icon128.png',
          128: 'icons/icon128.png',
        },
        // Runs the interactive sign-in, which would close the popup midway
        background: { service_worker: 'background.js', type: 'module' },
        permissions: ['identity', 'storage', 'activeTab', 'scripting'],
      };

      if (clientId.endsWith('.apps.googleusercontent.com')) {
        manifest.oauth2 = {
          client_id: clientId,
          scopes: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
          ],
        };
      }

      writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      const iconsDir = resolve(dist, 'icons');
      mkdirSync(iconsDir, { recursive: true });
      copyFileSync(resolve(root, 'public/icons/icon-192.png'), resolve(iconsDir, 'icon128.png'));
      console.log(`Chrome extension ID: ${extensionIdFromKey(publicKey)}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const clientId = (env.VITE_EXTENSION_OAUTH_CLIENT_ID ?? '').trim();
  return {
    root: resolve(root, 'extension'),
    envDir: root,
    publicDir: false,
    base: './',
    build: {
      outDir: resolve(root, 'extension/dist'),
      emptyOutDir: true,
      modulePreload: false,
      sourcemap: false,
      rollupOptions: {
        input: {
          popup: resolve(root, 'extension/popup.html'),
          background: resolve(root, 'extension/src/background.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    plugins: [extensionAssets(clientId)],
  };
});
