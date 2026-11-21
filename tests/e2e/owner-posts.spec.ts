import {test,expect} from '@playwright/test';
const fixture='http://127.0.0.1:54321';
test('owner edit/delete confirmation and immediate refresh; no controls for guests or another author',async({page,request})=>{
 test.setTimeout(60000);
 await request.post(fixture+'/__control',{data:{reset:true}});
 let edited=false,deleted=false,deleteCalls=0;
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('External request');
  if(u.pathname==='/api/posts/manage'){
   if(route.request().method()==='GET')return route.fulfill({json:{ids:[1]}});
   if(route.request().method()==='PATCH'){expect(route.request().postDataJSON().fields.comment).toBe('owner edited');edited=true;return route.fulfill({json:{ok:true}});}
   deleteCalls++;deleted=true;return route.fulfill({json:{ok:true}});
  }
  if(u.pathname==='/rest/v1/snow_posts'){
   const base={resort:'オーンズ',area:'中腹',snow_type:'パウダー',snowfall:'ほぼ無し',roughness:'きれい',crowd:'普通',created_at:'2026-11-20T00:00:00Z',updated_at:null};
   return route.fulfill({json:[...(deleted?[]:[{...base,id:1,comment:edited?'owner edited':'owner original',updated_at:edited?'2026-11-21T00:00:00Z':null}]),{...base,id:2,comment:'other author'}]});
  }
  return route.continue();
 });
 const detail='/resort/'+encodeURIComponent('オーンズ');
 await page.goto(detail);
 await expect(page.getByText('「owner original」',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'編集',exact:true})).toHaveCount(0);
 await page.goto('/login?next='+encodeURIComponent(detail));
 await page.getByLabel('メールアドレス').fill('snow@example.test');await page.getByLabel('パスワード',{exact:true}).fill('fixture-password-123');await page.getByRole('button',{name:'ログイン',exact:true}).click();
 await expect(page.getByRole('button',{name:'編集',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('textbox',{name:'コメント',exact:true}).fill('owner edited');await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByText('「owner edited」',{exact:true})).toBeVisible();await expect(page.getByText('編集済み',{exact:true})).toHaveCount(1);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'削除',exact:true}).click();expect(deleteCalls).toBe(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'削除',exact:true}).click();
 await expect(page.getByText('「owner edited」',{exact:true})).toHaveCount(0);await expect(page.getByText('「other author」',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'編集',exact:true})).toHaveCount(0);expect(deleteCalls).toBe(1);
});
