// One Vale alert on a line Claude added, as the call's transcript row draws it.
export type ProseAlert = {
  // 1-based, in the file as the edit left it.
  line: number
  // The match within `text`: 1-based, inclusive, in characters.
  start: number
  end: number
  // Vale's rule as Style.Rule, such as AiTells.Dash.
  check: string
  // Vale's message, which quotes the match.
  message: string
  // The rule's Vale level; picks the colour of the underline and the dot.
  severity: 'error' | 'warning' | 'suggestion'
  // The whole line at the time of the edit; a later edit doesn't change it.
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'prose-lint': {
      // Keyed by the Edit or Write call's tool_use_id.
      alerts: StateFamily<ProseAlert[]>
    }
  }
}
