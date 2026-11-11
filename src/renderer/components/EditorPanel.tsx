import {Switch} from './ui/switch';
import {ReminderFields} from './ReminderFields';
import {Button} from './ui/button';
import {Input} from './ui/input';
import { useEffect, useRef, type ReactNode } from "react";
import type { Editor, ProjectDraft } from "../state/useEditor";
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
  sharing,
  unavailable=false,
}: {
  editor: Editor;
  projects: Project[];
  patch: (p: Partial<ProjectDraft & ScheduleInput>) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  disabled: boolean;
  busy: boolean;
  narrow: boolean;
  covered: boolean;
  error: ApiError | null;
  status?: ReactNode;
  unavailable?:boolean;
  sharing?: import("../../shared/sharing").SharingState|null;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLInputElement>("#editor-name")?.focus();
  }, [editor.kind, editor.id]);
  useEffect(() => {
    if (narrow && !covered && !panel.current?.contains(document.activeElement))
      panel.current?.querySelector<HTMLInputElement>("#editor-name")?.focus();
  }, [narrow, covered]);
  const member = editor.sharing === "member";
  const host = sharing?.role === "host";
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
      {unavailable&&<p role="alert">더 이상 공유되지 않거나 삭제된 항목입니다. 알림을 저장할 수 없습니다.</p>}
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
            readOnly={member}
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
                  disabled={member}
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
                  readOnly={member}
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
                    readOnly={!host || member}
                    id={`participant-${i}`}
                    value={name}
                    onChange={(e) => {
                      const names = [...editor.draft.participants];
                      names[i] = e.target.value;
                      patch({ participants: names });
                    }}
                  />
                  {host&&!member&&<Button
                    type="button"
                    aria-label={`참여자 ${i + 1} 삭제`}
                    onClick={() =>
                      patch({
                        participants: editor.draft.participants.filter(
                          (_, j) => i !== j,
                        ),
                        recipientIds:editor.draft.recipientIds?.filter((_,j)=>i!==j),
                      })
                    }
                  >
                    ×
                  </Button>}
                </div>
              ))}
              {host&&!member&&<Button
                type="button"
                onClick={() =>
                  patch({ participants: [...editor.draft.participants, ""] })
                }
              >
                참여자 이름 추가
              </Button>}
              <p className="help">{host?'참여자 입력 순서를 유지합니다.':'참여자는 호스트만 수정할 수 있습니다.'}</p>
              {host&&<><label className="sharing-switch" htmlFor="project-shared"><Switch id="project-shared" checked={!!editor.draft.shared} disabled={editor.sharing==='host'} onCheckedChange={shared=>patch({shared})}/>{editor.sharing==='host'?'공유 프로젝트':'공유 프로젝트로 저장'}</label>
              {editor.draft.shared&&editor.draft.participants.map((name,i)=><div key={i}><label htmlFor={`recipient-${i}`}>{name||`참여자 ${i+1}`} PC</label><Select id={`recipient-${i}`} label={`${name||`참여자 ${i+1}`} PC`} value={editor.draft.recipientIds?.[i]??''} onChange={id=>{const ids=[...(editor.draft.recipientIds??[])];ids[i]=id;patch({recipientIds:ids})}} options={(sharing?.devices??[]).filter(d=>!d.revoked).map(d=>({value:d.id,label:`${d.name} · ${d.ip}`}))}/></div>)}</>}
              {member&&<p className="help">공유 프로젝트 · 조회 전용</p>}
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
                  options={projects.filter(p=>p.sharing!=="member").map(p=>({value:p.id,label:`${p.name} · #${p.id}`,color:p.color}))}/>

              )}
              <fieldset disabled={member} className="schedule-dates">
              <div className="schedule-date-field">
              <label htmlFor="editor-startDate">시작일</label>
              <DatePicker id="editor-startDate" label="시작일" value={editor.draft.startDate}
                invalid={error?.field === "startDate"} onChange={value => patch({ startDate: value })} />
              </div>
              <div className="schedule-date-field">
              <label htmlFor="editor-endDate">종료일</label>
              <DatePicker id="editor-endDate" label="종료일" value={editor.draft.endDate}
                invalid={error?.field === "endDate"} onChange={value => patch({ endDate: value })} />
              </div>
              <p className="help">
                YYYY-MM-DD · 시작일과 종료일을 모두 포함합니다.
              </p>
              </fieldset>
              {member&&<p className="help">공유 일정 · 조회 전용. 알림은 이 PC에서만 적용합니다.</p>}
              <ReminderFields value={editor.draft.reminder} onChange={reminder=>patch({reminder})} error={error}/>
              <p className="period">{period}</p>
            </>
          )}
        </fieldset>
        <div className="editor-actions">
          {editor.id && !member && (
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
          <Button className="primary" disabled={disabled||(member&&editor.kind==="project")} type="submit">
            저장
          </Button>
        </div>
      </form>
    </aside>
  );
}
