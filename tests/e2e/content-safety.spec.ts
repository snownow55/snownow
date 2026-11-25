import {test,expect} from '@playwright/test';
const fixture='http://127.0.0.1:54321';
// Browser contract test only. Authentication and moderation RPCs are local fixtures,
// NOT evidence that the hosted Supabase authentication/RLS test has passed.
test('content safety UI: failure, confirmation, account-scoped counts, logout and unblock',async({page,request})=>{
 test.setTimeout(90000);await request.post(fixture+'/__control',{data:{reset:true}});
 let blocked=false,reportFails=true,reports=0,blocks=0;
 const blockId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('External request forbidden in fixture test');
  if(url.pathname==='/api/posts/manage')return route.fulfill({json:{ids:[1]}});
  if(url.pathname==='/rest/v1/rpc/report_snow_post'){
   reports++;expect(req.postDataJSON()).toEqual({p_post:2,p_reason:'spam'});
   return reportFails?route.fulfill({status:400,json:{code:'22023',message:'Synthetic failure'}}):route.fulfill({json:true});
  }
  if(url.pathname==='/rest/v1/rpc/block_snow_post_author'){
   blocks++;expect(req.postDataJSON()).toEqual({p_post:2});blocked=true;return route.fulfill({json:true});
  }
  if(url.pathname==='/rest/v1/rpc/my_blocked_authors')return route.fulfill({json:blocked?[{block_id:blockId,created_at:'2026-11-25T01:00:00Z'}]:[]});
  if(url.pathname==='/rest/v1/rpc/unblock_snow_author'){
   expect(req.postDataJSON()).toEqual({p_block:blockId});blocked=false;return route.fulfill({json:true});
  }
  if(url.pathname==='/rest/v1/snow_posts'){
   const authenticated=(req.headers().authorization??'').startsWith('Bearer ey');
   const hidden=blocked&&authenticated;
   const resort=url.searchParams.get('resort');
   const data=hidden||(resort&&resort!=='eq.オーンズ')?[]:[{id:2,resort:'オーンズ',area:'中腹',snow_type:'パウダー',snowfall:'ほぼ無し',roughness:'きれい',crowd:'普通',comment:'安全機能UIテスト',created_at:new Date().toISOString(),updated_at:null}];
   return route.fulfill({json:data,headers:{'Content-Range':data.length?'0-0/1':'*/0','Access-Control-Expose-Headers':'Content-Range','Access-Control-Allow-Origin':'http://127.0.0.1:3100'}});
  }
  return route.continue();
 });
 const detail='/resort/'+encodeURIComponent('オーンズ');
 const signIn=async()=>{await page.goto('/login?next='+encodeURIComponent(detail));await page.getByLabel('メールアドレス').fill('snow@example.test');await page.getByLabel('パスワード',{exact:true}).fill('fixture-password-123');await page.getByRole('button',{name:'ログイン',exact:true}).click();await expect(page.getByText('「安全機能UIテスト」',{exact:true})).toBeVisible();};
 await signIn();
 await page.getByRole('combobox',{name:'通報理由'}).selectOption('spam');await page.getByRole('button',{name:'この投稿を通報',exact:true}).click();
 await expect(page.getByText('操作できませんでした。メール認証・接続状態を確認してください。',{exact:true})).toBeVisible();expect(reports).toBe(1);
 reportFails=false;await page.getByRole('button',{name:'この投稿を通報',exact:true}).click();await expect(page.getByText('通報を受け付けました。運営が確認します。',{exact:true})).toBeVisible();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'この投稿者をブロック',exact:true}).click();expect(blocks).toBe(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'この投稿者をブロック',exact:true}).click();await expect(page.getByText('「安全機能UIテスト」',{exact:true})).toHaveCount(0);expect(blocks).toBe(1);
 await page.goto('/?region=sapporo&tab=live');const card=page.getByRole('article',{name:'スノークルーズオーンズ',exact:true});await expect(card.getByText('現地投稿なし',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ログアウト',exact:true}).click();await expect(card.getByText('最新投稿 1件',{exact:true})).toBeVisible();
 await page.goto('/login?next=%2Fsettings');await page.getByLabel('メールアドレス').fill('snow@example.test');await page.getByLabel('パスワード',{exact:true}).fill('fixture-password-123');await page.getByRole('button',{name:'ログイン',exact:true}).click();
 await expect(page.getByRole('button',{name:'解除',exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'解除',exact:true}).click();await expect(page.getByText('ブロックした投稿者はいません。',{exact:true})).toBeVisible();
 await page.goto(detail);await expect(page.getByText('「安全機能UIテスト」',{exact:true})).toBeVisible();expect(reports).toBe(2);
});
