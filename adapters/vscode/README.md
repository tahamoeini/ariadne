# Ariadne VS Code Adapter Boundary

VS Code integration is an optional adapter surface for Ariadne, not the product core.

This directory is reserved for a thin adapter that will:

- observe permitted factual editor/workspace events
- map them to Ariadne protocol messages
- authenticate to the local Ariadne endpoint
- declare adapter capabilities and degraded states

This adapter must not own Thread lifecycle, persistence, Resume Brief state, or resume logic.

