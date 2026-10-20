#!/usr/bin/env python3
"""Small local Graphify adapter; no parsing, graph traversal or indexing of its own."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "graphify-out"
STAMP = OUT / "repository-index.json"
FLAGS = ["--code-only", "--no-cluster", "--no-dedup", "--max-workers", "4"]


def runtime():
    cli = shutil.which("graphify")
    if not cli:
        raise SystemExit("Graphify is not installed/on PATH. See docs/development/ai-context/graphify.md.")
    try:
        import graphify.detect  # noqa: F401
    except ImportError:
        # Reuse an installed CLI's virtualenv; never install packages implicitly.
        interpreter = Path(cli).read_text().splitlines()[0].removeprefix("#!")
        if Path(interpreter).is_file() and Path(interpreter).resolve() != Path(sys.executable).resolve():
            os.execv(interpreter, [interpreter, str(Path(__file__).resolve()), *sys.argv[1:]])
        raise SystemExit("Run this script with the Python environment that contains Graphify.")
    return cli


def revision():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def config():
    return {
        "version": importlib.metadata.version("graphifyy"),
        "flags": FLAGS,
        "hashes": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in (".graphifyignore", ".gitignore", "scripts/architecture-index.py")
        },
    }


def status():
    from graphify.detect import detect_incremental
    if not STAMP.exists() or not (OUT / "graph.json").exists():
        return {"fresh": False, "reason": "missing index or successful-build stamp"}
    saved = json.loads(STAMP.read_text())
    delta = detect_incremental(ROOT, manifest_path=str(OUT / "manifest.json"),
                               kind="ast", cache_root=ROOT)
    changed = delta["new_files"].get("code", [])
    deleted = delta.get("deleted_files", [])
    excluded = delta.get("excluded_files", [])
    same_config = saved["config"] == config()
    same_revision = saved["revision"] == revision()
    same_graph = saved.get("graph_sha256") == hashlib.sha256((OUT / "graph.json").read_bytes()).hexdigest()
    return {
        "fresh": not (changed or deleted or excluded) and same_config and same_revision and same_graph,
        "config_matches": same_config, "revision_matches": same_revision,
        "graph_matches": same_graph,
        "changed_code": [str(Path(p).relative_to(ROOT)) for p in changed],
        "deleted": deleted, "excluded": excluded,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "update", "status", "query"])
    parser.add_argument("seed", nargs="?", help="Graphify node label or repository-relative source path")
    parser.add_argument("--budget", type=int, default=900, help="Graphify approximate token budget")
    parser.add_argument("--context", help="Native Graphify relation filter, e.g. import or call")
    args = parser.parse_args()
    cli = runtime()
    if args.command == "status":
        result = status()
        print(json.dumps(result, indent=2))
        return 0 if result["fresh"] else 1
    if args.command == "query":
        if not args.seed or args.budget <= 0:
            parser.error("query requires a seed and a positive budget")
        if not status()["fresh"]:
            raise SystemExit("Index is stale. Run: python3 scripts/architecture-index.py update")
        command = [cli, "query", args.seed, "--seed", args.seed,
                   "--budget", str(args.budget), "--graph", str(OUT / "graph.json")]
        if args.context:
            command += ["--context", args.context]
        return subprocess.call(command, cwd=ROOT)
    if args.command == "update" and status()["fresh"]:
        print("Index is current; no extraction performed.")
        return 0
    OUT.mkdir(exist_ok=True)
    # Invalidate freshness before work; failed extraction must never appear current.
    STAMP.unlink(missing_ok=True)
    started = time.perf_counter()
    # Native incremental merge leaves stale incoming edges after callee deletion
    # in 0.9.92. Delegate full resolution to Graphify; it bypasses TS/JS AST cache.
    subprocess.run([cli, "extract", str(ROOT), *FLAGS, "--force"], cwd=ROOT, check=True)
    from graphify.detect import detect_incremental
    delta = detect_incremental(ROOT, manifest_path=str(OUT / "manifest.json"),
                               kind="ast", cache_root=ROOT)
    if delta["new_files"].get("code"):
        raise SystemExit("Some code files remain unindexed; inspect Graphify warnings. No freshness stamp saved.")
    saved = {"config": config(), "revision": revision(),
             "graph_sha256": hashlib.sha256((OUT / "graph.json").read_bytes()).hexdigest(),
             "seconds": round(time.perf_counter() - started, 3)}
    temporary = STAMP.with_suffix(".tmp")
    temporary.write_text(json.dumps(saved, indent=2) + "\n")
    temporary.replace(STAMP)
    print(json.dumps(saved, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
