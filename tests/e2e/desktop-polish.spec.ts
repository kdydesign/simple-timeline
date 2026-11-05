import { test, expect } from './fixture';
import type { Locator, Page } from 'playwright';
const background = (el: Locator) => el.evaluate(e => getComputedStyle(e).backgroundColor);
async function november(p: Page) {
  await p.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await p.getByLabel('선택 연월', { exact: true }).fill('2026-11');
  await p.getByLabel('선택 연월', { exact: true }).press('Enter');
}
test.use({ seed: 'hotfix' });
test('empty project guidance belongs to project metadata and month input keeps its accessible name', async ({ desktop: d }) => {
  const p = d.page; await november(p);
  await expect(p.locator('header')).not.toContainText('선택 연월');
  await expect(p.getByLabel('선택 연월', { exact: true })).toHaveValue('2026-11');
  await expect(p.locator('[data-row="project:2"] .gantt-name .empty-row')).toHaveText('일정 없음');
  await expect(p.locator('[data-row="project:2"] .gantt-track')).not.toContainText('일정 없음');
});
test('today and hovered dates remain distinguishable in both views and themes', async ({ desktop: d }) => {
  const p = d.page; await p.setViewportSize({ width: 1440, height: 900 }); await november(p);
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await p.getByRole('button', { name: '다크 모드', exact: true }).click();
    await p.getByRole('button', { name: '간트', exact: true }).click();
    const today = p.locator('[data-day="2026-11-04"]');
    await expect(today).toHaveAttribute('aria-current', 'date');
    const todayColor = await background(today);
    await p.locator('[data-day="2026-11-05"]').hover();
    const hoveredTick = p.locator('[data-day="2026-11-05"]');
    await expect(hoveredTick).toHaveClass(/date-hovered/);
    expect(await hoveredTick.evaluate(e => getComputedStyle(e).boxShadow)).not.toBe('none');
    const hoverColor = await background(hoveredTick);
    expect(hoverColor).not.toBe(todayColor);
    const highlight = p.locator('[data-row="project:1"] .date-highlight.today');
    const tickBox = (await today.boundingBox())!;
    const highlightBox = (await highlight.boundingBox())!;
    expect(Math.abs(tickBox.x - highlightBox.x)).toBeLessThan(1);
    expect(highlightBox.width).toBe(28);
    await expect(p.locator('[data-row="project:1"] .date-highlight.hovered')).toBeVisible();
    await p.getByRole('button', { name: '달력', exact: true }).click();
    const cell = p.locator('[data-date="2026-11-04"]');
    await expect(cell).toHaveAttribute('aria-current', 'date');
    expect(await background(cell)).not.toBe(await background(p.locator('[data-date="2026-11-03"]')));
    // A bar intercepts pointer events; the date beneath it must still highlight.
    const bar = p.locator('[data-segment="1"]').first();
    const b = (await bar.boundingBox())!;
    await p.mouse.move(b.x + 15, b.y + b.height / 2);
    const hoveredCell = p.locator('[data-date="2026-11-11"]');
    await expect(hoveredCell).toHaveClass(/date-hovered/);
    const barTint = await hoveredCell.evaluate(e => [getComputedStyle(e).backgroundColor, getComputedStyle(e).boxShadow]);
    await hoveredCell.hover({ position: { x: 15, y: 15 } });
    expect(await hoveredCell.evaluate(e => [getComputedStyle(e).backgroundColor, getComputedStyle(e).boxShadow])).toEqual(barTint);
    await p.mouse.wheel(0, 100);
    await expect(p.locator('.calendar .date-hovered')).toHaveCount(0);
    await p.getByRole('heading', { name: 'Planrail' }).hover();
    await expect(p.locator('.calendar .date-hovered')).toHaveCount(0);
  }
});
test('calendar title, navigation and weekdays stick together and navigation still works', async ({ desktop: d }) => {
  const p = d.page; await november(p);
  await p.setViewportSize({ width: 1280, height: 600 });
  await p.getByRole('button', { name: '달력', exact: true }).click();
  await p.locator('main').evaluate(e => { e.scrollTop = 350; });
  const main = (await p.locator('main').boundingBox())!;
  const heading = (await p.locator('.calendar .view-heading').boundingBox())!;
  const weekdays = (await p.locator('.weekdays').boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(main.y);
  expect(weekdays.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1);
  await p.locator('.calendar').getByRole('button', { name: '달력 다음 달', exact: true }).click();
  await expect(p.locator('.calendar h2')).toHaveText('2026-12 월간 달력');
});
