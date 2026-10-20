#!/usr/bin/env python3
"""Compare native incremental and cached full resolution against a clean Graphify build.

Uses isolated temporary Git repositories only. Native merge discrepancies are
reported; the safe cached-full policy must match the clean build in every case.
"""
import json
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import time


def run(command, root):
    return subprocess.run(command, cwd=root, check=True, capture_output=True,
                          text=True, timeout=120).stdout


def build(root, output, force=False):
    command = ["graphify", "extract", str(root), "--out", str(output),
               "--code-only", "--no-cluster", "--no-dedup", "--max-workers", "1"]
    if force:
        command.append("--force")
    start = time.perf_counter()
    run(command, root)
    return round(time.perf_counter() - start, 3)


def graph(output):
    data = json.loads((output / "graphify-out/graph.json").read_text())
    return {key: {json.dumps(item, sort_keys=True) for item in data[key]}
            for key in ("nodes", "edges")}


def main():
    results = []
    with tempfile.TemporaryDirectory(prefix="graphify-verification-") as directory:
        base = Path(directory)
        root = base / "repo"
        root.mkdir()
        native, safe = base / "native", base / "safe"
        def git(*args):
            return run(["git", *args], root).strip()
        git("init", "-q", "-b", "baseline")
        (root / "a.ts").write_text("export function alpha() { return 1; }\n"
                                  "export function beta() { return 2; }\n")
        (root / "b.ts").write_text("import {alpha} from './a';\n"
                                  "export function caller() { return alpha(); }\n")
        git("add", ".")
        git("-c", "user.name=Index test", "-c", "user.email=index@example.invalid",
            "commit", "-qm", "baseline")
        git("checkout", "-qb", "changed")
        build(root, native)
        build(root, safe, True)

        def check(name):
            cold = base / f"cold-{len(results)}"
            times = {"native": build(root, native), "safe": build(root, safe, True),
                     "clean": build(root, cold, True)}
            expected = graph(cold)
            actual_native, actual_safe = graph(native), graph(safe)
            results.append({
                "case": name, "seconds": times,
                "native_matches_clean": actual_native == expected,
                "safe_matches_clean": actual_safe == expected,
                "native_difference": {
                    key: {"extra": len(actual_native[key] - expected[key]),
                          "missing": len(expected[key] - actual_native[key])}
                    for key in expected
                },
            })

        check("unchanged")
        (root / "b.ts").write_text("import {beta} from './a';\n"
                                  "export function caller() { return beta(); }\n")
        check("changed import and call")
        (root / "a.ts").write_text("export function alpha() { return 1; }\n")
        check("deleted export; unchanged caller")
        (root / "a.ts").rename(root / "c.ts")
        check("renamed file; unresolved old import")
        (root / "b.ts").write_text("import {alpha} from './c';\n"
                                  "export function caller() { return alpha(); }\n")
        check("updated import after rename")
        (root / "added.ts").write_text("import {caller} from './b';\n"
                                      "export function added() { return caller(); }\n")
        check("added caller")
        (root / "b.ts").unlink()
        check("deleted file; surviving importer")
        git("add", ".")
        git("-c", "user.name=Index test", "-c", "user.email=index@example.invalid",
            "commit", "-qm", "changed")
        git("checkout", "-q", "baseline")
        check("switch to baseline branch")
        git("checkout", "-q", "changed")
        check("switch to changed branch")
        # Exercise the actual repository adapter, not just equivalent CLI flags.
        (root / "scripts").mkdir()
        shutil.copyfile(Path(__file__).with_name("architecture-index.py"),
                        root / "scripts/architecture-index.py")
        (root / ".gitignore").write_text("graphify-out/\n")
        (root / ".graphifyignore").write_text("scripts/\n")
        command = [sys.executable, "scripts/architecture-index.py"]
        def expect(args, code=0):
            result = subprocess.run(command + args, cwd=root, capture_output=True,
                                    text=True, timeout=120)
            assert result.returncode == code, (args, result.stdout, result.stderr)
            return result.stdout
        expect(["status"], 1)
        expect(["build"])
        expect(["status"])
        before = (root / "graphify-out/graph.json").stat().st_mtime_ns
        expect(["update"])
        assert before == (root / "graphify-out/graph.json").stat().st_mtime_ns
        (root / "c.ts").write_text("export function alpha() { return 42; }\n")
        expect(["status"], 1)
        expect(["query", "alpha"], 1)
        expect(["update"])
        expect(["query", "alpha", "--budget", "200"])
        # A branch/HEAD transition with identical files must still invalidate provenance.
        git("symbolic-ref", "HEAD", "refs/heads/baseline")
        expect(["status"], 1)
        expect(["update"])
        expect(["status"])
    print(json.dumps({"transitions": results,
                      "adapter_checks": "missing/fresh/no-op/edit/stale-query/update/query/HEAD-change passed"},
                     indent=2))
    return 0 if all(row["safe_matches_clean"] for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
