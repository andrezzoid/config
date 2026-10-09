import { expect, test } from 'claude-code/testing'

const alert = (Line: number, Match: string) => ({
  Check: 'AiTells.Adverb',
  Line,
  Span: [1, Match.length],
  Message: `Filler adverb '${Match}': let the verb carry it.`,
  Severity: 'suggestion',
  Match,
})

const vale = (alerts: unknown[], exitCode = 0, stderr = '') => ({
  value: {
    exitCode,
    stdout: exitCode > 1 ? '' : JSON.stringify(alerts.length ? { x: alerts } : {}),
    stderr,
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

const dir = { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }

const editRecord = {
  filePath: '/repo/README.md',
  oldString: 'old',
  newString: 'just a test',
  originalFile: 'a\nold\njust an old line\n',
  // Line 2 replaced; line 3 is context the edit didn't touch.
  structuredPatch: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, lines: [' a', '-old', '+just a test', ' just an old line'] }],
  userModified: false,
  replaceAll: false,
}

// First, in case the module's sync state outlives a test.
test('missing styles are synced before the first lint', async ($, on) => {
  const calls: string[] = []
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('process.run', (_, e) => {
    calls.push(e.argv.includes('sync') ? 'sync' : 'lint')
    return vale([alert(2, 'just')])
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: editRecord }))

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'old', new_string: 'just a test' })

  expect(calls).toEqual(['sync', 'lint'])
  expect(ran.context?.[0]).toContain('- 2:1')
})

test('an Edit hands Claude the alerts on the lines it added, not the ones already there', async ($, on) => {
  on('fs.stat', () => dir)
  on('process.run', () => vale([alert(2, 'just'), alert(3, 'just')]))
  on('tool.call', { tool: 'Edit' }, () => ({ result: editRecord }))

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'old', new_string: 'just a test' })

  expect(ran.context?.length).toBe(1)
  expect(ran.context?.[0]).toContain("- 2:1 AiTells.Adverb: Filler adverb 'just'")
  expect(ran.context?.[0]).not.toContain('- 3:1')
})

test('a Write of a new file hands Claude every alert', async ($, on) => {
  on('fs.stat', () => dir)
  on('process.run', () => vale([alert(1, 'just'), alert(7, 'really')], 1))
  on('tool.call', { tool: 'Write' }, () => ({
    result: { type: 'create', filePath: '/repo/notes.md', content: '...', structuredPatch: [], originalFile: null },
  }))

  const ran = await $.tool.call({ tool: 'Write', file_path: '/repo/notes.md', content: '...' })

  expect(ran.context?.[0]).toContain('- 1:1')
  expect(ran.context?.[0]).toContain('- 7:1')
})

test('vale runs with the bundled config', async ($, on) => {
  let argv: readonly string[] = []
  on('fs.stat', () => dir)
  on('process.run', (_, e) => {
    argv = e.argv
    return vale([])
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: editRecord }))

  await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'old', new_string: 'just a test' })

  expect(argv.join(' ')).toMatch(/--config \S*\/prose-lint\/vale\/\.vale\.ini /)
})

test('/prose-lint lists every alert of the files it names', async ($, on) => {
  on('fs.stat', () => dir)
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({ 'README.md': [alert(3, 'just'), alert(1, 'really')], 'notes.md': [alert(2, 'very')] }),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  const ran = await $.command.run({
    command: 'prose-lint',
    args: 'README.md notes.md',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  expect(ran.text).toContain('prose-lint · 3 tells in 2 files')
  expect(ran.text).toMatch(/`README.md`\n- 1:1 .*\n- 3:1 /)
  expect(ran.text).toContain('`notes.md`')
})

test('a vale failure leaves the result alone', async ($, on) => {
  on('fs.stat', () => dir)
  on('process.run', () => vale([], 2, 'E100 [loadConfig] Runtime error'))
  on('tool.call', { tool: 'Edit' }, () => ({ result: editRecord }))

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'old', new_string: 'just a test' })

  expect(ran.context).toBeUndefined()
})
