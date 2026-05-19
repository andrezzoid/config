/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { Show } from "solid-js"

import { KEEP_AWAKE_BADGE_LABEL, shouldShowKeepAwakeBadge } from "../lib/keep-awake"

function KeepAwakeBadge(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current
  const awake = () => shouldShowKeepAwakeBadge(props.api.state.session.status(props.sessionID))

  return (
    <Show when={awake()}>
      <box flexDirection="row" paddingLeft={1}>
        <text fg={theme().warning}>{KEEP_AWAKE_BADGE_LABEL}</text>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      session_prompt_right(_ctx, props) {
        return <KeepAwakeBadge api={api} sessionID={props.session_id} />
      },
    },
  })
}

export default {
  id: "keep-awake-ui",
  tui,
} satisfies TuiPluginModule
