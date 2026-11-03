import { useEffect, useRef, useState, useLayoutEffect } from "react";
import type { TimelineApi } from "../shared/api";
import type { ApiError, YearMonth, Result, Id } from "../shared/types";
import {
  normalizeName,
  normalizeColor,
  normalizeParticipants,
  validateId,
} from "../domain/normalize";
import { parseBusinessDate, inclusiveDays } from "../domain/date";
import { DomainValidationError } from "../domain/error";
import { useTimeline } from "./state/useTimeline";
import { useEditor } from "./state/useEditor";
import { Toolbar } from "./components/Toolbar";
import { ProjectList } from "./components/ProjectList";
import { GanttView, type GanttHandle } from "./components/GanttView";
import { EditorPanel } from "./components/EditorPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StatusNotice } from "./components/StatusNotice";
import "./styles.css";
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
  const [month, setMonth] = useState<YearMonth>(() => ({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    })),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [formError, setFormError] = useState<ApiError | null>(null),
    [notice, setNotice] = useState(""),
    [projectsOpen, setProjectsOpen] = useState(false),
    [narrow, setNarrow] = useState(window.innerWidth < 1100);
  const gantt = useRef<GanttHandle>(null);
  const focusTarget = useRef<string | null>(null),
    dialogCaller = useRef<HTMLElement | null>(null);
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
  }, [editor.dirty, saving]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (editor.dirty || saving) {
        event.preventDefault();
        event.returnValue = false;
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [editor.dirty, saving]);
  useEffect(() => {
    if (model?.saved && timeline.phase === "ready") editor.close();
  }, [model?.saved, timeline.phase]);
  useEffect(() => {
    if (!model && focusTarget.current) {
      const key = focusTarget.current;
      const found = document.querySelector<HTMLElement>(
        `[data-focus="${key}"]`,
      );
      if (!found && gantt.current?.focusItem(key)) {
        focusTarget.current = null;
        return;
      }
      const target =
        document.querySelector<HTMLElement>(
          `[data-focus="${focusTarget.current}"]`,
        ) ?? document.querySelector<HTMLElement>('[data-focus="project-add"]');
      focusTarget.current = null;
      if (target && !target.matches(":disabled")) target.focus();
      else document.querySelector<HTMLElement>("[data-focus=refresh]")?.focus();
    }
  }, [model]);
  const confirm = (value: Confirmation) => {
    dialogCaller.current = document.activeElement as HTMLElement;
    setConfirmation(value);
  };
  const cancelConfirm = () => {
    setConfirmation(null);
    requestAnimationFrame(() => dialogCaller.current?.focus());
  };
  const close = () => {
    focusTarget.current = model?.caller?.dataset.focus ?? "project-add";
    editor.close();
    setFormError(null);
  };
  const request = (action: () => void) => {
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
          action();
        },
      });
    else {
      setFormError(null);
      action();
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
      focusTarget.current = `${model.kind}:${result.data.id}`;
      setNotice("저장했습니다.");
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
  const statusView = (
    <StatusNotice
      phase={timeline.phase}
      error={formError ?? timeline.error}
      notice={notice}
      onRefresh={() => {
        setFormError(null);
        void timeline.refresh();
      }}
    />
  );
  return (
    <>
      <div
        className="app-shell"
        aria-hidden={!!confirmation || (narrow && !!model)}
        inert={!!confirmation || (narrow && !!model)}
      >
        <Toolbar
          month={month}
          onMonth={setMonth}
          onInvalid={() =>
            setFormError({
              code: "VALIDATION_ERROR",
              message:
                "연월은 0001-01부터 9999-12 사이의 YYYY-MM 형식이어야 합니다.",
            })
          }
          canEdit={canEdit}
          hasProjects={!!timeline.snapshot?.projects.length}
          projectsOpen={projectsOpen}
          onProjects={() => setProjectsOpen((v) => !v)}
          onProject={() => request(() => editor.openProject())}
          onSchedule={() =>
            request(() =>
              editor.openSchedule(month, timeline.snapshot!.projects[0].id),
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
              {projectsOpen && (
                <section
                  className="project-inventory"
                  aria-label="프로젝트 목록"
                >
                  <h2>프로젝트 목록</h2>
                  <button onClick={() => setProjectsOpen(false)}>
                    목록 닫기
                  </button>
                  <ProjectList
                    snapshot={{ ...timeline.snapshot, schedules: [] }}
                    disabled={!canEdit}
                    onProject={(p) => request(() => editor.openProject(p))}
                    onSchedule={() => {}}
                    onAdd={(p) =>
                      request(() => editor.openSchedule(month, p.id))
                    }
                  />
                </section>
              )}
              <GanttView
                ref={gantt}
                snapshot={timeline.snapshot}
                selectedMonth={month}
                disabled={!canEdit}
                onEditProject={(p) => request(() => editor.openProject(p))}
                onEditSchedule={(s) =>
                  request(() => editor.openSchedule(month, s.projectId, s))
                }
                onAddSchedule={(p) =>
                  request(() => editor.openSchedule(month, p.id))
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
            covered={!!confirmation}
            error={formError ?? timeline.error}
            status={narrow ? statusView : null}
          />
        )}
      </div>
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
    </>
  );
}
