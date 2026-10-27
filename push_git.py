import os
import shutil
import subprocess
import sys

REPO_URL = "https://github.com/harekrushnaputhal76-commits/AUTOMATION.git"
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_SYNC = os.path.join(ROOT_DIR, "temp_git_sync")

def run(cmd, cwd=ROOT_DIR):
    res = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return res.returncode, res.stdout.strip(), res.stderr.strip()

def main():
    commit_msg = sys.argv[1] if len(sys.argv) > 1 else "feat: update portal assets and sync all targets"
    print(f"=== NexPlay Arcade Git Sync ===")
    print(f"Target Remote: {REPO_URL}")
    print(f"Commit Message: {commit_msg}")

    # 1. Local Sync between root, docs, and nextplay/public
    print("\n[1/4] Synchronizing local targets (root -> docs & nextplay/public)...")
    files_to_sync = [
        "index.html",
        os.path.join("css", "style.css"),
        os.path.join("js", "app.js")
    ]
    local_targets = [
        os.path.join(ROOT_DIR, "docs"),
        os.path.join(ROOT_DIR, "nextplay", "public")
    ]
    for target in local_targets:
        os.makedirs(os.path.join(target, "css"), exist_ok=True)
        os.makedirs(os.path.join(target, "js"), exist_ok=True)
        for f in files_to_sync:
            src = os.path.join(ROOT_DIR, f)
            dst = os.path.join(target, f)
            if os.path.exists(src):
                shutil.copy2(src, dst)
                print(f"  Synced -> {os.path.relpath(dst, ROOT_DIR)}")

    # 2. Clone repo to temporary directory
    print("\n[2/4] Connecting to GitHub remote...")
    if os.path.exists(TEMP_SYNC):
        shutil.rmtree(TEMP_SYNC, ignore_errors=True)

    code, out, err = run(f"git clone {REPO_URL} temp_git_sync")
    if code != 0:
        print(f"Error cloning repository: {err}")
        sys.exit(1)

    # 3. Copy files into repo structure
    print("\n[3/4] Mirroring files to Git repository...")
    repo_targets = [
        TEMP_SYNC,
        os.path.join(TEMP_SYNC, "docs"),
        os.path.join(TEMP_SYNC, "game", "nextplay", "public")
    ]
    for target in repo_targets:
        os.makedirs(os.path.join(target, "css"), exist_ok=True)
        os.makedirs(os.path.join(target, "js"), exist_ok=True)
        for f in files_to_sync:
            src = os.path.join(ROOT_DIR, f)
            dst = os.path.join(target, f)
            if os.path.exists(src):
                shutil.copy2(src, dst)

    # Copy root helper scripts if available
    for extra in ["run.bat", "push_git.bat", "push_git.py"]:
        src = os.path.join(ROOT_DIR, extra)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(TEMP_SYNC, extra))

    # 4. Check status & Push
    print("\n[4/4] Checking Git status and pushing changes...")
    code, status_out, _ = run("git status --porcelain", cwd=TEMP_SYNC)
    if not status_out:
        print("Everything is already up-to-date on GitHub. Nothing new to commit.")
    else:
        print("Changes detected:")
        for line in status_out.splitlines():
            print(f"  {line}")

        run("git add -A", cwd=TEMP_SYNC)
        code, commit_out, commit_err = run(f'git commit -m "{commit_msg}"', cwd=TEMP_SYNC)
        if code != 0:
            print(f"Commit error: {commit_err}")
            shutil.rmtree(TEMP_SYNC, ignore_errors=True)
            sys.exit(1)
        print(f"Commit created: {commit_out.splitlines()[0] if commit_out else 'OK'}")

        code, push_out, push_err = run("git push origin main", cwd=TEMP_SYNC)
        if code != 0:
            print(f"Push error: {push_err}")
            shutil.rmtree(TEMP_SYNC, ignore_errors=True)
            sys.exit(1)
        print("Successfully pushed to GitHub: origin/main!")

    # Cleanup
    shutil.rmtree(TEMP_SYNC, ignore_errors=True)
    print("\nGit sync completed successfully!")

if __name__ == "__main__":
    main()
