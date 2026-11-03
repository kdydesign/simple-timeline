import { useState } from "react";
import type {
  Project,
  Schedule,
  ProjectInput,
  ScheduleInput,
  YearMonth,
} from "../../shared/types";
import { monthBounds } from "../../domain/date";
interface Base {
  id?: string;
  saved: boolean;
  caller: HTMLElement | null;
}
export type Editor = Base &
  (
    | { kind: "project"; draft: ProjectInput; original: ProjectInput }
    | { kind: "schedule"; draft: ScheduleInput; original: ScheduleInput }
  );
export function useEditor() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const openProject = (
    project?: Project,
    caller: HTMLElement | null = document.activeElement as HTMLElement,
  ) => {
    const draft: ProjectInput = project
      ? {
          name: project.name,
          color: project.color,
          participants: [...project.participants],
        }
      : { name: "", color: "#2563EB", participants: [] };
    setEditor({
      kind: "project",
      id: project?.id,
      saved: false,
      draft,
      original: structuredClone(draft),
      caller,
    });
  };
  const openSchedule = (
    ym: YearMonth,
    projectId: string,
    schedule?: Schedule,
    caller: HTMLElement | null = document.activeElement as HTMLElement,
  ) => {
    const draft: ScheduleInput = schedule
      ? {
          projectId: schedule.projectId,
          name: schedule.name,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        }
      : {
          projectId,
          name: "",
          startDate: monthBounds(ym).start,
          endDate: monthBounds(ym).start,
        };
    setEditor({
      kind: "schedule",
      id: schedule?.id,
      saved: false,
      draft,
      original: structuredClone(draft),
      caller,
    });
  };
  const patch = (update: Partial<ProjectInput & ScheduleInput>) =>
    setEditor((e) =>
      e ? ({ ...e, draft: { ...e.draft, ...update } } as Editor) : null,
    );
  return {
    editor,
    openProject,
    openSchedule,
    patch,
    close: () => setEditor(null),
    markSaved: () => setEditor((e) => (e ? { ...e, saved: true } : null)),
    dirty:
      !!editor &&
      !editor.saved &&
      JSON.stringify(editor.draft) !== JSON.stringify(editor.original),
  };
}
