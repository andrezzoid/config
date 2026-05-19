import { spawn } from "node:child_process"

export type SessionWakeStatus = "busy" | "idle" | "retry"

export type SessionStatusMap = Record<string, { type: SessionWakeStatus }>

export type CaffeinateProcess = {
  kill(signal?: string | number): boolean
  once(event: "exit", listener: () => void): unknown
  unref?(): unknown
}

export type KeepAwakeControllerOptions = {
  /** PID given to `caffeinate -w`; defaults to the running opencode process. */
  watchedPid?: number
  /** Test seam for replacing the real macOS child process. */
  spawnCaffeinate?: (watchedPid: number) => CaffeinateProcess
}

/** True while opencode's session state implies an active sleep assertion. */
export function shouldShowKeepAwakeBadge(status: { type: SessionWakeStatus } | undefined) {
  return status?.type === "busy" || status?.type === "retry"
}

/**
 * Starts a macOS idle-sleep assertion tied to the opencode process lifetime.
 *
 * `-w <pid>` is the safety net: if opencode dies without giving the plugin a
 * chance to clean up, caffeinate exits as soon as that process disappears.
 */
export function spawnCaffeinateForPid(watchedPid: number): CaffeinateProcess {
  return spawn("caffeinate", ["-i", "-w", String(watchedPid)], {
    stdio: "ignore",
  })
}

/**
 * Owns the single sleep assertion for all active opencode sessions.
 *
 * Busy and retrying sessions keep the Mac awake. Idle or missing sessions do
 * not. The controller deliberately hides the child-process lifecycle so the
 * plugin only has to feed it opencode's current session state.
 */
export function createKeepAwakeController(options: KeepAwakeControllerOptions = {}) {
  const activeSessions = new Set<string>()
  const spawnCaffeinate = options.spawnCaffeinate ?? spawnCaffeinateForPid
  const watchedPid = options.watchedPid ?? process.pid
  let caffeinate: CaffeinateProcess | undefined

  function start() {
    if (caffeinate) return

    const child = spawnCaffeinate(watchedPid)
    caffeinate = child
    child.unref?.()
    child.once("exit", () => {
      if (caffeinate !== child) return

      caffeinate = undefined
      if (activeSessions.size > 0) start()
    })
  }

  function stop() {
    const child = caffeinate
    if (!child) return

    caffeinate = undefined
    child.kill()
  }

  function updateAssertion() {
    if (activeSessions.size > 0) start()
    else stop()
  }

  return {
    setSessionStatus(sessionID: string, status: SessionWakeStatus) {
      if (shouldShowKeepAwakeBadge({ type: status })) activeSessions.add(sessionID)
      else activeSessions.delete(sessionID)

      updateAssertion()
    },

    reconcileSessionStatuses(statuses: SessionStatusMap) {
      activeSessions.clear()
      for (const [sessionID, status] of Object.entries(statuses)) {
        if (shouldShowKeepAwakeBadge(status)) activeSessions.add(sessionID)
      }

      updateAssertion()
    },

    dispose() {
      activeSessions.clear()
      stop()
    },
  }
}
