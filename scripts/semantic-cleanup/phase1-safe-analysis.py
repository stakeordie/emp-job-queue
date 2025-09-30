#!/usr/bin/env python3
"""
Phase 1 (SAFE): Analyze terminology usage and generate comprehensive report
This script ONLY reads files and generates reports - NO CODE MODIFICATIONS
"""

import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Tuple

REPO_ROOT = Path("/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix")
SCRIPT_DIR = Path(__file__).parent
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
REPORT_DIR = SCRIPT_DIR / "reports" / f"phase1_analysis_{TIMESTAMP}"

print("🔍 Phase 1: Semantic Terminology Analysis (READ-ONLY)")
print(f"📁 Repository: {REPO_ROOT}")
print(f"📊 Report Directory: {REPORT_DIR}")

# Create report directory
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# Patterns to identify (pattern, description, new_term)
PATTERNS = [
    # Variable declarations
    (r'\bconst\s+jobId\s*=', "Variable 'jobId' assignment", "Check if should be 'stepId'"),
    (r'\blet\s+jobId\s*=', "Variable 'jobId' assignment", "Check if should be 'stepId'"),
    (r'\bconst\s+workflowId\s*=', "Variable 'workflowId' assignment", "Check if should be 'jobId'"),
    (r'\blet\s+workflowId\s*=', "Variable 'workflowId' assignment", "Check if should be 'jobId'"),

    # Function parameters
    (r'function\s+\w+\([^)]*\bjobId\b', "Function parameter 'jobId'", "Check if should be 'stepId'"),
    (r'function\s+\w+\([^)]*\bworkflowId\b', "Function parameter 'workflowId'", "Check if should be 'jobId'"),
    (r'\([^)]*\bjobId:', "Parameter 'jobId:'", "Check if should be 'stepId:'"),
    (r'\([^)]*\bworkflowId:', "Parameter 'workflowId:'", "Check if should be 'jobId:'"),

    # Object properties
    (r'\.jobId\b', "Property access '.jobId'", "Check if should be '.stepId'"),
    (r'\.workflowId\b', "Property access '.workflowId'", "Check if should be '.jobId'"),
    (r'"jobId":', "Object property 'jobId'", "Check if should be 'stepId'"),
    (r"'jobId':", "Object property 'jobId'", "Check if should be 'stepId'"),
    (r'"workflowId":', "Object property 'workflowId'", "Check if should be 'jobId'"),
    (r"'workflowId':", "Object property 'workflowId'", "Check if should be 'jobId'"),

    # Redis key patterns
    (r"['\"]job:", "Redis key prefix 'job:'", "Check if should be 'step:' for worker processing units"),
    (r"['\"]workflow:", "Redis key prefix 'workflow:'", "Check if should be 'job:' for user requests"),

    # Type names
    (r'\binterface\s+Job\b', "Interface 'Job'", "Should be 'Step' - worker processing unit"),
    (r'\binterface\s+JobProgress\b', "Interface 'JobProgress'", "Should be 'StepProgress'"),
    (r'\binterface\s+JobResult\b', "Interface 'JobResult'", "Should be 'StepResult'"),
    (r'\btype\s+Job\b', "Type 'Job'", "Should be 'Step' - worker processing unit"),
]

class TerminologyIssue:
    def __init__(self, file_path: Path, line_num: int, line_content: str, pattern_desc: str, recommendation: str):
        self.file_path = file_path
        self.line_num = line_num
        self.line_content = line_content.strip()
        self.pattern_desc = pattern_desc
        self.recommendation = recommendation

def find_typescript_files() -> List[Path]:
    """Find all TypeScript files in the repository"""
    ts_files = []

    search_dirs = [
        REPO_ROOT / "packages",
        REPO_ROOT / "apps",
    ]

    for search_dir in search_dirs:
        if search_dir.exists():
            ts_files.extend(search_dir.rglob("*.ts"))
            ts_files.extend(search_dir.rglob("*.tsx"))

    # Filter out generated and build directories
    ts_files = [
        f for f in ts_files
        if "node_modules" not in str(f)
        and "dist" not in str(f)
        and "build" not in str(f)
        and ".next" not in str(f)
        and "prisma/client" not in str(f)
    ]

    return ts_files

def analyze_file(file_path: Path) -> List[TerminologyIssue]:
    """Analyze a file for terminology issues"""
    issues = []

    try:
        content = file_path.read_text(encoding='utf-8')
        lines = content.split('\n')

        for line_num, line in enumerate(lines, 1):
            # Skip comments and already-tagged lines
            if 'TODO-SEMANTIC' in line or line.strip().startswith('//'):
                continue

            for pattern, desc, recommendation in PATTERNS:
                if re.search(pattern, line):
                    issues.append(TerminologyIssue(
                        file_path, line_num, line, desc, recommendation
                    ))

    except Exception as e:
        print(f"  ⚠️  Error analyzing {file_path.name}: {e}")

    return issues

