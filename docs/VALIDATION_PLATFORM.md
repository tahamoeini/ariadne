# Platform Validation

Engineering correctness and product usefulness are separate gates.

## Engineering gate

Before calling a release complete, run Rust formatting, Clippy, unit tests, concurrency and privacy tests, adapter tests, desktop build/package validation, abrupt-termination recovery, and generated-artifact inspection.

## Product gate

Compare:

1. normal OS/application history
2. Resume Brief only
3. Ariadne desktop context
4. Ariadne plus adapters
5. Ariadne plus adapters and a Resume Brief

Measure orientation time, time to meaningful continuation, repeated exploration, resources reopened before continuing, confidence, and cognitive load. Do not use event counts, hours tracked, or productivity scores as success metrics.

## Windows pilot sign-off

Before inviting pilot users, require a green Windows package build and Rust test run, then install and exercise the packaged application on a clean Windows profile. Verify Thread creation, pause/resume, policy persistence, restart recovery, Resume Brief persistence, Thread deletion, Delete All, tray/close behavior, and start-at-login behavior. Interrupt the app during a database write and confirm startup recovery does not report unsaved state as saved or recreate deleted Threads.

Inspect the installed app-data directory and logs to confirm IPC credentials are private and operational logs contain no captured URLs or content. Browser integration remains outside the pilot until its native-messaging host is packaged and exercised end to end; the current browser package is only an adapter boundary.
