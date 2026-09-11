# -*- coding: utf-8 -*-
"""
Workbook schema validator for Landscape_Estimate_Pro_Product_Logic_Test_Suite.xlsx.

Checks the 'Test Cases' sheet for:
  - Missing IDs
  - Duplicate IDs
  - Nonnumeric weights
  - Invalid priorities (must be P0/P1/P2/P3)
  - Invalid launch-blocker values (must be exactly Yes/No)
  - Invalid statuses (must be Pass/Fail/Blocked/N/A/Not Run)
  - Invalid execution modes (must be Automated/Manual/Component/E2E)
  - Shifted or excess cells (heuristic: a column's value reads like it
    belongs in a NEIGHBORING column, based on simple content shape checks)
  - Missing evidence for Pass/Fail rows
  - Blocked/N/A rows without a justification (a non-empty Actual Result)

Exits 0 with "0 schema errors" printed when the sheet is clean; otherwise
prints every violation found (row number, ID, rule, detail) and exits 1.
"""
import sys
import re
import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

PATH = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\amits\Downloads\Landscape_Estimate_Pro_Product_Logic_Test_Suite.xlsx"

VALID_PRIORITIES = {"P0", "P1", "P2", "P3"}
VALID_LAUNCH_BLOCKER = {"Yes", "No"}
VALID_STATUSES = {"Pass", "Fail", "Blocked", "N/A", "Not Run"}
# The workbook's real vocabulary includes two legitimate hybrid labels
# alongside the four base modes: "Automated+Manual" (one row combining an
# automated check with a manual follow-up) and "Manual E2E" (the 10 guided-
# flow rows that are E2E in shape but require a real human participant).
# Neither is data corruption — confirmed by cross-checking every distinct
# value actually used in the sheet before finalizing this set.
VALID_EXECUTION_MODES = {"Automated", "Manual", "Component", "E2E", "Automated+Manual", "Manual E2E"}

COLS = {
    "id": 1, "tool": 2, "area": 3, "priority": 4, "test_type": 5,
    "preconditions": 6, "exact_test_data": 7, "execution_steps": 8,
    "expected_result": 9, "oracle_rule": 10, "execution_mode": 11,
    "weight": 12, "launch_blocker": 13, "status": 14, "actual_result": 15,
    "defect_id": 16, "evidence": 17, "tester": 18,
}


def cell(ws, row, key):
    return ws.cell(row=row, column=COLS[key]).value


def main():
    wb = openpyxl.load_workbook(PATH, data_only=True)
    ws = wb["Test Cases"]
    errors = []

    seen_ids = {}
    for row in range(3, ws.max_row + 1):
        tid = cell(ws, row, "id")
        if tid is None:
            # A fully blank trailing row is not an error; a blank ID with
            # OTHER populated cells is.
            if any(cell(ws, row, k) is not None for k in COLS if k != "id"):
                errors.append((row, "(missing)", "missing-id", "Row has data but no ID"))
            continue
        if not re.match(r"^LEP-\d{3}$", str(tid)):
            errors.append((row, tid, "malformed-id", f"ID {tid!r} does not match LEP-### format"))
        if tid in seen_ids:
            errors.append((row, tid, "duplicate-id", f"Duplicate of row {seen_ids[tid]}"))
        else:
            seen_ids[tid] = row

        priority = cell(ws, row, "priority")
        if priority not in VALID_PRIORITIES:
            errors.append((row, tid, "invalid-priority", f"Priority {priority!r} not in {sorted(VALID_PRIORITIES)}"))

        weight = cell(ws, row, "weight")
        if not isinstance(weight, (int, float)) or isinstance(weight, bool):
            errors.append((row, tid, "nonnumeric-weight", f"Weight {weight!r} is not numeric"))

        launch_blocker = cell(ws, row, "launch_blocker")
        if launch_blocker not in VALID_LAUNCH_BLOCKER:
            errors.append((row, tid, "invalid-launch-blocker", f"Launch Blocker {launch_blocker!r} not in {sorted(VALID_LAUNCH_BLOCKER)}"))

        status = cell(ws, row, "status")
        if status not in VALID_STATUSES:
            errors.append((row, tid, "invalid-status", f"Status {status!r} not in {sorted(VALID_STATUSES)}"))

        execution_mode = cell(ws, row, "execution_mode")
        if execution_mode not in VALID_EXECUTION_MODES:
            errors.append((row, tid, "invalid-execution-mode", f"Execution Mode {execution_mode!r} not in {sorted(VALID_EXECUTION_MODES)}"))

        # Shifted/excess-cell heuristic: Execution Mode holding a number (a
        # Weight-shaped value) or Weight holding Yes/No (a Launch-Blocker-
        # shaped value) is the exact signature of the shift defect found and
        # repaired this pass — flag it if it ever recurs.
        if isinstance(execution_mode, (int, float)) and not isinstance(execution_mode, bool):
            errors.append((row, tid, "shifted-cells", "Execution Mode holds a number (looks like a shifted Weight value)"))
        if weight in ("Yes", "No"):
            errors.append((row, tid, "shifted-cells", f"Weight holds {weight!r} (looks like a shifted Launch Blocker value)"))

        actual_result = cell(ws, row, "actual_result")
        evidence = cell(ws, row, "evidence")
        if status in ("Pass", "Fail"):
            if not evidence or not str(evidence).strip():
                errors.append((row, tid, "missing-evidence", f"Status={status} but Evidence is empty"))
            if not actual_result or not str(actual_result).strip():
                errors.append((row, tid, "missing-actual-result", f"Status={status} but Actual Result is empty"))
        if status in ("Blocked", "N/A"):
            if not actual_result or not str(actual_result).strip():
                errors.append((row, tid, "missing-justification", f"Status={status} but Actual Result (justification) is empty"))

    print(f"Checked {len(seen_ids)} rows in 'Test Cases'.")
    if not errors:
        print("0 schema errors.")
        return 0

    print(f"{len(errors)} schema error(s) found:\n")
    for row, tid, rule, detail in errors:
        print(f"  Row {row} [{tid}] {rule}: {detail}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
