import { writeFile, rename } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
export interface RendererStartupTiming {
  clock: 'milliseconds-since-navigation-start'
  timeOrigin: number
  navigation: Record<string, number>
  resources: { kind: string; startTime: number; responseStart: number; responseEnd: number; duration: number; decodedBodySize: number }[]
  paints: Record<string, number>
  moduleReady: number | null
  uiReady: boolean
}
// No schedule content, resource names, paths or arbitrary error text are recorded.
export function startupRecorder(profile: string, appVersion: string) {
  const stages: Record<string, number> = {}
  const failures: Record<string, number> = {}
  const requests = new Map<number, { kind: string; startedMs: number; completedMs?: number; failed?: boolean }>()
  let renderer: RendererStartupTiming | undefined
  let writes = Promise.resolve()
  const save = () => {
    const report = JSON.stringify({
      schemaVersion: 2, platform: process.platform, electronVersion: process.versions.electron, appVersion,
      recordedAt: new Date().toISOString(), clock: 'milliseconds-since-node-start',
      stages: { ...stages }, failures: { ...failures }, requests: [...requests.values()], renderer,
    }, null, 2)
    // Serialize snapshots so a slower early write cannot replace later evidence.
    writes = writes.then(async () => {
      const file = join(profile, 'startup-latest.json')
      await writeFile(file + '.partial', report)
      await rename(file + '.partial', file)
    }).catch(() => {})
  }
  return {
    mark(name: string, errorCode?: number) {
      if (name in stages) return
      stages[name] = Math.round(process.uptime() * 1000)
      if (errorCode !== undefined) failures[name] = errorCode
      save()
    },
    requestStarted(id: number, kind: string) {
      if (requests.size >= 20) return
      requests.set(id, { kind, startedMs: Math.round(process.uptime() * 1000) })
      save()
    },
    requestFinished(id: number, failed: boolean) {
      const request = requests.get(id)
      if (!request) return
      request.completedMs = Math.round(process.uptime() * 1000)
      request.failed = failed
      save()
    },
    renderer(timing: RendererStartupTiming) {
      renderer = timing
      save()
    },
  }
}

// Fixed trusted code: report numeric timing data only, never PerformanceEntry URLs.
// Timers bound observation; they do not gate window display, IPC or rendering.
export const rendererStartupProbe = `new Promise(resolve => {
  const deadline = performance.now() + 60000;
  let readyAt;
  const check = () => {
    const uiReady = document.documentElement.dataset.timelinePhase === 'ready';
    if (uiReady && readyAt === undefined) readyAt = performance.now();
    const paint = performance.getEntriesByType('paint');
    if ((uiReady && (paint.some(e => e.name === 'first-contentful-paint') || performance.now() - readyAt >= 1000)) || performance.now() >= deadline) {
      const nav = performance.getEntriesByType('navigation')[0];
      const fields = ['startTime', 'fetchStart', 'domainLookupStart', 'domainLookupEnd', 'connectStart', 'connectEnd', 'requestStart', 'responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventStart', 'domContentLoadedEventEnd', 'loadEventStart', 'loadEventEnd'];
      resolve({
        clock: 'milliseconds-since-navigation-start', timeOrigin: performance.timeOrigin, uiReady,
        navigation: Object.fromEntries(fields.map(key => [key, nav?.[key] ?? 0])),
        resources: performance.getEntriesByType('resource').slice(0, 20).map(e => ({
          kind: e.initiatorType === 'script' ? 'script' : e.initiatorType === 'link' ? 'style' : 'other',
          startTime: e.startTime, responseStart: e.responseStart, responseEnd: e.responseEnd,
          duration: e.duration, decodedBodySize: e.decodedBodySize
        })),
        paints: Object.fromEntries(paint.filter(e => ['first-paint', 'first-contentful-paint'].includes(e.name)).map(e => [e.name, e.startTime])),
        moduleReady: performance.getEntriesByName('timeline-module-ready', 'mark')[0]?.startTime ?? null
      });
    } else setTimeout(check, 20);
  }; check();
})`

// Resource Timing omits file:// resources in the target Electron version.
// This app owns these session listeners only during startup; no URL is retained.
export function observeStartupRequests(window: BrowserWindow, recorder: ReturnType<typeof startupRecorder>) {
  const requests = window.webContents.session.webRequest
  const id = window.webContents.id
  requests.onBeforeRequest((details, callback) => {
    callback({})
    if (details.webContentsId !== id) return
    const kind = details.resourceType === 'mainFrame' ? 'document'
      : details.resourceType === 'script' ? 'script'
      : details.resourceType === 'stylesheet' ? 'style' : 'other'
    recorder.requestStarted(details.id, kind)
  })
  requests.onCompleted(details => {
    if (details.webContentsId === id) recorder.requestFinished(details.id, false)
  })
  requests.onErrorOccurred(details => {
    if (details.webContentsId === id) recorder.requestFinished(details.id, true)
  })
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    requests.onBeforeRequest(null)
    requests.onCompleted(null)
    requests.onErrorOccurred(null)
    window.removeListener('closed', stop)
  }
  const timer = setTimeout(stop, 60000)
  timer.unref()
  window.once('closed', stop)
  return stop
}
