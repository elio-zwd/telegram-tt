import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, normalizePath } from 'vite';

import { WEB_K_VERSION } from '../src/web-k/version.js';
import { createWebKUserscriptMetadata } from './web-k-userscript-metadata.js';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
const TAMPERMONKEY_DIR = resolve(BUILD_DIR, '..');
const ENTRY_PATH = resolve(TAMPERMONKEY_DIR, 'src/web-k/entry.js');
const LEGACY_MAIN_PATH = resolve(TAMPERMONKEY_DIR, 'src/web-k/legacy-main.js');
const OUTPUT_FILE_NAME = 'telegram-media-continuity-web-k.user.js';
const LEGACY_METADATA_PATTERN = /^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==\r?\n\r?\n?/;
const GENERATED_NOTICE = [
  '// 此文件由构建生成，请勿直接手工修改。',
  '// 请修改 tampermonkey/src/web-k/** 后运行 `npm run build:tampermonkey:web-k`。',
].join('\n');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createLegacyMigrationPlugin() {
  const normalizedLegacyPath = normalizePath(LEGACY_MAIN_PATH);
  const versionPattern = new RegExp(`version:\\s*['"]${escapeRegExp(WEB_K_VERSION)}['"]`, 'g');

  return {
    name: 'telegram:transform-web-k-legacy-main',
    enforce: 'pre',
    transform(code, id) {
      if (normalizePath(id) !== normalizedLegacyPath) return undefined;

      const codeWithoutMetadata = code.replace(LEGACY_METADATA_PATTERN, '');
      if (codeWithoutMetadata === code) {
        this.error('legacy-main.js 缺少预期的 userscript metadata');
      }

      const versionMatches = codeWithoutMetadata.match(versionPattern) || [];
      if (versionMatches.length !== 1) {
        this.error(`legacy-main.js 调试版本标记数量异常：${versionMatches.length}`);
      }

      return {
        code: [
          "import { WEB_K_VERSION } from './version.js';",
          codeWithoutMetadata.replace(versionPattern, 'version: WEB_K_VERSION'),
        ].join('\n'),
        map: null,
      };
    },
  };
}

function createSingleFileGuardPlugin() {
  return {
    name: 'telegram:verify-web-k-single-output',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const outputs = Object.values(bundle);
      if (outputs.length !== 1) {
        this.error(`Web K userscript 必须只生成一个文件，实际为 ${outputs.length} 个`);
      }

      const [output] = outputs;
      if (output.type !== 'chunk' || !output.isEntry || output.fileName !== OUTPUT_FILE_NAME) {
        this.error(`Web K userscript 输出异常：${output.fileName}`);
      }
      if (output.dynamicImports.length > 0 || /\bimport\s*\(/.test(output.code)) {
        this.error('Web K userscript 禁止运行时动态 import');
      }
    },
  };
}

export default defineConfig({
  plugins: [
    createLegacyMigrationPlugin(),
    createSingleFileGuardPlugin(),
  ],
  build: {
    target: 'esnext',
    outDir: TAMPERMONKEY_DIR,
    emptyOutDir: false,
    copyPublicDir: false,
    modulePreload: false,
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rolldownOptions: {
      input: ENTRY_PATH,
      treeshake: false,
      output: {
        format: 'iife',
        entryFileNames: OUTPUT_FILE_NAME,
        codeSplitting: false,
        banner: `${createWebKUserscriptMetadata()}\n\n${GENERATED_NOTICE}`,
      },
    },
  },
});
