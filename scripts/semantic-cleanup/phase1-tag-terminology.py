#!/usr/bin/env python3
"""
Phase 1: Tag all incorrect terminology with TODO-SEMANTIC comments
This script adds TODO-SEMANTIC comments without changing functionality
"""

import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

REPO_ROOT = Path("/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix")
SCRIPT_DIR = Path(__file__).parent
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = SCRIPT_DIR / "backups" / f"phase1_{TIMESTAMP}"

print("🏷️  Phase 1: Semantic Terminology Tagging")
print(f"📁 Repository: {REPO_ROOT}")
print(f"💾 Backup Directory: {BACKUP_DIR}")

# Create backup directory
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Patterns to tag (pattern, semantic comment)
PATTERNS = [
    # Variable declarations that need review
    (r'(\s+)const jobId\s*=', r'\1const jobId = // TODO-SEMANTIC: Check if this jobId should be stepId'),
    (r'(\s+)const workflowId\s*=', r'\1const workflowId = // TODO-SEMANTIC: Check if this workflowId should be jobId'),
    (r'(\s+)let jobId\s*=', r'\1let jobId = // TODO-SEMANTIC: Check if this jobId should be stepId'),
    (r'(\s+)let workflowId\s*=', r'\1let workflowId = // TODO-SEMANTIC: Check if this workflowId should be jobId'),

    # Function parameters
    (r'(function\s+\w+\([^)]*)\bjobId\b', r'\1jobId /* TODO-SEMANTIC: Check if jobId param should be stepId */'),
    (r'(function\s+\w+\([^)]*)\bworkflowId\b', r'\1workflowId /* TODO-SEMANTIC: Check if workflowId param should be jobId */'),
    (r'(\([^)]*)\bjobId:', r'\1jobId: /* TODO-SEMANTIC: Check if jobId should be stepId */'),
    (r'(\([^)]*)\bworkflowId:', r'\1workflowId: /* TODO-SEMANTIC: Check if workflowId should be jobId */'),

    # Redis key patterns
    (r"'job:(\w+)", r"'job:\1 /* TODO-SEMANTIC: This 'job:' prefix should likely be 'step:' for worker processing units */"),
    (r'"job:(\w+)', r'"job:\1 /* TODO-SEMANTIC: This "job:" prefix should likely be "step:" for worker processing units */'),
    (r"'workflow:(\w+)", r"'workflow:\1 /* TODO-SEMANTIC: This 'workflow:' prefix should likely be 'job:' for user requests */"),
    (r'"workflow:(\w+)', r'"workflow:\1 /* TODO-SEMANTIC: This "workflow:" prefix should likely be "job:" for user requests */'),
]

def backup_file(file_path: Path) -> None:
    """Create backup of a file"""
    relative = file_path.relative_to(REPO_ROOT)
    backup_path = BACKUP_DIR / relative
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file_path, backup_path)

def tag_file(file_path: Path) -> int:
    """Add TODO-SEMANTIC comments to a file. Returns number of changes made."""
    try:
        content = file_path.read_text(encoding='utf-8')
        original_content = content
        changes = 0

        # Check if file already has TODO-SEMANTIC comments - skip if too many
        existing_count = content.count('TODO-SEMANTIC')
        if existing_count > 50:
            print(f"  ⏭️  Skipping {file_path.name} (already has {existing_count} TODO-SEMANTIC comments)")
            return 0

        # Apply each pattern
        for pattern, replacement in PATTERNS:
            new_content = re.sub(pattern, replacement, content)
            if new_content != content:
                changes += 1
                content = new_content

        # Only write if changes were made
        if content != original_content:
            backup_file(file_path)
            file_path.write_text(content, encoding='utf-8')
            print(f"  ✅ Tagged {file_path.name} ({changes} patterns matched)")
            return changes

        return 0
    except Exception as e:
        print(f"  ⚠️  Error processing {file_path}: {e}")
        return 0

def find_typescript_files() -> List[Path]:
    """Find all TypeScript files in the repository"""
    ts_files = []

    # Core packages and apps directories
    search_dirs = [
        REPO_ROOT / "packages",
        REPO_ROOT / "apps",
    ]

    for search_dir in search_dirs:
        if search_dir.exists():
            ts_files.extend(search_dir.rglob("*.ts"))
            ts_files.extend(search_dir.rglob("*.tsx"))

    # Filter out node_modules, dist, build
    ts_files = [
        f for f in ts_files
        if "node_modules" not in str(f)
        and "dist" not in str(f)
        and "build" not in str(f)
        and ".next" not in str(f)
    ]

    return ts_files

def generate_report(tagged_files: List[Tuple[Path, int]]) -> None:
    """Generate a report of all tagged files"""
    report_file = BACKUP_DIR / "semantic_issues_report.md"

    with open(report_file, 'w') as f:
        f.write("# Semantic Terminology Issues Report\n\n")
        f.write("This report documents files that were tagged with TODO-SEMANTIC comments.\n\n")
        f.write("## Semantic Model\n\n")
        f.write("- **'Job'** → **'Step'** (what workers process)\n")
        f.write("- **'Workflow'** → **'Job'** (what users request)\n\n")
        f.write("## Tagged Files\n\n")

        if not tagged_files:
            f.write("No files were tagged (all files may already have TODO-SEMANTIC comments).\n")
        else:
            for file_path, change_count in tagged_files:
                relative = file_path.relative_to(REPO_ROOT)
                f.write(f"- `{relative}` ({change_count} patterns matched)\n")

        f.write(f"\n## Summary\n\n")
        f.write(f"- Total files scanned: {len(find_typescript_files())}\n")
        f.write(f"- Files tagged: {len(tagged_files)}\n")
        f.write(f"- Total patterns matched: {sum(count for _, count in tagged_files)}\n")

    print(f"\n📊 Report generated: {report_file}")

def main():
    print("\n🔍 Finding TypeScript files...")
    ts_files = find_typescript_files()
    print(f"   Found {len(ts_files)} TypeScript files to scan")

    print("\n🏷️  Tagging files with TODO-SEMANTIC comments...")
    tagged_files = []

    for file_path in ts_files:
        changes = tag_file(file_path)
        if changes > 0:
            tagged_files.append((file_path, changes))

    print(f"\n📊 Generating report...")
    generate_report(tagged_files)

    print("\n✅ Phase 1 Complete!")
    print(f"💾 Backups stored in: {BACKUP_DIR}")
    print(f"\n📋 Summary:")
    print(f"   - Files scanned: {len(ts_files)}")
    print(f"   - Files tagged: {len(tagged_files)}")
    print(f"   - Total patterns matched: {sum(count for _, count in tagged_files)}")

    print(f"\n🔍 Next Steps:")
    print(f"   1. Review the generated report: {BACKUP_DIR}/semantic_issues_report.md")
    print(f"   2. Run TypeScript compilation: pnpm typecheck")
    print(f"   3. Run tests: pnpm test")
    print(f"   4. Review TODO-SEMANTIC comments: grep -r 'TODO-SEMANTIC' packages/ apps/")
    print(f"\n⚠️  Important: This phase only adds comments, no functional changes made")

if __name__ == "__main__":
    main()