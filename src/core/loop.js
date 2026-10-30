// Fixed-timestep game loop. The simulation advances in constant `step` slices;
// rendering runs once per animation frame. `advance(seconds)` steps the sim
// manually (used by tests and the debug hook) without waiting for real time.

export function createLoop({ update, render, step = 0.05, maxSteps = 10, raf, caf } = {}) {
  const req = raf || ((fn) => requestAnimationFrame(fn));
  const cancel = caf || ((id) => cancelAnimationFrame(id));
  const loop = {
    speed: 1,
    paused: false,
    frames: 0,
    simSteps: 0,
    lastFrameAt: 0,
    running: false,
    simTime: 0,
    onGap: null, // called with a gap (seconds) when a frame arrives after a long stall
    start,
    stop,
    advance,
  };
  let acc = 0;
  let last = 0;
  let id = 0;

  function frame(t) {
    if (!loop.running) return;
    id = req(frame);
    const dtReal = last ? (t - last) / 1000 : 0;
    last = t;
    loop.frames++;
    loop.lastFrameAt = t;
    // A long stall (hidden tab, laptop sleep): hand the gap to the caller to apply
    // closed-form catch-up instead of simulating hundreds of steps.
    if (dtReal > 2 && loop.onGap) {
      loop.onGap(dtReal);
    } else if (!loop.paused) {
      acc += Math.min(dtReal, step * maxSteps) * loop.speed;
      let n = 0;
      while (acc >= step && n < maxSteps) {
        update(step);
        loop.simSteps++;
        loop.simTime += step;
        acc -= step;
        n++;
      }
      if (n === maxSteps) acc = 0;
    }
    render(acc / step, dtReal);
  }

  function start() {
    if (loop.running) return;
    loop.running = true;
    last = 0;
    id = req(frame);
  }
  function stop() {
    loop.running = false;
    cancel(id);
  }
  function advance(seconds) {
    const n = Math.max(0, Math.round(seconds / step));
    for (let i = 0; i < n; i++) {
      update(step);
      loop.simSteps++;
      loop.simTime += step;
    }
  }
  return loop;
}
