import {DEFAULT_REMINDER} from '../../domain/reminder';
import { useRef, useState } from "react";
import type {
  Project,
  Schedule,
  ProjectInput,
  ScheduleInput,
  YearMonth,
} from "../../shared/types";
import { monthBounds } from "../../domain/date";
export type ProjectDraft = ProjectInput & { shared?: boolean; recipientIds?: string[] };
interface Base {
  session: number;
  id?: string;
  sharing?: "host" | "member";
  saved: boolean;
  caller: HTMLElement | null;
  returnFocus?: string;
}
export type Editor = Base &
  (
    | { kind: "project"; draft: ProjectDraft; original: ProjectDraft }
    | { kind: "schedule"; draft: ScheduleInput; original: ScheduleInput }
  );
export function useEditor() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const nextSession = useRef(0);
  const openProject = (
    project?: Project,
    caller: HTMLElement | null = document.activeElement as HTMLElement,
    recipientIds: string[] = [],
  ) => {
    const draft: ProjectDraft = project
      ? {
          shared: project.sharing === "host", recipientIds,
          name: project.name,
          color: project.color,
          participants: [...project.participants],
        }
      : { name: "", color: "#2563EB", participants: [] };
    setEditor({
      session: ++nextSession.current,
      kind: "project",
      id: project?.id,
      sharing: project?.sharing,
      saved: false,
      draft,
      original: structuredClone(draft),
      caller,
      returnFocus: caller?.dataset.returnFocus ?? caller?.dataset.focus,
    });
  };
  const openSchedule = (
    ym: YearMonth,
    projectId: string,
    schedule?: Schedule,
    caller: HTMLElement | null = document.activeElement as HTMLElement,
    date?: string,
  ) => {
    const draft: ScheduleInput = schedule
      ? {
          reminder: {...schedule.reminder},
          projectId: schedule.projectId,
          name: schedule.name,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        }
      : {
          reminder: {...DEFAULT_REMINDER},
          projectId,
          name: "",
          startDate: date ?? monthBounds(ym).start,
          endDate: date ?? monthBounds(ym).start,
        };
    setEditor({
      session: ++nextSession.current,
      kind: "schedule",
      id: schedule?.id,
      sharing: schedule?.sharing,
      saved: false,
      draft,
      original: structuredClone(draft),
      caller,
      returnFocus: caller?.dataset.returnFocus ?? caller?.dataset.focus,
    });
  };
  const patch = (update: Partial<ProjectDraft & ScheduleInput>) =>
    setEditor((e) =>
      e ? ({ ...e, draft: { ...e.draft, ...update } } as Editor) : null,
    );
  return {
    editor,
    openProject,
    openSchedule,
    patch,
    syncProject: (project:Project) => setEditor(e=>{
      if(!e||e.kind!=='project'||e.id!==project.id||e.sharing!=='member')return e;
      const draft:ProjectDraft={name:project.name,color:project.color,participants:[...project.participants]};
      return {...e,draft,original:structuredClone(draft)};
    }),
    syncSchedule: (schedule: Schedule) => setEditor(e => {
      if (!e || e.kind !== "schedule" || e.id !== schedule.id) return e;
      const dirty = JSON.stringify(e.draft) !== JSON.stringify(e.original);
      if (dirty && e.sharing !== 'member') return e;
      const draft = {reminder:{...schedule.reminder},projectId:schedule.projectId, name:schedule.name, startDate:schedule.startDate, endDate:schedule.endDate};
      return {...e, draft: dirty ? {...draft,reminder:e.draft.reminder} : draft, original:{...draft}};
    }),
    close: () => setEditor(null),
    markSaved: () => setEditor((e) => (e ? { ...e, saved: true } : null)),
    dirty:
      !!editor &&
      !editor.saved &&
      JSON.stringify(editor.draft) !== JSON.stringify(editor.original),
  };
}
