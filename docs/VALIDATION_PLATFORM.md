# Platform Validation

Engineering correctness and product usefulness are separate gates.

## Engineering gate

Before calling the Windows milestone complete, run Rust formatting, Clippy, unit tests, migration tests, concurrency tests, privacy tests, adapter tests, a Windows package build, abrupt-termination recovery, and generated-artifact inspection.

## Product gate

Compare:

1. normal OS/application history
2. checkpoint only
3. Ariadne desktop context
4. Ariadne plus adapters
5. Ariadne plus adapters and a checkpoint

Measure orientation time, time to meaningful continuation, repeated exploration, resources reopened before continuing, confidence, and cognitive load. Do not use event counts, hours tracked, or productivity scores as success metrics.
