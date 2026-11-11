import { test, expect } from './fixture';
import type { Locator, Page } from 'playwright';
const background = (el: Locator) => el.evaluate(e => getComputedStyle(e).backgroundColor);
async function november(p: Page) {
  await p.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await p.getByLabel('선택 날짜', { exact: true }).fill('2026-11-01');
  await p.getByLabel('선택 날짜', { exact: true }).press('Enter');
}
test.use({ seed: 'hotfix' });
test('compact project groups keep labels and bars inside their rows through collapse', async ({ desktop: d }) => {
  const p = d.page; await november(p);
  const project = p.locator('[data-row="project:1"]');
  const schedule = p.locator('[data-row="schedule:1"]');
  const nextProject = p.locator('[data-row="project:2"]');
  const pb = (await project.boundingBox())!, sb = (await schedule.boundingBox())!;
  const nb = (await nextProject.boundingBox())!;
  // A project plus three two-line schedules fits the compact group budget.
  expect(nb.y - pb.y).toBeLessThanOrEqual(168);
  expect(pb.height).toBeGreaterThan(sb.height);
  expect(Math.abs(sb.y - pb.y - pb.height)).toBeLessThan(1);
  for (const row of [project, schedule, nextProject]) {
    const bounds = (await row.boundingBox())!;
    for (const child of await row.locator('.text-button, small:not(:empty), .gantt-bar, .row-add').all()) {
      const b = (await child.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(bounds.y + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(bounds.y + bounds.height - 1);
    }
  }
  await project.getByRole('button', { name: '1.1.1 핫픽스 접기', exact: true }).click();
  await expect(schedule).toHaveCount(0);
  expect(Math.abs((await nextProject.boundingBox())!.y - pb.y - pb.height)).toBeLessThan(1);
  await project.getByRole('button', { name: '1.1.1 핫픽스 펼치기', exact: true }).click();
  await expect(schedule).toBeVisible();
  expect(Math.abs((await nextProject.boundingBox())!.y - nb.y)).toBeLessThan(1);
  await schedule.getByRole('button', { name: '개발 편집', exact: true }).click();
  await expect(p.getByLabel('일정 이름', { exact: true })).toHaveValue('개발');
});
test('empty project guidance belongs to project metadata and month input keeps its accessible name', async ({ desktop: d }) => {
  const p = d.page; await november(p);
  await expect(p.locator('header')).not.toContainText('선택 날짜');
  await expect(p.getByLabel('선택 날짜', { exact: true })).toHaveValue('2026-11-01');
  await expect(p.locator('[data-row="project:2"] .gantt-name .empty-row')).toHaveText('일정 없음');
  await expect(p.locator('[data-row="project:2"] .gantt-track')).not.toContainText('일정 없음');
});
test('today and hovered dates remain distinguishable in both views', async ({ desktop: d }) => {
  const p = d.page; await p.setViewportSize({ width: 1440, height: 900 }); await november(p);
  for (const theme of ['dark']) {

    await p.getByRole('button', { name: '간트', exact: true }).click();
    const today = p.locator('[data-day="2026-11-04"]');
    await expect(today).toHaveAttribute('aria-current', 'date');
    // The date attribute changes before the 100ms background transition paints.
    // Assert the visible highlight before sampling it for comparison with hover.
    await expect(today).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
