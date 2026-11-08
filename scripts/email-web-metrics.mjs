// Test-only instrumentation, loaded into the disposable production-build web process.
import { monitorEventLoopDelay } from "node:perf_hooks";
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
const timer = setInterval(() => {
  process.send?.({
    kind: "email-test-web-metrics",
    rss: process.memoryUsage().rss,
    cpu: process.cpuUsage(),
    loopP95Ms: delay.percentile(95) / 1e6,
  });
  delay.reset();
}, 1000);
timer.unref();
