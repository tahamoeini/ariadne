# RepoTrail Tester Guide

## What RepoTrail does

RepoTrail helps you resume an interrupted code investigation.

## What RepoTrail captures

- VS Code navigation/activity required by the MVP
- Git working state
- an optional checkpoint you choose to write

## What RepoTrail does not capture

- keystrokes
- clipboard
- screenshots
- terminal contents
- cloud data

## Install

1. In VS Code, run **Extensions: Install from VSIX...**
2. Select `repotrail-0.0.1.vsix`
3. If your facilitator assigned a validation mode, set **RepoTrail › Validation Mode** before you start

## Workflow

1. install RepoTrail
2. work on a real investigation
3. save explicitly with **RepoTrail: Start Investigation** or retroactively with **RepoTrail: Save Recent Activity as Investigation**
4. optionally add a checkpoint with **RepoTrail: Add or Update Checkpoint**
5. stop working
6. return after 24–72 hours
7. open **RepoTrail: Show Resume Snapshot**
8. continue the investigation

## Notes

- RepoTrail keeps its data locally on your machine.
- Different validation modes may show different amounts of context in the Resume Snapshot.
- If your assigned session is the ordinary VS Code + Git baseline, do not use RepoTrail for that session.
