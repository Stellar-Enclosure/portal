import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {loadEnv} from 'vite'
import { resolve as resolvePath } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import {egonFaviconPlugin} from '@stellar-enclosure/stellar-enclosure-web-shared/vite-plugin'

export default defineConfig(async ({mode, command}) => {
  const permissionPlugins: import('vite').PluginOption[] = []
  if (command === 'build') {
    if (!process.env.PAC_SDK_DIR) throw new Error('PAC_SDK_DIR_REQUIRED')
    const plugin = await import(pathToFileURL(resolve(process.env.PAC_SDK_DIR, 'scripts/permissions/consumer-vite-plugin.mjs')).href)
    permissionPlugins.push(plugin.permissionBuildPlugin())
  }
  const configuredBase = loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_PATH ?? '/'
  if (!configuredBase.startsWith('/') || configuredBase.startsWith('//')
    || /[\\?#%]/.test(configuredBase) || Array.from(configuredBase).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /\/{2,}/.test(configuredBase)
    || configuredBase.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid VITE_BASE_PATH')
  }
  const basePath = configuredBase === '/' ? '/' : configuredBase.replace(/\/?$/, '/')

  return {
    base: basePath,
    plugins: [react(), egonFaviconPlugin(), ...permissionPlugins],
    publicDir: process.env.PORTAL_PUBLIC_DIR ?? 'public',
    resolve: {
      alias: {
        '@ant-design/icons': resolvePath(import.meta.dirname, 'node_modules/@ant-design/icons'),
        '@tanstack/react-query': resolvePath(import.meta.dirname, 'node_modules/@tanstack/react-query'),
        antd: resolvePath(import.meta.dirname, 'node_modules/antd'),
        i18next: resolvePath(import.meta.dirname, 'node_modules/i18next'),
        react: resolvePath(import.meta.dirname, 'node_modules/react'),
        'react-dom': resolvePath(import.meta.dirname, 'node_modules/react-dom'),
        'react-i18next': resolvePath(import.meta.dirname, 'node_modules/react-i18next'),
        'react-router-dom': resolvePath(import.meta.dirname, 'node_modules/react-router-dom'),
      },
      dedupe: ['react', 'react-dom', 'react-i18next', 'i18next', 'antd', '@tanstack/react-query', 'react-router-dom', '@ant-design/icons'],
    },
    server: {
      host: '127.0.0.1',
      port: 18125,
      strictPort: true,
      proxy: {
        '/apps': {
          target: process.env.PORTAL_AUTH_PROXY ?? 'http://127.0.0.1:18180',
          changeOrigin: false,
        },
        '/api': {
          target: process.env.PORTAL_API_PROXY ?? 'http://127.0.0.1:18100',
          changeOrigin: true,
        },
        ...(process.env.PORTAL_MANIFEST_PROXY
          ? {
              '/portal-manifest': {
                target: process.env.PORTAL_MANIFEST_PROXY,
                changeOrigin: true,
              },
            }
          : {}),
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      exclude: ['node_modules/**', 'dist/**'],
    },
  }
})
