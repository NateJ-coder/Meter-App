# Buildings Folder Structure

This folder is now split into three areas so the building-by-building migration outputs stay separate from the original building source material.

## Structure

- `ai-knowledgebase/`
  Finalized per-building JSON files for AI knowledge use. These should contain the full building picture, including building identity, units, meters, reading context, and any other relevant operational detail captured during migration.

- `app-database/`
  Per-building JSON files focused on app-import and historical meter data. These should prioritize buildings, units, meters, meter numbers, and historical readings needed for future capture, flagging, and audit-trail workflows.

- `buildings/`
  The organized home for the original building-specific folders and source material that already existed in this repository.

## Working Rule

When processing a building, keep the original source material under `buildings/`, then create one finalized JSON in `ai-knowledgebase/` and one app-oriented JSON in `app-database/` for that same building.