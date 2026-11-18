import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import {existsSync,readFileSync} from 'node:fs'
import {helpArticles,validateHelpContent} from './src/shared/help-content.ts'
import {releaseNotes,validateReleaseNotes} from './src/shared/release-content.ts'
import {helpTopicIds} from './src/shared/help.ts'
export default defineConfig({
  main: {
    plugins: [{name:'static-node-maintenance', buildStart() {
      for (const name of ['index.html','app.js','style.css']) {
        const path=resolve('src/renderer/node-maintenance',name)
        this.addWatchFile(path)
        this.emitFile({type:'asset',fileName:`maintenance-ui/${name}`,source:readFileSync(path)})
      }
    }}],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {index:resolve('src/main/index.ts'),'node-maintenance':resolve('src/main/node-maintenance/main.ts')},
        // Share the pinned updater's redaction registry rather than bundling a second copy.
        external: ['builder-util-runtime/out/httpExecutor'],
        output: { entryFileNames: '[name].cjs', format: 'cjs' },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      outDir: 'out/preload',
      rollupOptions: {
        input: {index:resolve('src/preload/index.ts'),help:resolve('src/preload/help.ts'),'release-notes':resolve('src/preload/release-notes.ts'),'node-maintenance':resolve('src/preload/node-maintenance.ts')},
        output: {
          entryFileNames: '[name].cjs',
          format: 'cjs',
          // Independent sandbox preloads; no local module loading in either entry.
          codeSplitting: true,
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [
      react(),
      tailwindcss(),
      {name:'validate-offline-help',buildStart(){
        const problems=[...validateHelpContent(helpArticles),...validateReleaseNotes(releaseNotes)]
        if(helpArticles.map(a=>a.id).sort().join()!==[...helpTopicIds].sort().join())problems.push('Help topic IDs must match the IPC allowlist')
        for(const article of helpArticles)if(article.image&&!existsSync(resolve('src/renderer/help/images',article.image.file)))problems.push(`Missing help image: ${article.image.file}`)
        const version=JSON.parse(readFileSync(resolve('package.json'),'utf8')).version
        if(!releaseNotes.some(n=>n.version===version))problems.push('Current version must have release notes')
        const evidence=JSON.parse(readFileSync(resolve('src/renderer/help/images/capture.json'),'utf8'))
        if(evidence.version!==version)problems.push('Help capture metadata must match the app version')
        if(problems.length)this.error(problems.join('\n'))
      }},
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml(html) {
          return html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace(
              "connect-src 'self'",
              "connect-src 'self' ws://127.0.0.1:5173",
            )
        },
      },
    ],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: {main:resolve('src/renderer/index.html'),help:resolve('src/renderer/help.html'),'release-notes':resolve('src/renderer/release-notes.html')} },
    },
  },
})
