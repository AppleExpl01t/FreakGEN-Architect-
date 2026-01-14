---
description:
---

# Super Feature Implementation Workflow

This workflow guides the agent through a high-reliability development cycle.

## Step 1: Deep Context & Planning

**Instruction:**

1. Read the user's request.
2. Identify all relevant files using `ls -R` or specific file reads.
3. Create a **Mini-Design Document** in the chat. This must include:
   - **Goal:** One sentence summary.
   - **Changes:** List of files to create or modify.
   - **Risk Assessment:** What could break?
   - **Verification Plan:** How will we prove it works?

_Wait for user confirmation of the plan._

## Step 2: Test-Driven Spec

**Instruction:**

1. Before writing implementation code, write the **test cases** (or a reproduction script if fixing a bug).
2. If the feature is new, create a skeleton file and a corresponding test file.
3. Run the test to confirm it fails (Red phase).

## Step 3: Robust Implementation

**Instruction:**

1. Implement the solution adhering strictly to `@robustness.md`.
2. Ensure you handle the "Edge Cases" identified in Step 1.
3. Use step-by-step thinking. Do not output the full file immediately; explain your logic block by block.

## Step 4: Verification & Self-Correction

**Instruction:**

1. Run the tests created in Step 2.
2. **If tests fail:**
   - Read the error log.
   - Do NOT blindly apply a fix. Analyze _why_ it failed.
   - Fix the code and re-run tests.
3. **If tests pass:**
   - Run the project's linter/formatter.
   - Fix any styling issues.

## Step 5: Final Code Audit

**Instruction:**
Review your own changes against the **Constitution**:

- Are types strict?
- Is there a docstring?
- Are variables descriptive?

If verified, present the final file content to the user.
