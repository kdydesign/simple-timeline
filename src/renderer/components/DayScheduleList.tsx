import { useMemo, useState, useRef, useEffect } from "react";
import type { Project, Schedule } from "../../shared/types";
import {
  scheduleDescription,
  colorText,
} from "../../visualization/presentation";
import { trapTab } from "./ConfirmDialog";
export function DayScheduleList({
  date,
  schedules,
  projects,
  onClose,
  onEdit,
  disabled,
}: {
  date: string;
  schedules: Schedule[];
  projects: Project[];
  onClose: () => void;
  onEdit: (s: Schedule) => void;
  disabled: boolean;
}) {
  const map = useMemo(
      () => new Map(projects.map((p) => [p.id, p])),
      [projects],
    ),
    list = useRef<HTMLDivElement>(null),
    title = useRef<HTMLHeadingElement>(null);
  const [top, setTop] = useState(0),
    [focus, setFocus] = useState<number | null>(null),
    [height, setHeight] = useState(360);
  useEffect(() => {
    title.current?.focus();
    const el = list.current!;
    const measure = () => {
      if (el.clientHeight) setHeight(el.clientHeight);
    };
    measure();
    const o =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    o?.observe(el);
    return () => o?.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(top / 72) - 2),
    last = Math.min(schedules.length, Math.ceil((top + height) / 72) + 2),
    visible = new Set(
      Array.from({ length: last - first }, (_, i) => first + i),
    );
  if (focus !== null) visible.add(focus);
  const reveal = (i: number) => {
    const el = list.current!;
    el.scrollTop = Math.max(0, i * 72 - 72);
    setTop(el.scrollTop);
    setFocus(i);
    requestAnimationFrame(() =>
      el.querySelector<HTMLElement>(`[data-list-index="${i}"]`)?.focus(),
    );
  };
  return (
    <div className="scrim">
      <section
        className="day-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-list-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          } else trapTab(e, e.currentTarget);
        }}
      >
        <div className="day-dialog-heading">
          <h2 ref={title} tabIndex={-1} id="day-list-title">
            {date} 전체 일정 {schedules.length}개
          </h2>
          <button onClick={onClose}>목록 닫기</button>
        </div>
        <p className="help">위아래 키로 모든 일정 이동 · Home/End 처음과 끝</p>
        <div
          className="day-list"
          ref={list}
          onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: schedules.length * 72, position: "relative" }}>
            {[...visible]
              .sort((a, b) => a - b)
              .map((i) => {
                const s = schedules[i],
                  p = map.get(s.projectId)!;
                return (
                  <button
                    key={s.id}
                    className="day-list-item"
                    data-list-index={i}
                    data-return-focus={`more:${date}`}
                    disabled={disabled}
                    aria-label={scheduleDescription(s, p)}
                    title={scheduleDescription(s, p)}
                    style={{ top: i * 72 }}
                    onFocus={() => setFocus(i)}
                    onClick={() => onEdit(s)}
                    onKeyDown={(e) => {
                      if (
                        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
                      ) {
                        e.preventDefault();
                        reveal(
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? schedules.length - 1
                              : Math.min(
                                  schedules.length - 1,
                                  Math.max(
                                    0,
                                    i + (e.key === "ArrowDown" ? 1 : -1),
                                  ),
                                ),
                        );
                      }
                    }}
                  >
                    <span
                      className="color-dot"
                      style={{
                        backgroundColor: p.color,
                        color: colorText(p.color),
                      }}
                    />
                    <span>
                      <strong>
                        {s.name} · #{s.id}
                      </strong>
                      <small>
                        {p.name} · {s.startDate} — {s.endDate}
                      </small>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </section>
    </div>
  );
}
