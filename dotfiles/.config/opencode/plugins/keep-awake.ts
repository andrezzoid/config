import type { Plugin } from "@opencode-ai/plugin"

import { createKeepAwakeController } from "../lib/keep-awake"

const POLL_INTERVAL_MS = 30_000

export const KeepAwake: Plugin = async ({ client, directory }) => {
  if (process.platform !== "darwin") return {}

  const controller = createKeepAwakeController()
  let disposed = false

  const syncSessionStatuses = async () => {
    if (disposed) return

    const result = await client.session.status({ query: { directory } })
    if (result.data) controller.reconcileSessionStatuses(result.data)
  }

  const repairFromServerState = () => {
    // Polling is repair-only. If the local SDK call fails, keep the current
    // event-derived state rather than releasing an assertion during live work.
    void syncSessionStatuses().catch(() => undefined)
  }

  repairFromServerState()

  const poller = setInterval(repairFromServerState, POLL_INTERVAL_MS)
  poller.unref?.()

  const dispose = () => {
    if (disposed) return

    disposed = true
    clearInterval(poller)
    controller.dispose()
  }

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.status":
          controller.setSessionStatus(event.properties.sessionID, event.properties.status.type)
          break
        case "session.idle":
          controller.setSessionStatus(event.properties.sessionID, "idle")
          break
        case "session.deleted":
          controller.setSessionStatus(event.properties.info.id, "idle")
          break
        case "server.instance.disposed":
          if (event.properties.directory === directory) dispose()
          break
      }
    },
  }
}
