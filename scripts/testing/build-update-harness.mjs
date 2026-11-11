import {build} from 'vite'
import {isAbsolute,resolve} from 'node:path'
await build({configFile:false,logLevel:'warn',build:{outDir:'artifacts/packaged-harness',emptyOutDir:true,lib:{entry:resolve('tests/e2e/packaged-update-harness.ts'),formats:['cjs'],fileName:()=> 'update.cjs'},rollupOptions:{external:id=>!id.startsWith('.')&&!isAbsolute(id)},minify:false}})
