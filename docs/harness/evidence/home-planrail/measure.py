"""Run with DISPLAY set to a 1440x1000 Xvfb and a working Chromium sandbox."""
import argparse
import hashlib
import json
import os
import platform
import shutil
import sqlite3
import statistics
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("before", type=Path, help="baseline tree with npm run build:test output")
parser.add_argument("after", type=Path, help="candidate tree built with the same command")
parser.add_argument("output", type=Path, help="new JSON file")
parser.add_argument("--pairs", type=int, default=24)
args = parser.parse_args()
if args.pairs < 1 or args.output.exists():
    parser.error("select a positive pair count and a fresh output path")
roots = {name: root.resolve() for name, root in (("before", args.before), ("after", args.after))}
day = datetime.now(timezone.utc).date()
env = dict(os.environ, TZ="UTC", FIXTURE_DAY=day.isoformat())
env.pop("ELECTRON_RUN_AS_NODE", None)
env.pop("SIMPLE_TIMELINE_TEST_FAULT", None)


def launch(root, profile, seed=""):
    entry = root / "artifacts/test-app/main/index.cjs"
    binary = root / "node_modules/electron/dist/electron"
    settings = dict(env, WORKRAIL_TEST_ENTRY=str(entry), SIMPLE_TIMELINE_TEST_PROFILE=str(profile),
                    SIMPLE_TIMELINE_TEST_SEED=seed)
    with tempfile.TemporaryFile(mode="w+") as errors:
        proc = subprocess.Popen([binary, here / "drive.cjs"], cwd=root, env=settings,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True)
        try:
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline and proc.poll() is None:
                try:
                    report = json.loads((profile / "startup-latest.json").read_text())
                except (ValueError, FileNotFoundError):
                    report = {}
                if "ui-ready" in report.get("stages", {}):
                    break
                time.sleep(.01)
            else:
                raise RuntimeError("Home readiness mark missing")
            stdout, _ = proc.communicate("seed\n" if seed else "go\n", timeout=20)
            if proc.returncode:
                raise RuntimeError("Electron exited with " + str(proc.returncode))
            line = next(line for line in stdout.splitlines() if line.startswith("BENCH_RESULT "))
            return report["stages"], json.loads(line.removeprefix("BENCH_RESULT "))
        except BaseException:
            proc.kill()
            proc.wait()
            errors.seek(0)
            print(errors.read()[-5000:], flush=True)
            raise


def fixture(folder, count):
    with tempfile.TemporaryDirectory(prefix="simple-timeline-perf-seed-") as tmp:
        profile = Path(tmp)
        launch(roots["before"], profile, "hotfix" if count == 3 else "scale")
        source = profile / "data/timeline.sqlite3"
        with sqlite3.connect(source) as db:
            assert db.execute("select count(*) from schedules").fetchone()[0] == count
            # Keep the first row on screen and the dense group outside the selected month.
            future = (day.replace(day=1) + timedelta(days=50)).replace(day=15).isoformat()
            db.execute("update schedules set name='측정 일정', start_date=?, end_date=? where id=1",
                       (day.isoformat(), day.isoformat()))
            db.execute("update schedules set start_date=?, end_date=? where id>1 and id!=2", (future, future))
            db.execute("update schedules set start_date='9999-12-31', end_date='9999-12-31' where id=2")
            db.commit()
            with sqlite3.connect(folder / str(count)) as backup:
                db.backup(backup)


def summary(rows):
    keys = ["homeMs", "firstMs", "roundTripMs", "snapshotToHomeMs"]
    output = {}
    for n in (3, 10000):
        output[str(n)] = {}
        for name in roots:
            sub = [r for r in rows if r["count"] == n and r["build"] == name]
            if sub:
                output[str(n)][name] = {
                    key: [statistics.median(values), min(values), max(values)]
                    for key in keys if (values := [r[key] for r in sub])
                }
    return output


def paired_summary(rows):
    by_pair = {}
    for row in rows:
        by_pair.setdefault((row["count"], row["pair"]), {})[row["build"]] = row
    output = {}
    for n in (3, 10000):
        complete = [pair for (count, _), pair in by_pair.items() if count == n and len(pair) == 2]
        if not complete:
            continue
        output[str(n)] = {}
        for key in ("homeMs", "firstMs", "roundTripMs", "snapshotToHomeMs"):
            delta = [pair["after"][key] - pair["before"][key] for pair in complete]
            output[str(n)][key] = {"pairs": len(delta), "candidateFaster": sum(d < 0 for d in delta),
                                   "medianAfterMinusBeforeMs": round(statistics.median(delta), 3)}
    return output


def bundle_identity(root):
    parts = sorted((root / "artifacts/test-app/renderer/assets").glob("main-*.js"))
    main = root / "artifacts/test-app/main/index.cjs"
    return {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in [main, *parts]}


rows = []
output = {"day": day.isoformat(), "pairsPlanned": args.pairs, "system": platform.platform(),
          "electron": json.loads((roots["before"] / "node_modules/electron/package.json").read_text())["version"],
          "bundles": {name: bundle_identity(root) for name, root in roots.items()}, "runs": rows}
with tempfile.TemporaryDirectory() as tmp:
    folder = Path(tmp)
    for n in (3, 10000):
        fixture(folder, n)
    for pair in range(1, args.pairs + 1):
        for n in ((3, 10000) if pair % 2 else (10000, 3)):
            for name in (("before", "after") if pair % 2 else ("after", "before")):
                with tempfile.TemporaryDirectory(prefix="simple-timeline-perf-") as tmp_profile:
                    profile = Path(tmp_profile)
                    (profile / "data").mkdir()
                    shutil.copyfile(folder / str(n), profile / "data/timeline.sqlite3")
                    stages, driver = launch(roots[name], profile)
                first, round_trip = driver["first"], driver["roundTrip"]
                assert first["planClicked"] < first["barClicked"] <= first["editorReady"]
                assert round_trip["homeClicked"] < round_trip["planClicked"] <= round_trip["barReady"]
                assert driver["context"]["scale"] == 1
                row = dict(pair=pair, count=n, build=name, stages=stages, **driver,
                           homeMs=stages["ui-ready"], snapshotToHomeMs=stages["ui-ready"] - stages["snapshot-served"],
                           firstMs=round(first["editorReady"] - first["planClicked"], 3),
                           roundTripMs=round(round_trip["barReady"] - round_trip["homeClicked"], 3))
                rows.append(row)
                output["summaryMedianMinMax"] = summary(rows)
                output["paired"] = paired_summary(rows)
                args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
                print(pair, n, name, row["homeMs"], row["firstMs"], row["roundTripMs"], flush=True)
