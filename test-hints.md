# Test Hints — CareerPilot

## Purpose

This file provides Cowork (running on macOS VM) with verification steps for features in CareerPilot. When a Discord update appears in #careerpilot-updates, Cowork should:

1. Read the Discord message for the Jira ticket ID and summary
2. Query Jira via MCP for full ticket context
3. Find the matching feature section below
4. Follow the verification steps
5. Report results back to #careerpilot-updates (pass/fail with details)

## Access

- **Dashboard URL:** http://<host-ip>:3000
- **Project files:** /Volumes/VMware Shared Folders/Projects/CareerPilot
- **Jira project:** CAR

## Features

### Dashboard — General

- Navigate to the dashboard
- Page loads without console errors
- Layout renders correctly with no overlapping elements
- Navigation links are functional

### Dashboard — Filters

- Verify each filter dropdown populates with options
- Select a filter and confirm the displayed results update accordingly
- Clear filters and confirm full results return
- Expected: archived jobs should never appear in filtered results

### Dashboard — Job Listings Display

- Verify job cards display source labels (Indeed, Dice, etc.)
- Verify timestamps are present and formatted
- Verify no duplicate listings appear for the same position/company
- Click a job card and confirm detail view loads

### Job Scan

- Check the last scan timestamp on the dashboard
- If a scan can be triggered from UI, trigger it and verify completion
- Confirm new listings appear with correct source labels
- Verify scan does not create duplicate entries

### Supabase / Data Integrity

- Verify RLS policies are enforced (unauthenticated access should be blocked)
- Confirm data loads for the authenticated user only
- Check that API calls return expected response codes (200, not 500)

### Authentication

- Verify login flow works end to end
- Verify protected routes redirect to login when unauthenticated
- Verify session persists across page refreshes
