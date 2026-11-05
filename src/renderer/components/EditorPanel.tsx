import {Button} from './ui/button';
import {Input} from './ui/input';
import { useEffect, useRef, type ReactNode } from "react";
import type { Editor } from "../state/useEditor";
import type {
  ApiError,
  Project,
  ProjectInput,
  ScheduleInput,
} from "../../shared/types";
import { inclusiveDays } from "../../domain/date";
import {Select} from "./Select";
import {IconButton} from "./Icon";
import { DatePicker } from "./DatePicker";
import { trapTab } from "./ConfirmDialog";
export function EditorPanel({
  editor,
  projects,
  patch,
  onSave,
  onDelete,
  onClose,
  disabled,
  busy,
  narrow,
  covered,
  error,
  status,
}: {
  editor: Editor;
  projects: Project[];
  patch: (p: Partial<ProjectInput & ScheduleInput>) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  disabled: boolean;
  busy: boolean;
  narrow: boolean;
  covered: boolean;
  error: ApiError | null;
  status?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLInputElement>("#editor-name")?.focus();
  }, [editor.kind, editor.id]);
  useEffect(() => {
    if (narrow && !covered && !panel.current?.contains(document.activeElement))
      panel.current?.querySelector<HTMLInputElement>("#editor-name")?.focus();
  }, [narrow, covered]);
  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "form-error" }
      : {};
  let period = "";
  if (editor.kind === "schedule") {
    try {
      period = `기간 ${inclusiveDays(editor.draft.startDate, editor.draft.endDate)}일`;
    } catch {}
  }
  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal={narrow || undefined}
      aria-labelledby="editor-title"
      aria-hidden={covered}
      inert={covered}
      className={`editor ${narrow ? "overlay" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        } else if (narrow) trapTab(e, e.currentTarget);
      }}
    >
      <div className="editor-title">
        <h2 id="editor-title">
          {editor.kind === "project" ? "프로젝트" : "일정"}{" "}
          {editor.id ? "편집" : "추가"}
        </h2>
        <IconButton icon="close" label="편집 닫기" disabled={busy} onClick={onClose}/>
      </div>
      {status}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={disabled}>
          <label htmlFor="editor-name">
            {editor.kind === "project" ? "프로젝트 이름" : "일정 이름"}
          </label>
          <Input
            id="editor-name"
            value={editor.draft.name}
            {...invalid("name")}
            onChange={(e) => patch({ name: e.target.value })}
          />
          {editor.kind === "project" ? (
            <>
              <label htmlFor="editor-color">표시 색상</label>
              <div className="color-input">
                <Input
                  id="editor-color"
                  type="color"
                  aria-label="색상 선택"
                  value={
                    /^#[a-fA-F0-9]{6}$/.test(editor.draft.color)
                      ? editor.draft.color
                      : "#2563EB"
                  }
                  onChange={(e) =>
                    patch({ color: e.target.value.toUpperCase() })
                  }
                />
                <Input
                  id="editor-color-code"
                  aria-label="색상 코드"
                  value={editor.draft.color}
                  {...invalid("color")}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </div>
              <label>
                참여자 <small>(선택)</small>
              </label>
              {editor.draft.participants.map((name, i) => (
                <div className="participant" key={i}>
                  <label className="sr-only" htmlFor={`participant-${i}`}>
                    참여자 {i + 1}
                  </label>
                  <Input
                    id={`participant-${i}`}
                    value={name}
                    onChange={(e) => {
                      const names = [...editor.draft.participants];
                      names[i] = e.target.value;
                      patch({ participants: names });
                    }}
                  />
                  <Button
                    type="button"
                    aria-label={`참여자 ${i + 1} 삭제`}
                    onClick={() =>
                      patch({
                        participants: editor.draft.participants.filter(
                          (_, j) => i !== j,
                        ),
                      })
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                onClick={() =>
                  patch({ participants: [...editor.draft.participants, ""] })
                }
              >
                참여자 이름 추가
              </Button>
              <p className="help">
                입력 순서를 유지하고 같은 이름은 저장할 때 한 번만 남깁니다.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="editor-project">소속 프로젝트</label>
              {editor.id ? (
                <p aria-label="소속 프로젝트">
                  {projects.find((p) => p.id === editor.draft.projectId)?.name}
                </p>
              ) : (
                <Select id="editor-project" label="소속 프로젝트" value={editor.draft.projectId}
                  onChange={projectId=>patch({projectId})} disabled={disabled}
                  options={projects.map(p=>({value:p.id,label:`${p.name} · #${p.id}`,color:p.color}))}/>

              )}
              <label htmlFor="editor-startDate">시작일</label>
              <DatePicker id="editor-startDate" label="시작일" value={editor.draft.startDate}
                invalid={error?.field === "startDate"} onChange={value => patch({ startDate: value })} />
              <label htmlFor="editor-endDate">종료일</label>
              <DatePicker id="editor-endDate" label="종료일" value={editor.draft.endDate}
                invalid={error?.field === "endDate"} onChange={value => patch({ endDate: value })} />
              <p className="help">
                YYYY-MM-DD · 시작일과 종료일을 모두 포함합니다.
              </p>
              <p className="period">{period}</p>
            </>
          )}
        </fieldset>
        <div className="editor-actions">
          {editor.id && (
            <Button
              type="button"
              className="danger"
              disabled={disabled}
              onClick={onDelete}
            >
              삭제
            </Button>
          )}
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button className="primary" disabled={disabled} type="submit">
            저장
          </Button>
        </div>
      </form>
    </aside>
  );
}
