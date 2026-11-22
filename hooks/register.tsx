import type { Register } from 'claude-code'

import { Pond } from './pond'

const KEY = 'pond'
const ROWS = 9
const FRAME_MS = 66

export const register: Register = (on, options) => {
  const pond = new Pond(options.avoidOverlap !== false)
  let site: string | undefined
  let columns = 0
  let rows = 0
  let isVisible = true
  let isPainting = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'koi', description: 'Show or hide the koi pond above the prompt' })

    $.clock.every(FRAME_MS, async () => {
      if (!isVisible || site === undefined || columns === 0 || isPainting) {
        return
      }
      isPainting = true
      try {
        const result = await $.ui.blit({ requestId: site, key: KEY, cells: pond.render(), columns, rows })
        if ('deny' in result) {
          site = undefined
          $.ui.invalidate('ui.render')
        }
      } finally {
        isPainting = false
      }
    })

    return next(e)
  })

  on('command.run', { command: 'koi' }, async $ => {
    isVisible = !isVisible
    $.ui.invalidate('ui.render')

    return { text: isVisible ? 'Koi pond shown.' : 'Koi pond hidden.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !isVisible) {
      site = undefined
      return next(e)
    }
    if (e.props.isCollapsed) {
      site = undefined
    } else {
      site = e.requestId
    }
    columns = Math.max(20, Math.min(512, e.props.bodyColumns))
    rows = Math.max(3, Math.min(ROWS, e.props.maxRows))
    pond.resize(columns, rows)

    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box>
        <Raster key={KEY} columns={columns} rows={rows} cells={pond.render()} />
      </Box>
    )
  })
}
