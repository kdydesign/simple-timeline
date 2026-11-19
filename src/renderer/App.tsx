import {localHolidaySources} from './state/holidaySources'
import {effectiveHolidayCalendar} from '../domain/holidays'
import {holidayStatusDescription} from "./components/HolidaySettings";
import {useUpdateGuard} from './state/useUpdates';
import {validateEditor,fieldId,type FieldErrors} from './state/formValidation';
import {QuickReminder} from './components/QuickReminder';
import {SavingOverlay} from './components/SavingOverlay';
import {sharingDescription,showMemberSharingControls} from '../shared/sharing-status';
import {useSharingView} from './state/useSharingView';
import {useSharing} from './state/useSharing';
import type {ChangeTarget} from '../shared/change-notifications';
import {SharingSettings} from './components/SharingSettings';
import {IconButton} from './components/Icon';
import {restoreFocus} from './state/restoreFocus';
import {normalizeReminder} from '../domain/reminder';
import {useReminders} from './state/useReminders';
import { useCallback, useEffect, useRef, useState, useLayoutEffect } from "react";
import type { HelpSection } from "../shared/help";
import type { TimelineApi } from "../shared/api";
import type { ApiError, YearMonth, Result, Id, Schedule, Project, ReminderSettings } from "../shared/types";
import {
  normalizeName,
  normalizeColor,
  normalizeParticipants,
  validateId,
} from "../domain/normalize";
import { parseBusinessDate, inclusiveDays, monthBounds, toOrdinal } from "../domain/date";
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
import { PlanWarning, StatusNotice } from "./components/StatusNotice";
import {PlanRailStatus} from "./workrail/PlanRailStatus";
import "./workrail/status.css";
import { Home } from "./workrail/Home";
import { NodeScreen } from "./workrail/NodeScreen";
import { useEnvironmentPicker } from "./workrail/NodeEnvironment";
import { ToolDock, type WorkRailTool } from "./workrail/ToolDock";
import { useLocalWorkDate } from "./workrail/useLocalWorkDate";
import { useNodeManagement } from "./workrail/useNodeManagement";
import "./shadcn.css";
import "./styles.css";
import "./flat-glass.css";
import "./planrail.css";
import "./forest-crystal.css";
import "./workrail.css";
interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  run: () => void;
  cancel?: () => void;
}
export function App({
  api = window.simpleTimeline,
  today,
  initialTool = "planrail",
}: {
  api?: TimelineApi;
  today?: Date;
  initialTool?: WorkRailTool;
}) {
  const [tool, setTool] = useState(initialTool);
  const [runtimeVersion, setRuntimeVersion] = useState<string>();
  const planrailActive = tool === "planrail";
  const dockButton = useRef<HTMLButtonElement>(null);
  const workDate = useLocalWorkDate(today);
  const node = useNodeManagement(tool === "node");
  const environmentPicker = useEnvironmentPicker(node);
  const reminders = useReminders();
  const handledReminder = useRef<number|null>(null);
  const timeline = useTimeline(api),
    editor = useEditor();
  const sharing = useSharing(timeline.reconcile,timeline.phase === 'ready');
  const [settingsDirty,setSettingsDirty]=useState(false);
  const [quickReminder,setQuickReminder]=useState<{id:string;caller:HTMLElement}|null>(null);
  const [quickDirty,setQuickDirty]=useState(false);
  const [saveShieldActive,setSaveShieldActive]=useState(false);
  const [filter,setFilter]=useState<'all'|'personal'|'shared'>('all');
  const sharingView=useSharingView(timeline.snapshot,filter);
  const {editableProjects,snapshot:visibleSnapshot}=sharingView;
  useEffect(()=>{if(sharingView.dragInvalidated)setNotice('공유 항목이 변경되어 드래그를 취소했습니다.')},[sharingView.dragInvalidated]);
  const openProject=(project?:import('../shared/types').Project,caller?:HTMLElement|null)=>{
    const mapping=sharing.state?.projects.find(p=>p.id===project?.id);
    // Revocation removes ACL rows but preserves names; never compress their slots.
    const recipientIds=project?.participants.map(name=>mapping?.participants.find(p=>p.name.trim()===name.trim())?.deviceId??'');
    editor.openProject(project,caller,recipientIds);
  };
  const [selectedDate, setSelectedDate] = useState(workDate),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [fieldErrors,setFieldErrors]=useState<FieldErrors>({}),
    [validationActive,setValidationActive]=useState(false),
    [formError, setFormError] = useState<ApiError | null>(null),
    [notice, setNotice] = useState(""),
    [warning,setWarning] = useState<{message:string}|null>(null),
    [projectsOpen, setProjectsOpen] = useState(false),
    [mode, setMode] = useState<"gantt" | "calendar">("gantt"),
    [dayModalOpen, setDayModalOpen] = useState(false),
    [narrow, setNarrow] = useState(window.innerWidth < 1100);
  const [month,setMonth] = useState(() => monthOf(workDate));
  const handledChange=useRef<string|null>(null);
  const [changeToOpen,setChangeToOpen]=useState<{target:ChangeTarget;caller:HTMLElement|null;draftKey:string}|null>(null);
  const [projectToReveal,setProjectToReveal]=useState<string|null>(null);
  const preferences = usePreferences();
  const recentProject = useRef<string | null>(null);
  const [todayRequest, setTodayRequest] = useState(() => ({date:workDate,token:0}));
  useEffect(()=>{
    if(!warning)return;
    const timer=window.setTimeout(()=>setWarning(null),4000);
    return()=>window.clearTimeout(timer);
  },[warning]);
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
  const pendingFieldFocus=useRef<string|null>(null);
  const serverFieldErrors=useRef<FieldErrors>({});
  useLayoutEffect(()=>{
    if(pendingFieldFocus.current&&!saveShieldActive&&timeline.mutation!=='pending'){
      const target=document.getElementById(fieldId(pendingFieldFocus.current));
      if(target&&!target.closest('[inert]')){restoreFocus(target);pendingFieldFocus.current=null;}
    }
  },[fieldErrors,saveShieldActive,timeline.mutation,planrailActive]);
  const focusTarget = useRef<string | null>(null),
    dialogCaller = useRef<HTMLElement | null>(null);
  const completionView = useRef({ mode, month });
  useLayoutEffect(() => {
    completionView.current = { mode, month };
  }, [mode, month]);
  useEffect(()=>{if(confirmation||dayModalOpen)setProjectsOpen(false)},[confirmation,dayModalOpen]);
  const model = editor.editor,
    canEdit = timeline.phase === "ready",
    saving = timeline.phase === "saving" || sharing.busy;
  const updates=useUpdateGuard({known:(timeline.phase==='ready'||timeline.phase==='saving')&&!sharing.writeOutcomeUnknown,dirty:editor.dirty||settingsDirty||quickDirty,saving});
  const settingsVisible=!!sharing.state&&!!sharing.api&&sharing.settingsOpen&&!quickReminder&&!confirmation&&!dayModalOpen&&timeline.mutation!=='pending'&&timeline.phase!=='saving'&&!saveShieldActive;
  const helpSection: HelpSection = settingsVisible ? "settings" : tool === "node" ? "noderail" : tool;
  const openHelp = useCallback(() => { void window.timelineWindow?.command("help", helpSection); }, [helpSection]);
  useEffect(() => {
    const handleHelp = (event: KeyboardEvent) => {
      if (event.key !== "F1" || !window.timelineWindow) return;
      event.preventDefault();
      if (!event.repeat) openHelp();
    };
    window.addEventListener("keydown", handleHelp, true);
    return () => window.removeEventListener("keydown", handleHelp, true);
  }, [openHelp]);
  const dockBlocked = updates.frozen || saveShieldActive || timeline.phase === 'saving'
    || settingsVisible || !!quickReminder || !!confirmation || dayModalOpen;
  const selectTool = (next: WorkRailTool) => {
    if (dockBlocked) return;
    setTool(next);
  };
  useEffect(()=>{setFieldErrors({});serverFieldErrors.current={};pendingFieldFocus.current=null;setValidationActive(false)},[model?.session]);
  const patchForm:typeof editor.patch=(update)=>{
    editor.patch(update);
    if(validationActive&&model){
      const next={...model,draft:{...model.draft,...update}} as typeof model;
      const remaining={...serverFieldErrors.current};
      for(const key of Object.keys(remaining)){
        const changed=key==='participants'||key.startsWith('participant-')||key.startsWith('recipient-')
          ? 'participants' in update||'recipientIds' in update||'shared' in update
          : ['daysBefore','reminderTime','reminder'].includes(key)?'reminder' in update:key in update;
        if(changed)delete remaining[key];
      }
      serverFieldErrors.current=remaining;
      setFieldErrors({...remaining,...validateEditor(next,timeline.snapshot?.projects??[])});
    }
  };
  const sharedMissing=!!model?.id&&model.sharing==='member'&&!!timeline.snapshot&&!(model.kind==='project'?timeline.snapshot.projects:timeline.snapshot.schedules).some(item=>item.id===model.id);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.editorDirty = String(editor.dirty || settingsDirty || quickDirty);
    document.documentElement.dataset.saving = String(saving);
    document.documentElement.dataset.timelinePhase = timeline.phase;
  }, [editor.dirty, settingsDirty, quickDirty, saving, timeline.phase]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (editor.dirty || settingsDirty || quickDirty || saving) {
        event.preventDefault();
        event.returnValue = false;
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [editor.dirty, settingsDirty, quickDirty, saving, timeline.phase]);
  useEffect(() => {
    if (model?.saved && timeline.phase === "ready"&&!saveShieldActive) editor.close();
  }, [model?.saved, timeline.phase,saveShieldActive]);
  useEffect(() => {
    if (planrailActive && !model && focusTarget.current) {
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
          key.startsWith("schedule:") || key.startsWith("more:") || key.startsWith("date:")
            ? '[data-focus="schedule-add"]'
            : '[data-focus="project-add"]',
        );
      focusTarget.current = null;
      if (target && !target.matches(":disabled")) restoreFocus(target);
      else document.querySelector<HTMLElement>("[data-focus=refresh]")?.focus();
    }
  }, [model, planrailActive]);
  useEffect(() => {
    if (timeline.phase !== "ready" || model?.kind !== "schedule" || !model.id || (editor.dirty && model.sharing !== "member")) return;
    const current = timeline.snapshot?.schedules.find(s => s.id === model.id);
    if (current) editor.syncSchedule(current);
  }, [timeline.phase, timeline.snapshot, model?.id, model?.kind, editor.dirty]);
  useEffect(()=>{
    if(model?.kind!=='project'||model.sharing!=='member')return;
    const current=timeline.snapshot?.projects.find(p=>p.id===model.id);
    if(current)editor.syncProject(current);
  },[timeline.snapshot,model?.kind,model?.id]);
  const activeConfirmation=useRef<Confirmation|null>(null);
  const liveMutation=useRef({snapshot:timeline.snapshot,canEdit,saving,frozen:updates.frozen,model});
  useLayoutEffect(()=>{liveMutation.current={snapshot:timeline.snapshot,canEdit,saving,frozen:updates.frozen,model}},[timeline.snapshot,canEdit,saving,updates.frozen,model]);
  const stillCurrent=(kind:'project'|'schedule',id:string|undefined,before:Project|Schedule|undefined)=>{
    const live=liveMutation.current;
    if(!live.canEdit||live.saving||live.frozen)return false;
    if(!id)return true;
    const current=(kind==='project'?live.snapshot?.projects:live.snapshot?.schedules)?.find(v=>v.id===id);
    return !!current&&JSON.stringify(current)===JSON.stringify(before);
  };
  const childrenKey=(schedules:Schedule[]|undefined,id:string)=>JSON.stringify((schedules??[]).filter(s=>s.projectId===id));
  const rejectStale=()=>setFormError({code:'NOT_FOUND',message:'대상이나 저장 상태가 변경되었습니다. 최신 내용을 확인하고 다시 시도해 주세요.'});
  const confirm = (value: Confirmation) => {
    if(activeConfirmation.current)return;
    let done=false;
    const finish=(accepted:boolean)=>{if(done)return;done=true;activeConfirmation.current=null;setConfirmation(null);if(accepted)value.run();else value.cancel?.()};
    const entry={...value,run:()=>finish(true),cancel:()=>finish(false)};
    activeConfirmation.current=entry;
    dialogCaller.current = document.activeElement as HTMLElement;
    setConfirmation(entry);
  };
  const askConfirmation=(value:Omit<Confirmation,'run'|'cancel'>)=>new Promise<boolean>(resolve=>{
    if(activeConfirmation.current){resolve(false);return}
    confirm({...value,run:()=>resolve(true),cancel:()=>resolve(false)});
  });
  useEffect(()=>{if(updates.frozen)activeConfirmation.current?.cancel?.()},[updates.frozen]);
  useEffect(()=>()=>{activeConfirmation.current?.cancel?.()},[]);
  const cancelConfirm = () => {
    activeConfirmation.current?.cancel?.();
    requestAnimationFrame(() => {
      if (dialogCaller.current?.isConnected) restoreFocus(dialogCaller.current);
      else document.getElementById("editor-name")?.focus();
    });
  };
  const close = () => {
    focusTarget.current =
      model?.returnFocus ??
      (model?.kind === "schedule" ? "schedule-add" : "project-add");
    editor.close();
    setFormError(null);
  };
  const request = (action: (caller: HTMLElement | null) => void) => {
    const caller = document.activeElement as HTMLElement | null;
    if (saving) return;
    setFormError(null);
    action(caller);
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
    if(error.field){pendingFieldFocus.current=error.field;setFieldErrors({[error.field]:error.message});document.getElementById(fieldId(error.field))?.focus();}
    else setFormError(error);
  };
  async function save(convertConfirmed=false) {
    if (!model || !canEdit || model.saved || sharedMissing) return;
    const errors=validateEditor(model,timeline.snapshot?.projects??[]);
    setValidationActive(true);serverFieldErrors.current={};setFieldErrors(errors);setFormError(null);
    if(Object.keys(errors).length){pendingFieldFocus.current=Object.keys(errors)[0];document.getElementById(fieldId(Object.keys(errors)[0]))?.focus();return;}
    if(model.kind==='project'&&model.draft.shared&&model.sharing!=='host'&&!convertConfirmed){
      const participants=model.draft.participants.map((name,i)=>`${name}: ${sharing.state?.devices.find(d=>d.id===model.draft.recipientIds?.[i])?.ip??'PC 미선택'}`).join(', ');
      const removed=model.original.participants.filter(name=>!model.draft.participants.includes(name)).join(', ')||'없음';
      confirm({title:'공유 프로젝트로 저장할까요?',message:`참여자 · IP: ${participants||'없음'}. 제거할 참여자: ${removed}. 기존 일정과 이 PC의 알림을 유지합니다.`,confirmLabel:'공유로 저장',run:()=>{setConfirmation(null);void save(true)}});return;
    }
    if(model.kind==='schedule'){
      const before=timeline.snapshot?.schedules.find(v=>v.id===model.id);
      const reminderOnly=!!before&&model.draft.name===before.name&&model.draft.startDate===before.startDate&&model.draft.endDate===before.endDate;
      const accepted=await askConfirmation({title:!model.id?'일정을 추가하시겠습니까?':reminderOnly?'알림 설정을 변경하시겠습니까?':'일정을 변경하시겠습니까?',message:`${timeline.snapshot?.projects.find(p=>p.id===model.draft.projectId)?.name??''} / ${model.draft.name} · ${before?`${before.startDate} — ${before.endDate} → `:''}${model.draft.startDate} — ${model.draft.endDate} · 알림 ${model.draft.reminder?.daysBefore}일 전 ${model.draft.reminder?.time} · 시작 ${model.draft.reminder?.start?'켜짐':'꺼짐'} / 종료 ${model.draft.reminder?.end?'켜짐':'꺼짐'}`,confirmLabel:model.id?'변경':'일정 추가'});
      if(!accepted)return;
      const live=liveMutation.current;
      const parent=live.snapshot?.projects.find(p=>p.id===model.draft.projectId);
      if(!stillCurrent('schedule',model.id,before)||live.model?.session!==model.session||!parent||(!model.id&&parent.sharing==='member')){rejectStale();return;}
    }
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
        if(model.sharing==='member')return;
        if(model.draft.shared){
          if(sharing.state?.role!=='host'||!sharing.api){setFormError({code:'FORBIDDEN',message:'공유 프로젝트 설정을 확인한 뒤 다시 저장해 주세요.'});return;}
          result=await timeline.mutateExternal(()=>sharing.run(()=>sharing.api!.saveProject({...v,...(model.id?{id:model.id}:{}),participants:v.participants.map(name=>({name,deviceId:model.draft.recipientIds?.[model.draft.participants.findIndex(p=>p.trim()===name)]??''}))})));
        }else result = model.id
          ? await timeline.mutate("updateProject", { ...v, id: model.id })
          : await timeline.mutate("createProject", v);
      } else {
        const v = {
          name: normalizeName(model.draft.name),
          startDate: parseBusinessDate(model.draft.startDate, "startDate"),
          endDate: parseBusinessDate(model.draft.endDate, "endDate"),
        };
        inclusiveDays(v.startDate, v.endDate);
        const reminder = normalizeReminder(model.draft.reminder,v.startDate,v.endDate);
        if(model.sharing==='member'){
          if(!model.id||!sharing.api){setFormError({code:'IPC_UNAVAILABLE',message:'공유 알림을 저장할 수 없습니다. 앱을 다시 실행하고 공유 연결을 확인해 주세요.'});return;}
          result=await timeline.mutateExternal(()=>sharing.run(()=>sharing.api!.saveReminder({id:model.id!,reminder})));
        } else result = model.id
          ? await timeline.mutate("updateSchedule", { ...v, reminder, id: model.id })
          : await timeline.mutate("createSchedule", {
              ...v, reminder,
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
    } else {if(result.error.code==='VALIDATION_ERROR'&&result.error.field){pendingFieldFocus.current=result.error.field;serverFieldErrors.current={[result.error.field]:result.error.message};setFieldErrors(serverFieldErrors.current);document.getElementById(fieldId(result.error.field))?.focus();}else setFormError(result.error);}
  }
  function remove() {
    if (!model?.id || !canEdit || model.sharing==='member') return;
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
    const children=childrenKey(snapshot.schedules,id);
    confirm({
      title: "삭제할까요?",
      message:
        kind === "project"
          ? `${model.draft.name} 프로젝트와 하위 일정 ${count}개를 함께 삭제합니다. 되돌릴 수 없습니다.`
          : `${model.draft.name} 일정을 삭제합니다. ${model.kind === "schedule" ? model.draft.startDate + " — " + model.draft.endDate : ""}`,
      confirmLabel: kind === "project" ? "함께 삭제" : "일정 삭제",
      run: () => {
        if(!stillCurrent(kind,id,(kind==='project'?snapshot.projects:snapshot.schedules).find(v=>v.id===id))||(kind==='project'&&children!==childrenKey(liveMutation.current.snapshot?.schedules,id))){rejectStale();return;}
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
  const quickFocus=useRef<{id:string;caller:HTMLElement}|null>(null);
  useLayoutEffect(()=>{
    if(quickReminder||saveShieldActive||saving||!quickFocus.current)return;
    const {id,caller}=quickFocus.current;quickFocus.current=null;
    const target=document.querySelector<HTMLElement>(`[data-focus="reminder:${id}"]`)??(caller.isConnected?caller:null)??document.querySelector<HTMLElement>(`[data-focus="schedule:${id}"]`)??document.querySelector<HTMLElement>('[data-focus="schedule-add"]');
    if(target&&!target.matches(':disabled'))restoreFocus(target);
  },[quickReminder,saveShieldActive,saving]);
  const closeQuick = () => {
    quickFocus.current=quickReminder;
    setQuickReminder(null);setQuickDirty(false);
  };
  const requestCloseQuick = () => {
    if(saving||saveShieldActive)return;
    closeQuick();
  };
  const allowQuickAction = () => {
    if(!canEdit||saving||saveShieldActive||confirmation||quickReminder)return false;
    if(editor.dirty||settingsDirty){setNotice('');setWarning({message:'먼저 저장하거나 변경을 버려주세요.'});return false}
    setFormError(null);return true;
  };
  const listDeleteFocus=useRef(false);
  useLayoutEffect(()=>{
    if(!listDeleteFocus.current||saving||saveShieldActive||timeline.mutation==='pending'||model?.saved)return;
    listDeleteFocus.current=false;
    restoreFocus(document.querySelector<HTMLElement>('[data-project-trigger]'));
  },[saving,saveShieldActive,timeline.mutation,model?.saved]);
  const deleteListedProject = async (project:Project) => {
    if(project.sharing==='member'||!allowQuickAction())return;
    const count=timeline.snapshot?.schedules.filter(s=>s.projectId===project.id).length??0;
    const children=childrenKey(timeline.snapshot?.schedules,project.id);
    if(!await askConfirmation({title:'삭제할까요?',message:`${project.name} 프로젝트와 하위 일정 ${count}개를 함께 삭제합니다. 되돌릴 수 없습니다.`,confirmLabel:'함께 삭제'}))return;
    if(!stillCurrent('project',project.id,project)||children!==childrenKey(liveMutation.current.snapshot?.schedules,project.id)){rejectStale();return;}
    listDeleteFocus.current=true;setProjectsOpen(false);setNotice('');
    const result=await timeline.mutate('deleteProject',{id:project.id,confirmed:true});
    if(result.ok){
      if(model&&(model.kind==='project'?model.id===project.id:model.draft.projectId===project.id))editor.markSaved();
      setNotice('프로젝트와 하위 일정을 삭제했습니다.');
    }
  };
  const saveQuickReminder = async (reminder:ReminderSettings):Promise<Result<Schedule>|null> => {
    const current=timeline.snapshot?.schedules.find(s=>s.id===quickReminder?.id);
    if(!current)return {ok:false,error:{code:'NOT_FOUND',message:'삭제되거나 공유가 해제된 일정입니다.'}};
    if(!await askConfirmation({title:'알림 설정을 변경하시겠습니까?',message:`${current.name} · ${reminder.daysBefore}일 전 · ${reminder.time} · 시작 ${reminder.start?'켜짐':'꺼짐'} / 종료 ${reminder.end?'켜짐':'꺼짐'}`,confirmLabel:'변경'}))return null;
    if(!stillCurrent('schedule',current.id,current))return {ok:false,error:{code:'NOT_FOUND',message:'일정이 변경되거나 공유가 해제되었습니다. 다시 확인해 주세요.'}};
    const result=current.sharing==='member'
      ? sharing.api ? await timeline.mutateExternal(()=>sharing.run(()=>sharing.api!.saveReminder({id:current.id,reminder})))
        : {ok:false as const,error:{code:'IPC_UNAVAILABLE' as const,message:'공유 알림을 저장할 수 없습니다.'}}
      : await timeline.mutate('updateScheduleReminder',{id:current.id,reminder});
    if(result.ok){editor.syncSchedule(result.data);setNotice('알림을 수정했습니다.')}
    return result;
  };
  const dragActions = {
    onDragStart: () => {
      if (!canEdit || confirmation || quickReminder) return false;
      if (editor.dirty) {
        setNotice('');setWarning({message:'먼저 저장하거나 변경을 버려주세요.'});
        return false;
      }
      sharingView.beginDrag();setNotice(""); return true;
    },
    onDragEnd:sharingView.endDrag,
    onDragCommit: (schedule: Schedule, dates: {startDate:string;endDate:string}) => {
      if(schedule.sharing==='member')return;
      if(dates.startDate===schedule.startDate&&dates.endDate===schedule.endDate)return;
      void (async () => {
        if(!await askConfirmation({title:'일정 날짜를 변경하시겠습니까?',message:`${schedule.name}: ${schedule.startDate} — ${schedule.endDate} → ${dates.startDate} — ${dates.endDate}`,confirmLabel:'변경'}))return;
        if(!stillCurrent('schedule',schedule.id,schedule)){rejectStale();return;}
        const result=await timeline.mutate("updateSchedule",{id:schedule.id,name:schedule.name,...dates});
        if(result.ok) { editor.syncSchedule(result.data); setNotice("일정을 변경했습니다."); }
      })();
    },
  };
  const addDate = (date: string, projectId?: string) => {
    if (!canEdit) return;
    const projects = editableProjects;
    const project = projects.find(p => p.id === (projectId ?? recentProject.current)) ?? projects[0];
    if (!project) { setSelectedDate(date); setMonth(monthOf(date)); setWarning({message:"먼저 프로젝트를 추가해 주세요."}); return; }
    request(() => {
      const origin=document.querySelector<HTMLElement>(mode === 'calendar' ? `.calendar [data-date="${date}"]` : `.gantt [data-day="${date}"]`);
      setSelectedDate(date); setMonth(monthOf(date)); editor.openSchedule(monthOf(date), project.id, undefined, origin, date);
    });
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
  const notificationBlocked = !canEdit || saving || dockBlocked || sharing.settingsOpen
    || settingsDirty || quickDirty || !!model?.saved;
  useEffect(()=>{
    const target=reminders.openRequest;
    if(!target||handledReminder.current===target.token||notificationBlocked)return;
    let cancelled=false;
    void api.getSnapshot().then(result=>{
      if(cancelled)return;
      handledReminder.current=target.token;
      void reminders.acknowledge(target.token);
      setTool('planrail');
      if(!result.ok){setFormError(result.error);return}
      const schedule=result.data.schedules.find(s=>s.id===target.scheduleId);
      if(!schedule){setFormError({code:'NOT_FOUND',message:'이미 삭제된 일정입니다.'});return}
      request(caller=>{setFilter('all');navigateDate(schedule.startDate);editor.openSchedule(monthOf(schedule.startDate),schedule.projectId,schedule,caller)});
    }).catch(()=>{if(!cancelled){setTool('planrail');setFormError({code:'IPC_UNAVAILABLE',message:'알림의 일정을 조회하지 못했습니다. 다시 조회해 주세요.'})}});
    return()=>{cancelled=true};
  },[reminders.openRequest,notificationBlocked,editor.dirty,api]);
  const changeNotifications=sharing.state?.changeNotifications;
  const changeDraftKey=JSON.stringify(model?{session:model.session,draft:model.kind==='schedule'&&model.sharing==='member'?model.draft.reminder:model.draft}:null);
  const changeNavigationBlocked=notificationBlocked;
  useEffect(()=>{
    const open=changeNotifications?.openRequest;
    if(!open||handledChange.current===open.token||changeNavigationBlocked||!sharing.api)return;
    // Dialogs restore focus on their closing frame before navigation takes over.
    const frame=requestAnimationFrame(()=>{
      handledChange.current=open.token;
      void sharing.api!.acknowledgeChange({token:open.token}).catch(()=>{});
      setTool('planrail');
      request(caller=>setChangeToOpen({target:open.target,caller,draftKey:changeDraftKey}));
    });
    return()=>cancelAnimationFrame(frame);
  },[changeNotifications?.openRequest,changeNavigationBlocked,editor.dirty,changeDraftKey,sharing.api]);
  useEffect(()=>{
    if(!changeToOpen||changeNavigationBlocked)return;
    // The confirmation authorizes only the draft that was shown to the user.
    if(changeNotifications?.enabled===false||(editor.dirty&&changeDraftKey!==changeToOpen.draftKey)){setChangeToOpen(null);return;}
    let cancelled=false;
    void (async()=>{
      if(!await timeline.reconcile()){if(!cancelled){setChangeToOpen(null);setFormError({code:'IPC_UNAVAILABLE',message:'공유 알림의 대상을 조회하지 못했습니다. 다시 동기화해 주세요.'});}return;}
      const snapshot=await timeline.reconcileSnapshot();
      if(cancelled)return;
      setChangeToOpen(null);
      setTool('planrail');
      if(!snapshot){setFormError({code:'IPC_UNAVAILABLE',message:'공유 알림의 대상을 조회하지 못했습니다. 다시 동기화해 주세요.'});return;}
      const target=changeToOpen.target;
      const allowed=sharing.state?.role==='member'&&sharing.state.status!=='revoked';
      const projectId=target.kind==='project'?target.id:target.kind==='schedule'?target.projectId:null;
      const project=allowed?snapshot.projects.find(p=>p.id===projectId&&p.sharing==='member'):undefined;
      const schedule=project&&target.kind==='schedule'?snapshot.schedules.find(s=>s.id===target.id&&s.projectId===project.id&&s.sharing==='member'):undefined;
      setFilter('all');setFormError(null);
      if(schedule){
        navigateDate(schedule.startDate);
        if(preferences.collapsed.includes(schedule.projectId))preferences.toggleProject(schedule.projectId);
        editor.openSchedule(monthOf(schedule.startDate),schedule.projectId,schedule,changeToOpen.caller);
      }else if(project&&target.kind==='project'){
        editor.close();
        const date=snapshot.schedules.filter(s=>s.projectId===project.id).map(s=>s.startDate).sort()[0];
        if(date)navigateDate(date);
        if(preferences.collapsed.includes(project.id))preferences.toggleProject(project.id);
        if(mode==='calendar')setProjectsOpen(true);
        setProjectToReveal(project.id);
      }else{
        editor.close();setProjectsOpen(true);
        if(target.kind!=='list')setNotice('공유 대상이 삭제되거나 공유가 해제되어 현재 프로젝트 목록을 표시합니다.');
      }
    })().catch(()=>{if(!cancelled){setChangeToOpen(null);setFormError({code:'IPC_UNAVAILABLE',message:'공유 알림의 대상을 조회하지 못했습니다. 다시 동기화해 주세요.'});}});
    return()=>{cancelled=true;};
  },[changeToOpen,changeNavigationBlocked,changeNotifications?.enabled,sharing.state?.role,sharing.state?.status,changeDraftKey,editor.dirty,api,timeline.reconcile,timeline.reconcileSnapshot,mode,preferences.collapsed]);
  useEffect(()=>{
    if(!planrailActive||!projectToReveal||model||confirmation||sharing.settingsOpen||quickReminder)return;
    const frame=requestAnimationFrame(()=>{
      if(mode==='gantt'){
        if(gantt.current?.focusItem(`project:${projectToReveal}`))setProjectToReveal(null);
      }else{
        const target=[...document.querySelectorAll<HTMLElement>('.project-popup [data-focus]')].find(el=>el.dataset.focus===`project:${projectToReveal}`);
        if(target){target.scrollIntoView({block:'nearest'});restoreFocus(target);setProjectToReveal(null);}
      }
    });
    return()=>cancelAnimationFrame(frame);
  },[projectToReveal,visibleSnapshot,mode,model,confirmation,sharing.settingsOpen,quickReminder,projectsOpen,planrailActive]);
  const reminderCorrections = (timeline.snapshot?.schedules??[]).filter(schedule=>{
    if(schedule.sharing!=='member')return false;
    const settings=model?.kind==='schedule'&&model.id===schedule.id?model.draft.reminder:schedule.reminder;
    return !!settings&&((settings.start&&toOrdinal(schedule.startDate)-settings.daysBefore<1)||(settings.end&&toOrdinal(schedule.endDate)-settings.daysBefore<1));
  });
  const reminderNotice = (reminders.error||reminders.failed||reminders.unknown||reminders.storageError) ? <PlanWarning>
    {reminders.error&&<p>{reminders.error}</p>}
    {reminders.storageError&&<p>알림 처리 기록을 저장하지 못했습니다. 알림을 보내지 않았거나 전송 결과가 불명확할 수 있습니다.</p>}
    {reminders.unknown>0&&<p>알림 전송 결과를 확인하지 못했습니다. 중복 방지를 위해 자동으로 다시 보내지 않습니다.</p>}
    {reminders.failed>0&&<p>알림 전송에 실패했습니다. Windows 알림 설정을 확인해 주세요.</p>}
    {reminders.failed>0&&<button type="button" className="workrail-control" onClick={()=>void reminders.retry()}>오늘의 실패한 알림 재시도</button>}
    {reminders.error&&<button type="button" className="workrail-control" onClick={()=>void reminders.refresh()}>알림 상태 다시 조회</button>}
  </PlanWarning>:null;
  const statusView = (<>
    {reminderNotice}
    {sharing.state?.role==='member'&&changeNotifications&&(changeNotifications.failed>0||changeNotifications.unknown>0||changeNotifications.storageError)&&<PlanWarning>
      {changeNotifications.storageError&&<p>공유 변경 알림 처리 기록을 저장하지 못했습니다. 알림을 보내지 않았거나 전송 결과가 불명확할 수 있습니다.</p>}
      {changeNotifications.unknown>0&&<p>공유 변경 알림 전송 결과를 확인하지 못했습니다. 중복 방지를 위해 다시 보내지 않습니다.</p>}
      {changeNotifications.failed>0&&<p>공유 변경 알림 전송에 실패했습니다. Windows 알림 설정을 확인해 주세요.</p>}
      {changeNotifications.failed>0&&sharing.api&&<button type="button" className="workrail-control" disabled={sharing.busy||!changeNotifications.enabled} onClick={()=>void sharing.run(()=>sharing.api!.retryChangeNotifications())}>실패한 공유 변경 알림 재시도</button>}
    </PlanWarning>}
    {reminderCorrections.map(schedule=><PlanWarning key={schedule.id}>
      <p>{schedule.name}: 알림 날짜가 0001-01-01 이전입니다. 며칠 전을 줄이거나 해당 알림을 끈 뒤 저장해 주세요. 수정 전까지 해당 알림을 보류합니다.</p>
      <button type="button" className="workrail-control" onClick={()=>{
        if(model?.kind==='schedule'&&model.id===schedule.id)document.getElementById('editor-daysBefore')?.focus();
        else request(caller=>editor.openSchedule(monthOf(schedule.startDate),schedule.projectId,schedule,caller));
      }}>{schedule.name} 알림 설정</button>
    </PlanWarning>)}
    {sharing.writeOutcomeUnknown&&<PlanWarning>공유 저장 결과를 확인하지 못해 업데이트를 설치할 수 없습니다. 앱을 완전히 종료한 뒤 다시 실행하여 공유 설정을 확인하고 설치를 다시 시도해 주세요.</PlanWarning>}
    {sharing.error&&sharing.error.message!==timeline.error?.message&&!(sharing.error.code==='VALIDATION_ERROR'&&sharing.error.field)&&<PlanWarning>{sharing.error.message}</PlanWarning>}
    {sharing.state&&["error","revoked","disconnected"].includes(sharing.state.status)&&sharing.error?.message!==sharingDescription(sharing.state)&&<PlanWarning>{sharingDescription(sharing.state)}</PlanWarning>}
    <StatusNotice
      phase={timeline.phase}
      error={formError ?? (timeline.error?.code==='VALIDATION_ERROR'&&timeline.error.field?null:timeline.error)}
      notice=""
      onRefresh={() => {
        setFormError(null);
        void timeline.refresh();
      }}
    />
  </>);
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={0} disableHoverableContent>
      <Titlebar onSettings={sharing.state&&sharing.api?()=>sharing.openSettings():undefined} onHelp={openHelp} onRuntimeVersion={setRuntimeVersion} sharing={null} installBlocked={saving||saveShieldActive||timeline.phase!=='ready'||sharing.writeOutcomeUnknown}/>
      {updates.frozen&&<div className="update-blocked update-ui" role="alert">{updates.editingBlocked?'앱을 종료한 뒤 다시 열어 주세요. 종료 준비 실패로 편집을 잠시 중지했습니다.':'업데이트 설치 준비 중입니다. 저장을 마칠 때까지 기다려 주세요.'}</div>}
      <div className="saving-content" inert={updates.frozen||saveShieldActive} onKeyDownCapture={event => {
        if (event.key !== "F6" || dockBlocked) return;
        event.preventDefault();
        dockButton.current?.focus();
      }}>
      <div className="workrail-dock-seat">
        <ToolDock current={tool} blocked={dockBlocked} onSelect={selectTool} activeButton={dockButton}/>
      </div>
      <div className="workrail-tools">
      <div className="workrail-plan" aria-hidden={!planrailActive || undefined} inert={!planrailActive}>
      <div
        className="app-shell"
        aria-hidden={settingsVisible || !!quickReminder || !!confirmation || dayModalOpen || (narrow && !!model)}
        inert={settingsVisible || !!quickReminder || !!confirmation || dayModalOpen || (narrow && !!model)}
      >
        <Toolbar
          filter={filter} onFilter={value=>request(()=>setFilter(value))}
          sharingSync={sharing.state&&showMemberSharingControls(sharing.state)?<IconButton tooltip icon="refresh" label="수동 동기화" description={sharing.state.pendingPair||!sharing.state.address?'설정과 연결 승인이 필요합니다.':'호스트의 전체 공유 자료를 다시 받습니다.'} aria-busy={sharing.busy} className={sharing.busy?'sync-busy':''} disabled={sharing.busy||!!sharing.state.pendingPair||!sharing.state.address||['pairing','revoked'].includes(sharing.state.status)} onClick={()=>{setNotice('');void sharing.sync().then(ok=>{if(ok)setNotice('동기화했습니다.')})}}/>:null}
          selectedDate={selectedDate}
          mode={mode}
          onMode={setMode}
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
          hasProjects={!!editableProjects.length}
          projectList={visibleSnapshot&&<ProjectList snapshot={visibleSnapshot} disabled={!canEdit}
            onDelete={p=>void deleteListedProject(p)}
            onProject={p=>{setProjectsOpen(false);request(caller=>openProject(p,caller))}}
            onAdd={p=>{setProjectsOpen(false);request(caller=>editor.openSchedule(month,p.id,undefined,caller))}}/>}
          projectsOpen={projectsOpen}
          onProjects={setProjectsOpen}
          onProject={() =>
            request((caller) => openProject(undefined, caller))
          }
          onSchedule={() =>
            request((caller) =>
              editor.openSchedule(
                month,
                (editableProjects.find(p => p.id === recentProject.current) ?? editableProjects[0]).id,
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
          className={mode === "gantt" ? "gantt-workspace" : undefined}
          aria-hidden={settingsVisible || !!quickReminder || !!confirmation || (narrow && !!model)}
          inert={settingsVisible || !!quickReminder || !!confirmation || (narrow && !!model)}
          aria-label="프로젝트와 일정"
        >
          {timeline.snapshot ? (
            <>
              <GanttView
                holidays={effectiveHolidayCalendar(localHolidaySources(sharing.state))} holidaySources={localHolidaySources(sharing.state)} holidayNotice={holidayStatusDescription(sharing.state?.holidays)}
                {...dragActions}
                ref={gantt}
                collapsed={preferences.collapsed} onToggleProject={preferences.toggleProject}
                todayRequest={todayRequest} onAddDate={addDate}
                dayWidth={preferences.dayWidth} onDayWidth={preferences.setDayWidth}
                active={mode === "gantt"}
                interactive={planrailActive}
                snapshot={visibleSnapshot!}
                hideEmptyChrome={filter==='shared'&&!visibleSnapshot?.projects.length}
                selectedMonth={month}
                selectedDate={selectedDate}
                disabled={!planrailActive || !canEdit || sharingView.dragInvalidated}
                onReminder={(s,caller)=>{if(allowQuickAction())setQuickReminder({id:s.id,caller})}}
                onEditProject={(p) =>
                  request((caller) => openProject(p, caller))
                }
                onEditSchedule={(s) =>
                  request((caller) =>
                    editor.openSchedule(month, s.projectId, s, caller),
                  )
                }
                onAddSchedule={(p) =>
                  request((caller) =>
                    p.sharing!=='member'&&editor.openSchedule(month, p.id, undefined, caller),
                  )
                }
              />
              <CalendarView
                holidays={effectiveHolidayCalendar(localHolidaySources(sharing.state))} holidaySources={localHolidaySources(sharing.state)} holidayNotice={holidayStatusDescription(sharing.state?.holidays)}
                {...dragActions} onMonth={navigateMonth}
                onAddDate={addDate}
                snapshot={visibleSnapshot!}
                selectedMonth={month}
                selectedDate={selectedDate}
                active={mode === "calendar"}
                disabled={!planrailActive || !canEdit || sharingView.dragInvalidated}
                onModalChange={setDayModalOpen}
                onEditProject={(p) =>
                  request((caller) => openProject(p, caller))
                }
                onEditSchedule={(s) =>
                  request((caller) =>
                    editor.openSchedule(month, s.projectId, s, caller),
                  )
                }
                onAddSchedule={(p) =>
                  request((caller) =>
                    p.sharing!=='member'&&editor.openSchedule(month, p.id, undefined, caller),
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
            unavailable={sharedMissing}
            sharing={sharing.state}
            editor={model}
            projects={timeline.snapshot?.projects ?? []}
            patch={patchForm}
            fieldErrors={fieldErrors}
            onSave={() => void save()}
            onDelete={remove}
            onClose={() => request(close)}
            disabled={!canEdit || model.saved || sharedMissing}
            busy={saving}
            narrow={narrow}
            active={planrailActive}
            covered={!planrailActive || !!confirmation || !!quickReminder || dayModalOpen || settingsVisible}
            error={sharedMissing?{code:'NOT_FOUND',message:'더 이상 공유되지 않거나 삭제된 항목입니다. 개인 알림을 저장할 수 없습니다.'}:formError ?? (timeline.error?.code==='VALIDATION_ERROR'&&timeline.error.field?null:timeline.error)}
            status={narrow ? statusView : null}
          />
        )}
      </div>
      {warning&&<div className="toast warning-toast" role="alert">{warning.message}</div>}
      <div className="toast" hidden={!!warning} role="status" aria-live="polite">{timeline.phase === "ready" && !timeline.error && !formError ? notice : ""}</div>
      </div>
      {tool === "home" && <Home date={workDate} snapshot={timeline.snapshot} phase={timeline.phase} timelineError={timeline.error}
        sharing={sharing.state} sharingError={sharing.error} node={node} version={runtimeVersion} onRefresh={() => void timeline.refresh()}
        onEnvironment={environmentPicker.openPicker} onSettings={sharing.state&&sharing.api?()=>sharing.openSettings('sharing'):undefined}
        onPlanrail={() => {
          selectTool("planrail");
          setFilter("all");
          navigateDate(workDate);
          requestAnimationFrame(() => dockButton.current?.focus());
        }} onNode={() => {
          selectTool("node");
          requestAnimationFrame(() => dockButton.current?.focus());
        }}/>}
      <div className="workrail-node-seat" aria-hidden={tool!=="node"||undefined} inert={tool!=="node"}><NodeScreen node={node} onEnvironment={environmentPicker.openPicker}/></div>
      </div>
      {!dockBlocked && environmentPicker.dialog}
      {planrailActive&&<PlanRailStatus sharing={sharing.error?.code==='IPC_UNAVAILABLE'?null:sharing.state} muted={reminders.muted} loading={reminders.loading}/>}
      {settingsVisible&&sharing.state&&sharing.api&&<SharingSettings externalDirty={editor.dirty} request={sharing.settingsRequest} initialTab={sharing.settingsTab} state={sharing.state} api={sharing.api} busy={sharing.busy} error={sharing.error} projects={timeline.snapshot?.projects??[]} run={sharing.run} onClose={()=>sharing.setSettingsOpen(false)} onHelp={openHelp} onGuard={setSettingsDirty}/>}
      {quickReminder&&<QuickReminder key={quickReminder.id} schedule={timeline.snapshot?.schedules.find(s=>s.id===quickReminder.id)} caller={quickReminder.caller}
        disabled={!canEdit||saving||saveShieldActive} busy={saving||saveShieldActive} covered={!!confirmation} onRefresh={()=>void timeline.refresh()} onGuard={setQuickDirty} onClose={requestCloseQuick} onSave={saveQuickReminder}/>}
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
      </div>
      <SavingOverlay state={timeline.mutation} onBlockingChange={setSaveShieldActive}/>
    </TooltipProvider>
  );
}
