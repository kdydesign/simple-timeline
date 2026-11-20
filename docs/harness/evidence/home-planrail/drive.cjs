// Electron entry for this benchmark only. Start the stock test bundle immediately.
// The parent sends a byte only after the product's persisted ui-ready mark.
require(process.env.WORKRAIL_TEST_ENTRY)
const { app, BrowserWindow } = require('electron')

function rendererSetup() {
  const menu = name => [...document.querySelectorAll('.workrail-dock button')].find(b => b.textContent.trim() === name)
  const bar = () => document.querySelector('[data-bar="1"]')
  const editor = () => document.querySelector('.editor #editor-name')
  const close = () => document.querySelector('.editor [aria-label="편집 닫기"]')
  const hits = el => {
    if (!el || el.disabled) return null
    const rect = el.getBoundingClientRect()
    const x = Math.floor(rect.x + rect.width / 2), y = Math.floor(rect.y + rect.height / 2)
    return rect.width && rect.height && el.contains(document.elementFromPoint(x, y)) ? {x, y} : null
  }
  const state = {first: {}, roundTrip: {}}
  let stage = 'first'
  document.addEventListener('click', event => {
    if (!event.isTrusted) return
    const t = performance.now()
    const record = state[stage]
    if (!record) return
    if (menu('Home').contains(event.target)) record.homeClicked = t
    if (menu('PlanRail').contains(event.target)) record.planClicked = t
    if (bar()?.contains(event.target)) record.barClicked = t
  }, true)
  new MutationObserver(() => {
    const record = state[stage]
    if (!record) return
    if (stage === 'first' && record.barClicked && !record.editorReady &&
        editor()?.value === '측정 일정' && editor().getClientRects().length) {
      record.editorReady = performance.now()
    }
    if (stage === 'roundTrip' && record.planClicked && !record.barReady &&
        menu('PlanRail').getAttribute('aria-current') === 'page' && hits(bar())) {
      record.barReady = performance.now()
    }
  }).observe(document.body, {subtree:true, childList:true, attributes:true})
  const conditions = {
    plan: () => menu('Home')?.getAttribute('aria-current') === 'page' && hits(menu('PlanRail')),
    bar: () => menu('PlanRail')?.getAttribute('aria-current') === 'page' && hits(bar()),
    close: () => state.first.editorReady && hits(close()),
    home: () => !editor() && hits(menu('Home')),
    result: () => state.roundTrip.barReady && state,
  }
  window.benchmarkDriver = {
    wait(key) {
      return new Promise((resolve, reject) => {
        const deadline = performance.now() + 5000
        function check() {
          const value = conditions[key]()
          if (value) resolve(value)
          else if (performance.now() > deadline) reject(new Error('Timed out waiting for ' + key))
          else requestAnimationFrame(check)
        }
        check()
      })
    },
    roundTrip() { stage = 'roundTrip' },
  }
  return {selected: document.querySelector('[aria-label="선택 날짜"]')?.value, width: innerWidth, height: innerHeight,
    scale: devicePixelRatio, userAgent: navigator.userAgent, initialMenu: menu('Home')?.getAttribute('aria-current')}
}

async function drive() {
  const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))
  if (!win || !win.webContents.getLastWebPreferences().sandbox) throw Error('Expected sandboxed main window')
  const contents = win.webContents
  const evaluate = expression => contents.executeJavaScript(expression)
  const context = await evaluate('(' + rendererSetup.toString() + ')()')
  if (context.selected !== process.env.FIXTURE_DAY || context.initialMenu !== 'page') throw Error('Unexpected Home/date ' + JSON.stringify(context))
  async function click(key) {
    const {x, y} = await evaluate('window.benchmarkDriver.wait(' + JSON.stringify(key) + ')')
    for (const type of ['mouseDown','mouseUp']) contents.sendInputEvent({type, x, y, button:'left', clickCount:1})
  }
  win.focus()
  await click('plan')
  await click('bar')
  await click('close')
  await evaluate('window.benchmarkDriver.roundTrip()')
  await click('home')
  await click('plan')
  const result = await evaluate('window.benchmarkDriver.wait("result")')
  return {context, ...result}
}

process.stdin.once('data', async data => {
  try {
    const record = data.toString().trim() === 'seed' ? {} : await drive()
    process.stdout.write('BENCH_RESULT ' + JSON.stringify(record) + '\n', () => app.exit(0))
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
