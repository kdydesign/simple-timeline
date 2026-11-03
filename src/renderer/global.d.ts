import type { TimelineApi } from '../shared/api'
declare global {
  interface Window {
    simpleTimeline: TimelineApi
  }
}
