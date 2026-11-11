import {exposeUpdateFixture} from './update-fixture';
import { app } from "electron";
import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from 'node:url';
import { tmpdir } from "node:os";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createProtectedSecrets } from '../../src/main/sharing/secrets';
import { SharingClient } from '../../src/main/sharing/client';
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
  // All E2E profiles use an independent change queue; never invoke real OS notifications.
  changeSender: async(message,onClick,onFailure) => {
    const g=globalThis as any;
    (g.changeMessages??=[]).push(message);
    (g.changeClicks??=[]).push(onClick);
    (g.changeFailures??=[]).push(onFailure);
    return 'submitted';
  },
  ...(fault === 'sharing' ? {
    // Test entry only: real pinned HTTPS/authentication, bound to a distinct socket source.
    sharingTransport: { client: options => {
      const bound = {...options, localAddress: '127.0.0.2'};
      return new SharingClient(bound);
    } },
    // A deterministic per-isolated-profile key supports restart without an OS keychain.
    sharingSecrets: async (directory: string) => {
      const key = createHash('sha256').update(directory).digest();
      return createProtectedSecrets(directory, {
        isAsyncEncryptionAvailable: async () => true,
        getSelectedStorageBackend: () => 'isolated-test-aes',
        encryptStringAsync: async value => {
          const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
          return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
        },
        decryptStringAsync: async value => {
          const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0,12));
          decipher.setAuthTag(value.subarray(-16));
          return {result: Buffer.concat([decipher.update(value.subarray(12,-16)), decipher.final()]).toString('utf8'), shouldReEncrypt: false};
        },
      });
    },
  } : {}),
  chooseClose: async canHide => {
    writeFileSync(join(profile,'close-choice.txt'),'requested')
    return fault === 'tray-failure-cancel' ? 'cancel' : canHide ? 'hide' : 'quit'
  },
  ...(fault?.startsWith('reminder-') ? {
    reminderClock:()=>new Date(2026,10,9,12),
    reminderSender:async(message:import('../../src/main/reminders/engine').ReminderMessage,onClick:()=>void)=>{
      const g=globalThis as any;
      (g.reminderMessages??=[]).push(message);g.reminderClick=onClick;
      return fault==='reminder-failed'&&g.reminderMessages.length===1 ? 'failed' as const : 'submitted' as const;
    },
  } : {}),
  ...(fault?.startsWith("tray-failure") ? {
    createTray: () => { throw Error("Injected tray creation failure") },
    notifyTrayFailure: () => writeFileSync(join(profile,"tray-error.txt"),"reported"),
  } : {}),
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
  async afterDispatch(method, result): Promise<Result<unknown>> {
    if (result.ok && !method.startsWith('get')) (globalThis as any).lastSourceCommitAt = Date.now();
    if (fault === "pending-save" && method === "createProject") await new Promise(resolve => setTimeout(resolve, 1000));
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
    (globalThis as any).desktopController = (result as any).desktop;
    (globalThis as any).sharingService = result.sharing;
    (globalThis as any).testStorage = result.storage;
    if(fault==='updates')exposeUpdateFixture(result.window,profile,()=>{if(result.storage.state==='ready'&&result.storage.db.open)result.storage.db.close()});
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
      // The IPC sharing facade captures local methods during bootstrap.
      const activeRepository = result.sharing?.repository ?? repo;
      const original = activeRepository.createSchedule;
      activeRepository.createSchedule = (input) => {
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
