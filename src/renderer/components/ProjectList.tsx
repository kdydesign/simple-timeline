import { useMemo } from "react";
import type { Project, TimelineSnapshot } from "../../shared/types";
import { indexSnapshot } from "../../visualization/presentation";
export function ProjectList({
  snapshot,
  disabled,
  onProject,
  onAdd,
}: {
  snapshot: TimelineSnapshot;
  disabled: boolean;
  onProject: (p: Project) => void;
  onAdd: (p: Project) => void;
}) {
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot]);
  if (!snapshot.projects.length)
    return <p className="empty">프로젝트를 추가해 일정을 관리하세요</p>;
  return (
    <div className="projects">
      {index.projects.map((p) => (
        <section
          className="project"
          key={p.id}
          aria-label={index.projectLabel(p)}
        >
          <div className="project-heading">
            <span className="color-dot" style={{ backgroundColor: p.color }} />
            <div>
              <button
                className="text-button project-name"
                data-focus={`project:${p.id}`}
                aria-label={`${index.projectLabel(p)} 편집`}
                disabled={disabled}
                onClick={() => onProject(p)}
              >
                {index.projectLabel(p)}
              </button>
              <p>
                {p.participants.join(" · ") || "참여자 없음"} · 일정{" "}
                {index.byProject.get(p.id)?.length ?? 0}개
              </p>
            </div>
            <button
              data-focus={`add:${p.id}`}
              className="add-schedule"
              disabled={disabled}
              onClick={() => onAdd(p)}
            >
              일정 추가
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
