import path from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vite';

import packageJson from './package.json';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  build: {
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
    },
    rollupOptions: {
      output: [
        {
          format: 'es',
          dir: 'dist',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
        {
          format: 'commonjs',
          dir: 'dist',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name].cjs',
        },
      ],
      plugins: [],
      external: [
        ...Object.keys(packageJson.peerDependencies),
        'reflect-metadata',
      ],
    },
  },
});
