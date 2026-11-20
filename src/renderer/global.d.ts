import type { TimelineApi } from '../shared/api'
declare global {
  interface Window {
    postRail?: import('../shared/postrail-api').PostRailApi
    workrailTermWindow?: import('../shared/term-window').TermWindowApi
    termRailSsh: import('../shared/termrail-ssh').TermRailSshApi
    workrailNodeManagement?: import('../shared/node-management').NodeManagementApi
    planrailReleaseNotes?: import('../shared/release-notes').ReleaseApi
    planrailHelp?: import('../shared/help').HelpApi
    timelineUpdates?: import('../shared/updates').UpdateApi
    timelineSharing?: import('../shared/sharing').SharingApi
    simpleTimeline: TimelineApi
    timelineReminders?: import('../shared/reminder-api').ReminderApi
    timelineWindow?: import('../shared/window-api').WindowApi
  }
}