def generate_detailed_report(all_issues: List[TerminologyIssue]) -> None:
    """Generate detailed markdown report"""
    report_file = REPORT_DIR / "DETAILED_ANALYSIS.md"

    # Group issues by file
    issues_by_file: Dict[Path, List[TerminologyIssue]] = {}
    for issue in all_issues:
        if issue.file_path not in issues_by_file:
            issues_by_file[issue.file_path] = []
        issues_by_file[issue.file_path].append(issue)

    with open(report_file, 'w') as f:
        f.write("# Phase 1: Semantic Terminology Analysis\n\n")
        f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        f.write("## Semantic Model\n\n")
        f.write("### Current → Target Terminology\n\n")
        f.write("| Current | Target | Description |\n")
        f.write("|---------|--------|-------------|\n")
        f.write("| Job | Step | What workers process (individual processing unit) |\n")
        f.write("| Workflow | Job | What users request (collection of processing steps) |\n")
        f.write("| workflow_id | job_id | UUID of user's request |\n")
        f.write("| job_id | step_id | UUID of individual processing unit |\n")
        f.write("| step-{uuid} | {uuid} | Clean UUIDs without prefixes |\n\n")

        f.write("## Executive Summary\n\n")
        f.write(f"- **Total files scanned:** {len(find_typescript_files())}\n")
        f.write(f"- **Files with issues:** {len(issues_by_file)}\n")
        f.write(f"- **Total issues found:** {len(all_issues)}\n\n")

        # Statistics by pattern type
        f.write("### Issues by Category\n\n")
        category_counts: Dict[str, int] = {}
        for issue in all_issues:
            category = issue.pattern_desc.split("'")[0].strip()
            category_counts[category] = category_counts.get(category, 0) + 1

        for category, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
            f.write(f"- {category}: **{count}** occurrences\n")

        f.write("\n## Files Requiring Attention\n\n")

        # Sort files by number of issues
        sorted_files = sorted(issues_by_file.items(), key=lambda x: len(x[1]), reverse=True)

        for file_path, issues in sorted_files:
            relative_path = file_path.relative_to(REPO_ROOT)
            f.write(f"### `{relative_path}`\n\n")
            f.write(f"**Issues found:** {len(issues)}\n\n")

            # Group by line number to avoid duplicates
            issues_by_line: Dict[int, List[TerminologyIssue]] = {}
            for issue in issues:
                if issue.line_num not in issues_by_line:
                    issues_by_line[issue.line_num] = []
                issues_by_line[issue.line_num].append(issue)

            for line_num in sorted(issues_by_line.keys()):
                line_issues = issues_by_line[line_num]
                f.write(f"**Line {line_num}:**\n")
                f.write(f"```typescript\n{line_issues[0].line_content}\n```\n\n")

                for issue in line_issues:
                    f.write(f"- ⚠️  {issue.pattern_desc} → {issue.recommendation}\n")
                f.write("\n")

    print(f"\n📊 Detailed report generated: {report_file}")

def generate_action_plan(all_issues: List[TerminologyIssue]) -> None:
    """Generate actionable migration plan"""
    plan_file = REPORT_DIR / "ACTION_PLAN.md"

    # Group issues by file
    issues_by_file: Dict[Path, List[TerminologyIssue]] = {}
    for issue in all_issues:
        if issue.file_path not in issues_by_file:
            issues_by_file[issue.file_path] = []
        issues_by_file[issue.file_path].append(issue)

    with open(plan_file, 'w') as f:
        f.write("# Phase 1: Action Plan\n\n")
        f.write("## Overview\n\n")
        f.write(f"This plan addresses {len(all_issues)} terminology issues across {len(issues_by_file)} files.\n\n")

        f.write("## Recommended Migration Sequence\n\n")
        f.write("### Step 1: Core Type Definitions (CRITICAL)\n\n")
        f.write("Update these files first as they define the base types:\n\n")

        core_files = [
            "packages/core/src/types/job.ts",
            "packages/core/src/types/worker.ts",
            "packages/core/src/interfaces/*.ts",
        ]

        for pattern in core_files:
            f.write(f"- [ ] `{pattern}`\n")

        f.write("\n### Step 2: Redis Key Patterns (HIGH PRIORITY)\n\n")
        f.write("Update Redis key generation and pattern matching:\n\n")

        redis_patterns = [
            "packages/core/src/redis-service.ts",
            "packages/core/src/redis-functions/*.lua",
            "apps/worker/src/redis-direct-worker-client.ts",
        ]

        for pattern in redis_patterns:
            f.write(f"- [ ] `{pattern}`\n")

        f.write("\n### Step 3: Service Implementations (MEDIUM PRIORITY)\n\n")
        f.write("Update service layer implementations:\n\n")

        f.write("- [ ] API server job handling\n")
        f.write("- [ ] Worker job claiming and processing\n")
        f.write("- [ ] Webhook service job notifications\n")
        f.write("- [ ] Monitor UI job display\n")

        f.write("\n### Step 4: Tests and Documentation (LOW PRIORITY)\n\n")
        f.write("Update tests and documentation:\n\n")

        f.write("- [ ] Unit tests\n")
        f.write("- [ ] Integration tests\n")
        f.write("- [ ] API documentation\n")
        f.write("- [ ] README files\n")

        f.write("\n## File-by-File Checklist\n\n")

        sorted_files = sorted(issues_by_file.items(), key=lambda x: len(x[1]), reverse=True)

        for file_path, issues in sorted_files:
            relative_path = file_path.relative_to(REPO_ROOT)
            f.write(f"### `{relative_path}` ({len(issues)} issues)\n\n")

            # Deduplicate recommendations
            recommendations = set()
            for issue in issues:
                recommendations.add(issue.recommendation)

            for rec in sorted(recommendations):
                f.write(f"- [ ] {rec}\n")
            f.write("\n")

    print(f"📋 Action plan generated: {plan_file}")

