import {test,expect} from './fixture';
test.use({seed:'hotfix'});

test('brand uses the P icon',async({desktop:{page:p}})=>{
 await expect(p.locator('.brand-mark img')).toBeVisible();
 await expect.poll(()=>p.locator('.brand-mark img').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
});
test('schedule paint and the composed panels transmit their backdrop',async({desktop:d})=>{
 const p=d.page;
 await p.getByLabel('선택 날짜',{exact:true}).fill('2026-12-01');await p.getByLabel('선택 날짜',{exact:true}).press('Enter');
 for(const mode of ['간트','달력']){
  await p.getByRole('button',{name:mode,exact:true}).click();
  const bar=p.locator(mode==='간트'?'[data-bar="1"]':'[data-segment="1"]').first();
  const alpha=await bar.evaluate(el=>{const ctx=document.createElement('canvas').getContext('2d')!;ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]});
  expect(alpha).toBeGreaterThan(0);expect(alpha).toBeLessThan(255);
 }
 await p.getByRole('button',{name:'간트',exact:true}).click();
 for(const theme of ['light','dark']){
  if(theme==='dark')await p.getByRole('button',{name:'다크 모드',exact:true}).click();
  const b=(await p.locator('.gantt-track').first().boundingBox())!;
  const values:number[]=[];
  for(const color of ['#000000','#FFFFFF']){
   await p.evaluate(c=>{document.body.style.background=c},color);
   const png=await p.screenshot({clip:{x:Math.floor(b.x+80),y:Math.floor(b.y+b.height/2),width:1,height:1}});
   values.push(await d.app.evaluate(({nativeImage},bytes)=>nativeImage.createFromBuffer(Buffer.from(bytes)).toBitmap()[1],Array.from(png)));
  }
  // A painted-over body would produce the same pixel for both underlays.
  expect(values[1]-values[0]).toBeGreaterThan(20);
 }
});

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

test('schedule text remains legible for extreme project colors in both views and themes',async({desktop:d})=>{
 const p=d.page;
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
    // Read the composited pixels: CSS backgroundColor alone now has alpha and
    // cannot describe contrast against the glass panel beneath the bar.
    await expect.poll(async()=>{
     const fg=await bar.evaluate(el=>{const ctx=document.createElement('canvas').getContext('2d')!;ctx.fillStyle=getComputedStyle(el).color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)});
     const b=(await bar.boundingBox())!;
     const png=await p.screenshot({clip:{x:Math.floor(b.x+b.width-16),y:Math.floor(b.y+b.height/2),width:1,height:1}});
     const bg=await d.app.evaluate(({nativeImage},bytes)=>Array.from(nativeImage.createFromBuffer(Buffer.from(bytes)).toBitmap().subarray(0,3)).reverse(),Array.from(png));
     const luminance=(c:number[])=>[.2126,.7152,.0722].reduce((sum,w,i)=>{const v=c[i]/255;return sum+w*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)},0);
     const [low,high]=[luminance(fg),luminance(bg)].sort((a,b)=>a-b);
     return (high+.05)/(low+.05);
    }).toBeGreaterThanOrEqual(4.5);
   }
  }
 }
});
