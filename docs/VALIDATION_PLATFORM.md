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
