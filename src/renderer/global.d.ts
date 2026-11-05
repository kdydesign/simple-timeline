import type { TimelineApi } from '../shared/api'
declare global {
  interface Window {
    simpleTimeline: TimelineApi
    timelineReminders?: import('../shared/reminder-api').ReminderApi
    timelineWindow?: import('../shared/window-api').WindowApi
  }
}
