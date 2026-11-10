import {test,expect} from './fixture';
test.use({seed:'hotfix'});

test('project popup stays below its button with an accessible right-aligned icon action',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});
 const trigger=p.getByRole('button',{name:'프로젝트 목록',exact:true});
 await trigger.click();
 const popup=p.getByRole('region',{name:'프로젝트 목록',exact:true});
 const action=popup.getByRole('button',{name:'프로젝트 추가',exact:true});
 await expect(action).toBeVisible();
 await expect(action).toHaveText('');
 const b=(await trigger.boundingBox())!,r=(await popup.boundingBox())!,a=(await action.boundingBox())!;
 expect(r.width).toBe(290);expect(r.height).toBe(442);
 expect(Math.abs(r.x-b.x)).toBeLessThanOrEqual(1);
 expect(r.y-b.y-b.height).toBeGreaterThanOrEqual(4);
 expect(r.y-b.y-b.height).toBeLessThanOrEqual(12);
 expect(r.x+r.width-a.x-a.width).toBeLessThanOrEqual(24);
 await action.click();
 await expect(p.getByRole('dialog',{name:'프로젝트 추가',exact:true})).toBeVisible();
 await expect(popup).toHaveCount(0);
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toBeFocused();
});

test('calendar shares toolbar glass without a second painted panel in both themes',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});
 await p.getByRole('button',{name:'달력',exact:true}).click();
 for(const theme of ['light','dark']){
  if(theme==='dark')await p.getByRole('button',{name:'다크 모드',exact:true}).click();
  const surfaces=await p.evaluate(()=>{
   const css=(s:string)=>getComputedStyle(document.querySelector(s)!);
   return {toolbar:css('.toolbar').backgroundColor,main:css('main').backgroundColor,
    calendar:css('.calendar').backgroundColor,calendarHeader:css('.calendar-top').backgroundColor,calendarBorder:css('.calendar').borderTopWidth,
    blur:getComputedStyle(document.querySelector('.toolbar')!,'::before').backdropFilter};
  });
  expect(surfaces.main).toBe(surfaces.toolbar);
  expect(surfaces.toolbar).toMatch(/^rgba\(/);
  expect(surfaces.calendar).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.calendarHeader).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.calendarBorder).toBe('0px');
  expect(surfaces.blur).not.toBe('none');
  await p.locator('[data-focus="schedule-add"]').click();
  const save=p.getByRole('button',{name:'저장',exact:true});
  await expect(save).toBeVisible();
  await expect.poll(()=>p.evaluate(()=>{
   const selectors=['.sharing-filter [aria-pressed="true"]','.editor-actions .primary','[data-focus="schedule-add"]'];
   const colors=selectors.map(s=>{const c=getComputedStyle(document.querySelector(s)!);return [c.backgroundColor,c.color,c.borderColor]});
   return colors.every(c=>JSON.stringify(c)===JSON.stringify(colors[0]));
  })).toBe(true);
  await p.getByRole('button',{name:'취소',exact:true}).click();
 }
});

test('invalid fields retain a visible error border in both themes',async({desktop:{page:p}})=>{
 for(const theme of ['light','dark']){
  if(theme==='dark')await p.getByRole('button',{name:'다크 모드',exact:true}).click();
  await p.locator('[data-focus="schedule-add"]').click();
  const name=p.getByLabel('일정 이름',{exact:true});
  const normal=await name.evaluate(el=>getComputedStyle(el).borderColor);
  await p.getByRole('button',{name:'저장',exact:true}).click();
  await expect(name).toHaveAttribute('aria-invalid','true');
  await expect.poll(()=>name.evaluate(el=>getComputedStyle(el).borderColor)).not.toBe(normal);
  await p.getByRole('button',{name:'취소',exact:true}).click();
 }
});

test('schedule text remains legible for extreme project colors in both views and themes',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});
 for(const color of ['#000000','#FFFFFF']){
  await p.evaluate(async color=>{
   const api=window.simpleTimeline,s=await api.getSnapshot();if(!s.ok)throw Error(s.error.message);
   const {id,name,participants}=s.data.projects[0];
   const r=await api.updateProject({id,name,participants,color});if(!r.ok)throw Error(r.error.message);
  },color);
  await p.reload();await p.getByLabel('선택 날짜',{exact:true}).fill('2026-12-01');await p.getByLabel('선택 날짜',{exact:true}).press('Enter');
  for(const theme of ['light','dark']){
   if(await p.locator('html').getAttribute('data-theme')!==theme)
    await p.getByRole('button',{name:theme==='light'?'라이트 모드':'다크 모드',exact:true}).click();
   for(const mode of ['간트','달력']){
    await p.getByRole('button',{name:mode,exact:true}).click();
    const bar=p.locator(mode==='간트'?'[data-bar="1"]':'[data-segment="1"]').first();
    await expect(bar).toBeVisible();
    await expect.poll(()=>bar.evaluate(el=>{
     const style=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d')!;
     const luminance=(color:string)=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const c=ctx.getImageData(0,0,1,1).data;
      return [0.2126,0.7152,0.0722].reduce((sum,w,i)=>{const v=c[i]/255;return sum+w*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)},0)};
     const [low,high]=[luminance(style.color),luminance(style.backgroundColor)].sort((a,b)=>a-b);
     return (high+.05)/(low+.05);
    })).toBeGreaterThanOrEqual(4.5);
   }
  }
 }
});
