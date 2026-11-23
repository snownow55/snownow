import Link from "next/link";

export function AppFooter() {
  return <footer className="mt-auto border-t border-brand/15 bg-white px-4 py-5 text-sm text-brand">
    <nav aria-label="サービスについて" className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-2">
      <Link className="inline-flex min-h-11 items-center underline" href="/terms">利用規約</Link>
      <Link className="inline-flex min-h-11 items-center underline" href="/privacy">プライバシーポリシー</Link>
      <Link className="inline-flex min-h-11 items-center underline" href="/contact">お問い合わせ</Link>
      <Link className="inline-flex min-h-11 items-center underline" href="/account/delete">アカウントの削除はこちら</Link>
    </nav>
  </footer>;
}