def generate_summary(all_issues: List[TerminologyIssue]) -> None:
    """Generate executive summary"""
    summary_file = REPORT_DIR / "SUMMARY.md"

    with open(summary_file, 'w') as f:
        f.write("# Phase 1: Executive Summary\n\n")
        f.write(f"**Analysis Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        f.write("## Key Findings\n\n")
        f.write(f"1. **{len(all_issues)} terminology issues** identified across the codebase\n")
        f.write(f"2. **{len(set(issue.file_path for issue in all_issues))} files** require updates\n")
        f.write(f"3. **Zero functional changes** made in this phase (analysis only)\n\n")

        f.write("## Next Steps\n\n")
        f.write("1. ✅ **Phase 1 Complete:** Terminology analysis\n")
        f.write("2. 🚀 **Phase 2 Ready:** Core type migration\n")
        f.write("3. 📋 **Phase 3 Planned:** Implementation updates\n")
        f.write("4. 📋 **Phase 4 Planned:** API and documentation\n\n")

        f.write("## Risk Assessment\n\n")
        f.write("- **Phase 1 Risk:** ZERO (read-only analysis)\n")
        f.write("- **Phase 2 Risk:** MEDIUM (type definition changes)\n")
        f.write("- **Phase 3 Risk:** HIGH (implementation changes)\n")
        f.write("- **Phase 4 Risk:** LOW (documentation updates)\n\n")

        f.write("## Recommended Action\n\n")
        f.write("1. Review `DETAILED_ANALYSIS.md` for complete issue listing\n")
        f.write("2. Review `ACTION_PLAN.md` for migration sequence\n")
        f.write("3. Proceed to Phase 2 when ready\n\n")

        f.write("## Reports Generated\n\n")
        f.write(f"- `DETAILED_ANALYSIS.md` - Complete issue breakdown\n")
        f.write(f"- `ACTION_PLAN.md` - Step-by-step migration guide\n")
        f.write(f"- `SUMMARY.md` - This executive summary\n")

    print(f"📝 Executive summary generated: {summary_file}")

def main():
    print("\n🔍 Scanning TypeScript files...")
    ts_files = find_typescript_files()
    print(f"   Found {len(ts_files)} TypeScript files")

    print("\n🔍 Analyzing terminology usage...")
    all_issues = []
    files_with_issues = 0

    for file_path in ts_files:
        issues = analyze_file(file_path)
        if issues:
            files_with_issues += 1
            all_issues.extend(issues)
            print(f"  ⚠️  {file_path.name}: {len(issues)} issues")

    print(f"\n📊 Analysis complete!")
    print(f"   - Files scanned: {len(ts_files)}")
    print(f"   - Files with issues: {files_with_issues}")
    print(f"   - Total issues: {len(all_issues)}")

    print(f"\n📝 Generating reports...")
    generate_detailed_report(all_issues)
    generate_action_plan(all_issues)
    generate_summary(all_issues)

    print(f"\n✅ Phase 1 Analysis Complete!")
    print(f"📁 All reports saved to: {REPORT_DIR}")
    print(f"\n🔍 Next Steps:")
    print(f"   1. Review {REPORT_DIR}/SUMMARY.md")
    print(f"   2. Review {REPORT_DIR}/DETAILED_ANALYSIS.md")
    print(f"   3. Review {REPORT_DIR}/ACTION_PLAN.md")
    print(f"   4. Proceed to Phase 2 when ready")
    print(f"\n⚠️  IMPORTANT: This phase made NO code changes - analysis only!")

if __name__ == "__main__":
    main()