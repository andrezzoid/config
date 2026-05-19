import { describe, expect, it } from "bun:test"

import { KEEP_AWAKE_BADGE_LABEL, createKeepAwakeController, shouldShowKeepAwakeBadge } from "./keep-awake"

class FakeCaffeinate {
  killed = false
  unrefed = false
  private exitListeners: Array<() => void> = []

  kill() {
    this.killed = true
    return true
  }

  once(event: "exit", listener: () => void) {
    if (event === "exit") this.exitListeners.push(listener)
    return this
  }

  unref() {
    this.unrefed = true
    return this
  }

  exit() {
    for (const listener of this.exitListeners.splice(0)) listener()
  }
}

function createHarness() {
  const children: FakeCaffeinate[] = []
  const controller = createKeepAwakeController({
    watchedPid: 12345,
    spawnCaffeinate(pid) {
      expect(pid).toBe(12345)
      const child = new FakeCaffeinate()
      children.push(child)
      return child
    },
  })

  return { children, controller }
}

describe("createKeepAwakeController", () => {
  it("starts one caffeinate assertion for any active session", () => {
    const { children, controller } = createHarness()

    controller.setSessionStatus("session-1", "busy")
    controller.setSessionStatus("session-2", "retry")

    expect(children).toHaveLength(1)
    expect(children[0].killed).toBe(false)
    expect(children[0].unrefed).toBe(true)
  })

  it("releases caffeinate when the last active session becomes idle", () => {
    const { children, controller } = createHarness()

    controller.setSessionStatus("session-1", "busy")
    controller.setSessionStatus("session-2", "busy")
    controller.setSessionStatus("session-1", "idle")
    expect(children[0].killed).toBe(false)

    controller.setSessionStatus("session-2", "idle")

    expect(children[0].killed).toBe(true)
  })

  it("reconciles missed events from the polled session status map", () => {
    const { children, controller } = createHarness()

    controller.setSessionStatus("stale-session", "busy")
    controller.reconcileSessionStatuses({
      "current-session": { type: "busy" },
      "idle-session": { type: "idle" },
    })

    expect(children).toHaveLength(1)
    expect(children[0].killed).toBe(false)

    controller.reconcileSessionStatuses({
      "current-session": { type: "idle" },
    })

    expect(children[0].killed).toBe(true)
  })

  it("restarts caffeinate if it exits while work is still active", () => {
    const { children, controller } = createHarness()

    controller.setSessionStatus("session-1", "busy")
    children[0].exit()

    expect(children).toHaveLength(2)
    expect(children[1].killed).toBe(false)
  })

  it("disposes without restarting after the child exits", () => {
    const { children, controller } = createHarness()

    controller.setSessionStatus("session-1", "busy")
    controller.dispose()
    children[0].exit()

    expect(children).toHaveLength(1)
    expect(children[0].killed).toBe(true)
  })
})

describe("shouldShowKeepAwakeBadge", () => {
  it("uses a coffee badge label", () => {
    expect(KEEP_AWAKE_BADGE_LABEL).toBe("☕ Awake")
  })

  it("shows the badge only while a session keeps the machine awake", () => {
    expect(shouldShowKeepAwakeBadge({ type: "busy" })).toBe(true)
    expect(shouldShowKeepAwakeBadge({ type: "retry" })).toBe(true)
    expect(shouldShowKeepAwakeBadge({ type: "idle" })).toBe(false)
    expect(shouldShowKeepAwakeBadge(undefined)).toBe(false)
  })
})
