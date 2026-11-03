import { test, expect } from './fixture'
test('renderer has no Node/raw IPC and malformed inputs never reach storage', async ({
  desktop: d,
}) => {
  const shape = await d.page.evaluate(() => ({
    node: typeof (window as unknown as { require: unknown }).require,
    keys: Object.keys(window.simpleTimeline),
  }))
  expect(shape.node).toBe('undefined')
  expect(shape.keys).toHaveLength(8)
  expect(shape.keys).not.toContain('invoke')
  const invalid = await d.page.evaluate(() =>
    window.simpleTimeline.createProject({
      name: 'P',
      color: '#2563EB',
      participants: [],
      sql: 'DROP',
    } as never),
  )
  expect(invalid).toMatchObject({
    ok: false,
    error: { code: 'VALIDATION_ERROR' },
  })
  expect(
    await d.page.evaluate(() => window.simpleTimeline.getSnapshot()),
  ).toEqual({ ok: true, data: { projects: [], schedules: [] } })
  const child = await d.page.evaluate(() => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    return typeof (
      frame.contentWindow as unknown as { simpleTimeline: unknown }
    ).simpleTimeline
  })
  expect(child).toBe('undefined')
  const old = d.page.url()
  const attempt = d.app.evaluate(
    ({ BrowserWindow }) =>
      new Promise((resolve) =>
        BrowserWindow.getAllWindows()[0].webContents.once(
          'will-navigate',
          (_event, url) => resolve(url),
        ),
      ),
  )
  await d.page.evaluate(() => location.assign('https://example.com/'))
  await attempt
  expect(d.page.url()).toBe(old)
})
