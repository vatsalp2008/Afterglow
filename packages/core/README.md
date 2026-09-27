# @afterglow/core

Pure TypeScript for the drawing pipeline: coordinate spaces, signal filters, the pinch gesture state machine, stroke building, undo/redo history, and the timelapse timeline.

Nothing here touches the DOM, reads a clock, or uses randomness. Time and ids are always passed in, so the same code runs in Node, a browser, or a worker, and every behavior can be tested deterministically. The package's tsconfig has no DOM types, and lint rules ban clock and randomness APIs here.
