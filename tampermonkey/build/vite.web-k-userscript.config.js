import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { createWebKUserscriptMetadata } from './web-k-userscript-metadata.js';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
const TAMPERMONKEY_DIR = resolve(BUILD_DIR, '..');
const ENTRY_PATH = resolve(TAMPERMONKEY_DIR, 'src/web-k/entry.js');
const OUTPUT_FILE_NAME = 'telegram-media-continuity-web-k.user.js';
const GENERATED_NOTICE = [
  '// 此文件由构建生成，请勿直接手工修改。',
  '// 请修改 tampermonkey/src/web-k/** 后运行 `npm run build:tampermonkey:web-k`。',
].join('\n');

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
  plugins: [createSingleFileGuardPlugin()],
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
