import type { TimelineApi } from '../shared/api'
declare global {
  interface Window {
    timelineUpdates?: import('../shared/updates').UpdateApi
    timelineSharing?: import('../shared/sharing').SharingApi
    simpleTimeline: TimelineApi
    timelineReminders?: import('../shared/reminder-api').ReminderApi
    timelineWindow?: import('../shared/window-api').WindowApi
  }
}
