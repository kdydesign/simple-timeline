import { useEffect, useRef, useState, useLayoutEffect } from "react";
import type { TimelineApi } from "../shared/api";
import type { ApiError, YearMonth, Result, Id, Schedule } from "../shared/types";
import {
  normalizeName,
  normalizeColor,
  normalizeParticipants,
  validateId,
} from "../domain/normalize";
import { parseBusinessDate, inclusiveDays, monthBounds } from "../domain/date";
import { DomainValidationError } from "../domain/error";
import { useTimeline } from "./state/useTimeline";
import { dateInMonth, localDate, monthOf } from "./state/dateNavigation";
import { usePreferences } from "./state/usePreferences";
import { useEditor } from "./state/useEditor";
import {Titlebar} from "./components/Titlebar";
import {TooltipProvider} from "./components/ui/tooltip";
import { Toolbar } from "./components/Toolbar";
import { ProjectList } from "./components/ProjectList";
import { GanttView, type GanttHandle } from "./components/GanttView";
import { CalendarView } from "./components/CalendarView";
import { EditorPanel } from "./components/EditorPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StatusNotice } from "./components/StatusNotice";
import "./shadcn.css";
import "./styles.css";
import "./flat-glass.css";
import "./planrail.css";
interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  run: () => void;
}
export function App({
  api = window.simpleTimeline,
  today = new Date(),
}: {
  api?: TimelineApi;
  today?: Date;
}) {
  const timeline = useTimeline(api),
    editor = useEditor();
  const [selectedDate, setSelectedDate] = useState(() => localDate(today)),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [formError, setFormError] = useState<ApiError | null>(null),
    [notice, setNotice] = useState(""),
    [projectsOpen, setProjectsOpen] = useState(false),
    [mode, setMode] = useState<"gantt" | "calendar">("gantt"),
    [dayModalOpen, setDayModalOpen] = useState(false),
    [narrow, setNarrow] = useState(window.innerWidth < 1100);
  const [month,setMonth] = useState(() => monthOf(localDate(today)));
  const preferences = usePreferences();
  const recentProject = useRef<string | null>(null);
  const [todayRequest, setTodayRequest] = useState<{date:string;token:number}>(() => ({date:localDate(today),token:0}));
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (editor.editor?.kind === "schedule") recentProject.current = editor.editor.draft.projectId;
    else if (editor.editor?.id) recentProject.current = editor.editor.id;
  }, [editor.editor]);
  const gantt = useRef<GanttHandle>(null);
  const focusTarget = useRef<string | null>(null),
    dialogCaller = useRef<HTMLElement | null>(null);
  const completionView = useRef({ mode, month });
  useLayoutEffect(() => {
    completionView.current = { mode, month };
  }, [mode, month]);
  useEffect(()=>{if(confirmation||dayModalOpen)setProjectsOpen(false)},[confirmation,dayModalOpen]);
  const model = editor.editor,
    canEdit = timeline.phase === "ready",
    saving = timeline.phase === "saving";
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.editorDirty = String(editor.dirty);
    document.documentElement.dataset.saving = String(saving);
    document.documentElement.dataset.timelinePhase = timeline.phase;
  }, [editor.dirty, saving, timeline.phase]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (editor.dirty || saving) {
        event.preventDefault();
        event.returnValue = false;
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [editor.dirty, saving, timeline.phase]);
  useEffect(() => {
    if (model?.saved && timeline.phase === "ready") editor.close();
  }, [model?.saved, timeline.phase]);
  useEffect(() => {
    if (!model && focusTarget.current) {
      const key = focusTarget.current;
      const found = [
        ...document.querySelectorAll<HTMLElement>(`[data-focus="${key}"]`),
      ].find((el) => !el.closest("[hidden],[inert]"));
      if (!found && mode === "gantt" && gantt.current?.focusItem(key)) {
        focusTarget.current = null;
        return;
      }
      const target =
        found ??
        document.querySelector<HTMLElement>(
          key.startsWith("schedule:") || key.startsWith("more:")
            ? '[data-focus="schedule-add"]'
            : '[data-focus="project-add"]',
        );
      focusTarget.current = null;
      if (target && !target.matches(":disabled")) target.focus();
      else document.querySelector<HTMLElement>("[data-focus=refresh]")?.focus();
    }
  }, [model]);
  useEffect(() => {
    if (timeline.phase !== "ready" || model?.kind !== "schedule" || !model.id || editor.dirty) return;
    const current = timeline.snapshot?.schedules.find(s => s.id === model.id);
    if (current) editor.syncSchedule(current);
  }, [timeline.phase, timeline.snapshot, model?.id, model?.kind, editor.dirty]);
  const confirm = (value: Confirmation) => {
    dialogCaller.current = document.activeElement as HTMLElement;
    setConfirmation(value);
  };
  const cancelConfirm = () => {
    setConfirmation(null);
    requestAnimationFrame(() => {
      if (dialogCaller.current?.isConnected) dialogCaller.current.focus();
      else document.getElementById("editor-name")?.focus();
    });
  };
  const close = () => {
    focusTarget.current =
      model?.caller?.dataset.returnFocus ??
      model?.caller?.dataset.focus ??
      "project-add";
    editor.close();
    setFormError(null);
  };
  const request = (action: (caller: HTMLElement | null) => void) => {
    const caller = document.activeElement as HTMLElement | null;
    if (saving) return;
    if (editor.dirty)
      confirm({
        title: "변경 내용을 버릴까요?",
        message: "저장하지 않은 입력이 사라집니다.",
        confirmLabel: "변경 버리기",
        cancelLabel: "계속 편집",
        run: () => {
          setConfirmation(null);
          setFormError(null);
          action(caller);
        },
      });
    else {
      setFormError(null);
      action(caller);
    }
  };
  const showValidation = (e: unknown) => {
    const error =
      e instanceof DomainValidationError
        ? {
            code: "VALIDATION_ERROR" as const,
            message: e.message,
            field: e.field,
          }
        : {
            code: "INTERNAL_ERROR" as const,
            message: "입력값을 확인해 주세요.",
          };
    setFormError(error);
    document.getElementById(`editor-${error.field}`)?.focus();
  };
  async function save() {
    if (!model || !canEdit || model.saved) return;
    setNotice("");
    setFormError(null);
    let result: Result<{ id: Id }>;
    try {
      if (model.kind === "project") {
        const v = {
          name: normalizeName(model.draft.name),
          color: normalizeColor(model.draft.color),
          participants: normalizeParticipants(model.draft.participants),
        };
        result = model.id
          ? await timeline.mutate("updateProject", { ...v, id: model.id })
          : await timeline.mutate("createProject", v);
      } else {
        const v = {
          name: normalizeName(model.draft.name),
          startDate: parseBusinessDate(model.draft.startDate, "startDate"),
          endDate: parseBusinessDate(model.draft.endDate, "endDate"),
        };
        inclusiveDays(v.startDate, v.endDate);
        result = model.id
          ? await timeline.mutate("updateSchedule", { ...v, id: model.id })
          : await timeline.mutate("createSchedule", {
              ...v,
              projectId: validateId(model.draft.projectId, "projectId"),
            });
      }
    } catch (e) {
      showValidation(e);
      return;
    }
    if (result.ok) {
      focusTarget.current =
        model.caller?.dataset.returnFocus ?? `${model.kind}:${result.data.id}`;
      const bounds = monthBounds(completionView.current.month),
        outside =
          completionView.current.mode === "calendar" &&
          model.kind === "schedule" &&
          (model.draft.endDate < bounds.start ||
            model.draft.startDate > bounds.end);
      setNotice(outside ? "저장됨 · 현재 월 표시 대상 아님" : `${model.kind === "project" ? "프로젝트를" : "일정을"} ${model.id ? "수정" : "추가"}했습니다.`);
      if (outside) focusTarget.current = "schedule-add";
      if (
        model.kind === "project" &&
        completionView.current.mode === "calendar"
      )
        setProjectsOpen(true);
      editor.markSaved();
    } else if (result.error.field)
      document.getElementById(`editor-${result.error.field}`)?.focus();
  }
  function remove() {
    if (!model?.id || !canEdit) return;
    const id = model.id,
      kind = model.kind,
      snapshot = timeline.snapshot!;
    const candidates =
      kind === "project"
        ? snapshot.projects
        : snapshot.schedules.filter(
            (s) =>
              s.projectId ===
              (model.kind === "schedule" ? model.draft.projectId : ""),
          );
    const i = candidates.findIndex((v) => v.id === id),
      next = candidates[i + 1] ?? candidates[i - 1];
    const count = snapshot.schedules.filter((s) => s.projectId === id).length;
    confirm({
      title: "삭제할까요?",
      message:
        kind === "project"
          ? `${model.draft.name} 프로젝트와 하위 일정 ${count}개를 함께 삭제합니다. 되돌릴 수 없습니다.`
          : `${model.draft.name} 일정을 삭제합니다. ${model.kind === "schedule" ? model.draft.startDate + " — " + model.draft.endDate : ""}`,
      confirmLabel: kind === "project" ? "함께 삭제" : "일정 삭제",
      run: () => {
        setConfirmation(null);
        setNotice("");
        void (async () => {
          const result =
            kind === "project"
              ? await timeline.mutate("deleteProject", { id, confirmed: true })
              : await timeline.mutate("deleteSchedule", { id });
          if (result.ok) {
            focusTarget.current = next ? `${kind}:${next.id}` : "project-add";
            setNotice("삭제했습니다.");
            editor.markSaved();
          }
        })();
      },
    });
  }
  const dragActions = {
    onDragStart: () => {
      if (!canEdit || confirmation) return false;
      if (editor.dirty) {
        setFormError({code:"VALIDATION_ERROR",message:"먼저 저장하거나 변경을 버려주세요."});
        return false;
      }
      setNotice(""); return true;
    },
    onDragCommit: (schedule: Schedule, dates: {startDate:string;endDate:string}) => {
      void (async () => {
        const result=await timeline.mutate("updateSchedule",{id:schedule.id,name:schedule.name,...dates});
        if(result.ok) { editor.syncSchedule(result.data); setNotice("일정을 변경했습니다."); }
      })();
    },
  };
  const addDate = (date: string, projectId?: string) => {
    if (!canEdit) return;
    const projects = timeline.snapshot?.projects ?? [];
    const project = projects.find(p => p.id === (projectId ?? recentProject.current)) ?? projects[0];
    if (!project) { setSelectedDate(date); setMonth(monthOf(date)); setFormError({code:"VALIDATION_ERROR", message:"먼저 프로젝트를 추가해 주세요."}); return; }
    request(caller => {setSelectedDate(date); setMonth(monthOf(date)); editor.openSchedule(monthOf(date), project.id, undefined, caller, date)});
  };
  const navigateDate = (date:string) => {
    setSelectedDate(date);
    setMonth(monthOf(date));
    setTodayRequest(v => ({date,token:v.token+1}));
  };
  const navigateMonth = (next:YearMonth, drag = false) => {
    if (drag) setMonth(next);
    else navigateDate(dateInMonth(selectedDate,next));
  };
  const statusView = (
    <StatusNotice
      phase={timeline.phase}
      error={formError ?? timeline.error}
      notice=""
      onRefresh={() => {
        setFormError(null);
        void timeline.refresh();
      }}
    />
  );
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={0} disableHoverableContent>
      <Titlebar/>
      <div
        className="app-shell"
        aria-hidden={!!confirmation || dayModalOpen || (narrow && !!model)}
        inert={!!confirmation || dayModalOpen || (narrow && !!model)}
      >
        <Toolbar
          selectedDate={selectedDate}
          mode={mode}
          onMode={setMode}
          theme={preferences.theme} onTheme={preferences.toggleTheme}
          onToday={() => navigateDate(localDate(new Date()))}
          onDate={navigateDate}
          onInvalid={() =>
            setFormError({
              code: "VALIDATION_ERROR",
              message:
                "날짜는 0001-01-01부터 9999-12-31 사이의 올바른 YYYY-MM-DD 형식이어야 합니다.",
            })
          }
          canEdit={canEdit}
          hasProjects={!!timeline.snapshot?.projects.length}
          projectList={timeline.snapshot&&<ProjectList snapshot={timeline.snapshot} disabled={!canEdit}
            onProject={p=>{setProjectsOpen(false);request(caller=>editor.openProject(p,caller))}}
            onAdd={p=>{setProjectsOpen(false);request(caller=>editor.openSchedule(month,p.id,undefined,caller))}}/>}
          projectsOpen={projectsOpen}
          onProjects={setProjectsOpen}
          onProject={() =>
            request((caller) => editor.openProject(undefined, caller))
          }
          onSchedule={() =>
            request((caller) =>
              editor.openSchedule(
                month,
                (timeline.snapshot!.projects.find(p => p.id === recentProject.current) ?? timeline.snapshot!.projects[0]).id,
                undefined,
                caller,
              ),
            )
          }
        />
      </div>
      {!(narrow && model) && statusView}
      <div className="workspace">
        <main
          aria-hidden={!!confirmation || (narrow && !!model)}
          inert={!!confirmation || (narrow && !!model)}
          aria-label="프로젝트와 일정"
        >
          {timeline.snapshot ? (
            <>
              <GanttView
                {...dragActions}
                ref={gantt}
                collapsed={preferences.collapsed} onToggleProject={preferences.toggleProject}
                todayRequest={todayRequest} onAddDate={addDate}
                dayWidth={preferences.dayWidth} onDayWidth={preferences.setDayWidth}
                active={mode === "gantt"}
                snapshot={timeline.snapshot}
                selectedMonth={month}
                selectedDate={selectedDate}
                disabled={!canEdit}
                onEditProject={(p) =>
                  request((caller) => editor.openProject(p, caller))
                }
                onEditSchedule={(s) =>
                  request((caller) =>
                    editor.openSchedule(month, s.projectId, s, caller),
                  )
                }
                onAddSchedule={(p) =>
                  request((caller) =>
                    editor.openSchedule(month, p.id, undefined, caller),
                  )
                }
              />
              <CalendarView
                {...dragActions} onMonth={navigateMonth}
                onAddDate={addDate}
                snapshot={timeline.snapshot}
                selectedMonth={month}
                selectedDate={selectedDate}
                active={mode === "calendar"}
                disabled={!canEdit}
                onModalChange={setDayModalOpen}
                onEditProject={(p) =>
                  request((caller) => editor.openProject(p, caller))
                }
                onEditSchedule={(s) =>
                  request((caller) =>
                    editor.openSchedule(month, s.projectId, s, caller),
                  )
                }
                onAddSchedule={(p) =>
                  request((caller) =>
                    editor.openSchedule(month, p.id, undefined, caller),
                  )
                }
              />
            </>
          ) : (
            <p>
              {timeline.phase === "loading"
                ? "저장된 일정을 불러오고 있습니다."
                : "일정을 읽지 못했습니다."}
            </p>
          )}
        </main>
        {model && (
          <EditorPanel
            editor={model}
            projects={timeline.snapshot?.projects ?? []}
            patch={editor.patch}
            onSave={() => void save()}
            onDelete={remove}
            onClose={() => request(close)}
            disabled={!canEdit || model.saved}
            busy={saving}
            narrow={narrow}
            covered={!!confirmation || dayModalOpen}
            error={formError ?? timeline.error}
            status={narrow ? statusView : null}
          />
        )}
      </div>
      <div className="toast" role="status" aria-live="polite">{timeline.phase === "ready" && !timeline.error && !formError ? notice : ""}</div>
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          cancelLabel={confirmation.cancelLabel}
          onConfirm={confirmation.run}
          onCancel={cancelConfirm}
        />
      )}
    </TooltipProvider>
  );
}
