import { app } from "electron";
import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from 'node:url';
import { tmpdir } from "node:os";
import { bootstrap } from "../../src/main/bootstrap";
import { hotfix, schedule, project, overlaps } from "../fixtures/timeline";
import type { Result } from "../../src/shared/types";
const requested = process.env.SIMPLE_TIMELINE_TEST_PROFILE;
if (!requested) throw Error("Test profile required");
const profile = resolve(requested),
  rel = relative(tmpdir(), profile);
if (
  isAbsolute(rel) ||
  rel.startsWith("..") ||
  !rel.startsWith("simple-timeline-")
)
  throw Error("Isolated temporary profile required");
let changed = false,
  injected = false;
const fault = process.env.SIMPLE_TIMELINE_TEST_FAULT;
void bootstrap({
  profileDir: profile,
  rendererUrl: fault === "missing-renderer" ? pathToFileURL(join(profile, "missing.html")).href : undefined,
  notifyBlocked(storage) {
    if (fault === "startup" && storage.state === "blocked")
      writeFileSync(
        join(dirname(profile), "startup-error.json"),
        JSON.stringify(storage.error),
      );
  },
  confirmClose: async () => {
    if (fault === "close-denied") {
      writeFileSync(join(profile, "close-confirmed.txt"), "requested");
      return false;
    }
    return true;
  },
  afterDispatch(method, result): Result<unknown> {
    if (
      (method === "createProject" ||
        (method === "createSchedule" && fault?.startsWith("schedule-")) ||
        (method === "updateSchedule" && fault?.startsWith("drag-"))) &&
      result.ok
    ) {
      changed = true;
      if ((fault === "lost" || fault === "schedule-lost" || fault === "drag-lost") && !injected) {
        injected = true;
        throw Error("Test response lost after commit");
      }
    }
    if (
      method === "getSnapshot" &&
      (fault === "refresh" || fault === "schedule-refresh") &&
      changed &&
      !injected
    ) {
      injected = true;
      return {
        ok: false,
        error: { code: "STORAGE_IO", message: "읽기에 실패했습니다." },
      };
    }
    return result;
  },
})
  .then((result) => {
    if (!result || result.storage.state !== "ready") return;
    const { storage } = result,
      repo = storage.repository,
      seed = process.env.SIMPLE_TIMELINE_TEST_SEED;
    if (seed && !repo.getSnapshot().projects.length) {
      const data =
        seed === "scale"
          ? {
              projects: [project()],
              schedules: [
                {
                  ...schedule("1", "1", "0001-01-01", "0001-01-01"),
                  name: "최초 일정",
                },
                {
                  ...schedule("2", "1", "9999-12-31", "9999-12-31"),
                  name: "마지막 연도",
                },
                ...Array.from({ length: 9998 }, (_, i) => ({
                  ...schedule(String(i + 3), "1", "2026-12-15", "2026-12-15"),
                  name: `대량 일정 ${i + 1}`,
                })),
              ],
            }
          : seed === "single"
            ? { projects: [project()], schedules: [schedule()] }
            : seed === "focus"
              ? {
                  projects: hotfix.projects,
                  schedules: [
                    ...hotfix.schedules,
                    {
                      ...schedule("4", "1", "2030-01-01", "2030-01-01"),
                      name: "먼 일정",
                    },
                  ],
                }
              : seed === "overlaps"
                ? { projects: [project()], schedules: overlaps }
                : hotfix;
      storage.db.transaction(() => {
        for (const p of data.projects)
          repo.createProject({
            name: p.name,
            color: p.color,
            participants: p.participants,
          });
        for (const s of data.schedules)
          repo.createSchedule({
            projectId: s.projectId,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
          });
      })();
    }
    if (fault === "schedule-full") {
      const original = repo.createSchedule;
      repo.createSchedule = (input) => {
        if (!injected) {
          injected = true;
          throw Object.assign(Error("Simulated disk full"), {
            code: "SQLITE_FULL",
          });
        }
        return original(input);
      };
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
