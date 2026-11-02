// Windows GUI processes may see immediate stdin EOF despite a live pipe owner.
// Watch the explicitly identified launcher instead of using stdin as a lifetime signal.
export function watchLauncher(parentPid, onExit, { probe = pid => process.kill(pid, 0), interval = 1000 } = {}) {
  if (!Number.isSafeInteger(parentPid) || parentPid <= 0) throw new Error('Invalid Misaki launcher PID');
  let stopped = false;
  const stop = () => { stopped = true; clearInterval(timer); };
  const timer = setInterval(() => {
    if (stopped) return;
    try { probe(parentPid); }
    catch (error) {
      // Permission errors do not establish that the process has exited.
      if (error?.code === 'ESRCH') { stop(); onExit(); }
    }
  }, interval);
  timer.unref();
  return stop;
}
