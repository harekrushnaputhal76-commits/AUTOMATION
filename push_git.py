import os
import shutil
import stat
import subprocess
import sys

REPO_URL = "https://github.com/harekrushnaputhal76-commits/AUTOMATION.git"
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_SYNC = os.path.join(ROOT_DIR, "temp_git_sync")

def remove_readonly(func, path, excinfo):
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

def safe_remove_tree(dir_path):
    if os.path.exists(dir_path):
        subprocess.run(f'cmd /c rmdir /s /q "{dir_path}"', shell=True, capture_output=True)
        if os.path.exists(dir_path):
            try:
                shutil.rmtree(dir_path, onerror=remove_readonly)
            except Exception:
                pass

def safe_copy_file(src, dst):
    try:
        shutil.copy2(src, dst)
    except Exception:
        try:
            with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
                fdst.write(fsrc.read())
        except Exception as e:
            print(f"Warning copying {src} to {dst}: {e}")

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
        "ads.txt",
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
                safe_copy_file(src, dst)
                print(f"  Synced -> {os.path.relpath(dst, ROOT_DIR)}")

    # 2. Clone repo to temporary directory
    print("\n[2/4] Connecting to GitHub remote...")
    safe_remove_tree(TEMP_SYNC)

    code, out, err = run(f"git clone --depth 1 {REPO_URL} temp_git_sync")
    if code != 0:
        print(f"Error cloning repository: {err}")
        sys.exit(1)

    # 3. Copy files into repo structure
    print("\n[3/4] Mirroring files to Git repository...")
    repo_targets = [
        TEMP_SYNC,
        os.path.join(TEMP_SYNC, "docs"),
        os.path.join(TEMP_SYNC, "nextplay", "public"),
        os.path.join(TEMP_SYNC, "game", "nextplay", "public")
    ]
    for target in repo_targets:
        os.makedirs(os.path.join(target, "css"), exist_ok=True)
        os.makedirs(os.path.join(target, "js"), exist_ok=True)
        for f in files_to_sync:
            src = os.path.join(ROOT_DIR, f)
            dst = os.path.join(target, f)
            if os.path.exists(src):
                safe_copy_file(src, dst)

    # Copy Capacitor project files
    cap_files = ["package.json", "package-lock.json", "capacitor.config.json"]
    for cap_dst_dir in [os.path.join(TEMP_SYNC, "nextplay"), os.path.join(TEMP_SYNC, "game", "nextplay")]:
        os.makedirs(cap_dst_dir, exist_ok=True)
        for cf in cap_files:
            src_cf = os.path.join(ROOT_DIR, "nextplay", cf)
            if os.path.exists(src_cf):
                safe_copy_file(src_cf, os.path.join(cap_dst_dir, cf))

    # Copy .github workflows
    src_github = os.path.join(ROOT_DIR, ".github")
    if os.path.exists(src_github):
        dst_github = os.path.join(TEMP_SYNC, ".github")
        if os.path.exists(dst_github):
            safe_remove_tree(dst_github)
        try:
            shutil.copytree(src_github, dst_github)
            print("  Mirrored -> .github/workflows")
        except Exception as ge:
            print(f"Warning mirroring .github: {ge}")

    # Copy root helper scripts if available
    for extra in ["run.bat", "push_git.bat", "push_git.py"]:
        src = os.path.join(ROOT_DIR, extra)
        if os.path.exists(src):
            safe_copy_file(src, os.path.join(TEMP_SYNC, extra))

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
            safe_remove_tree(TEMP_SYNC)
            sys.exit(1)
        print(f"Commit created: {commit_out.splitlines()[0] if commit_out else 'OK'}")

        code, push_out, push_err = run("git push origin main", cwd=TEMP_SYNC)
        if code != 0:
            print(f"Push error: {push_err}")
            safe_remove_tree(TEMP_SYNC)
            sys.exit(1)
        print("Successfully pushed to GitHub: origin/main!")

    # Cleanup
    safe_remove_tree(TEMP_SYNC)
    print("\nGit sync completed successfully!")

if __name__ == "__main__":
    main()

