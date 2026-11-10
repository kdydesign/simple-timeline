import type { Project, Schedule, TimelineSnapshot } from "../shared/types";
import { inclusiveDays } from "../domain/date";
import {parseSharedId} from '../domain/sharing';
import { compareIds } from "../domain/sort";
const displayId=(id:string)=>id.startsWith('shared:')?parseSharedId(id).remoteId:id;
export const compareSchedules = (a: Schedule, b: Schedule) =>
  a.startDate.localeCompare(b.startDate) ||
  a.endDate.localeCompare(b.endDate) ||
  compareIds(a.projectId, b.projectId) ||
  compareIds(a.id, b.id);
export function indexSnapshot(snapshot: TimelineSnapshot) {
  const projects = [...snapshot.projects].sort((a, b) =>
      compareIds(a.id, b.id),
    ),
    byProject = new Map<string, Schedule[]>(),
    projectCounts = new Map<string, number>(),
    scheduleCounts = new Map<string, number>();
  for (const p of projects)
    projectCounts.set(p.name, (projectCounts.get(p.name) ?? 0) + 1);
  for (const s of snapshot.schedules) {
    const rows = byProject.get(s.projectId) ?? [];
    rows.push(s);
    byProject.set(s.projectId, rows);
    const key = s.projectId + ":" + s.name;
    scheduleCounts.set(key, (scheduleCounts.get(key) ?? 0) + 1);
  }
  for (const rows of byProject.values()) rows.sort(compareSchedules);
  return {
    projects,
    byProject,
    projectLabel: (p: Project) =>
      p.name + (projectCounts.get(p.name)! > 1 ? ` · #${displayId(p.id)}${p.sharing?' · 공유':''}` : ""),
    scheduleLabel: (s: Schedule) =>
      s.name +
      (scheduleCounts.get(s.projectId + ":" + s.name)! > 1
        ? ` · #${displayId(s.id)}${s.sharing?' · 공유':''}`
        : ""),
  };
}
export const scheduleDescription = (s: Schedule, p: Project) =>
  `${p.name} · ${s.name} · #${displayId(s.id)}${s.sharing?' · 공유':''} · ${s.startDate} — ${s.endDate} · ${inclusiveDays(s.startDate, s.endDate)}일`;
export function colorText(color: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#FFFFFF";
}
