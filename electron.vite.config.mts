import {defineConfig} from 'electron-vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
export default defineConfig({
 main:{build:{outDir:'out/main',rollupOptions:{input:resolve('src/main/index.ts'),output:{entryFileNames:'index.cjs',format:'cjs'}}}},
 preload:{build:{externalizeDeps:false,outDir:'out/preload',rollupOptions:{input:resolve('src/preload/index.ts'),output:{entryFileNames:'index.cjs',format:'cjs',codeSplitting:false}}}},
 renderer:{root:resolve('src/renderer'),plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true},build:{outDir:resolve('out/renderer'),rollupOptions:{input:resolve('src/renderer/index.html')}}}
})
