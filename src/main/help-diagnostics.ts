import type {BrowserWindow} from 'electron'
import {helpNavigationFields,type createHelpPerformance} from './help-performance'
// Fixed trusted probe; no URLs or arbitrary renderer properties cross this boundary.
export const helpTimingProbe = `(() => {
 const nav=performance.getEntriesByType('navigation')[0];
 return {timeOrigin:performance.timeOrigin,navigation:Object.fromEntries(${JSON.stringify(helpNavigationFields)}.filter(key=>typeof nav?.[key]==='number').map(key=>[key,nav[key]])),
 paints:Object.fromEntries(performance.getEntriesByType('paint').filter(e=>['first-paint','first-contentful-paint'].includes(e.name)).map(e=>[e.name,e.startTime])),
 moduleReady:performance.getEntriesByName('help-module-ready','mark')[0]?.startTime??null};
})()`
// Dedicated help partition: these listeners never replace main-window observers.
export function observeHelpRequests(window: BrowserWindow, recorder: ReturnType<typeof createHelpPerformance>) {
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
