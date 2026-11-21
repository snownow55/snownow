import { test, expect } from '@playwright/test';
test('production build without settings renders public pages and disables auth', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/resort/%E3%82%AA%E3%83%BC%E3%83%B3%E3%82%BA', '/login', '/signup', '/forgot-password', '/reset-password']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByText('接続設定が未完了', { exact: false })).toBeVisible();
    if (path === '/login' || path === '/signup') await expect(page.getByRole('button', { name: path === '/login' ? 'ログイン' : '新規登録', exact: true })).toBeDisabled();
  }
  await page.goto('/post');
  await expect(page.getByRole('heading', { name: '投稿にはログインが必要です' })).toBeVisible();
  const callback = await request.get('/auth/callback?code=invalid&next=https://evil.test');
  expect(callback.status()).toBe(503);
  expect(errors).toEqual([]);
});
