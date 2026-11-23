import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT_EMAIL } from "@/lib/account-deletion";

export const metadata: Metadata = { title: "お問い合わせ | SNOW VIKING" };

export default function ContactPage() {
  return <LegalPage title="お問い合わせ">
    <p>不具合、不適切な投稿、掲載情報や個人情報の取扱いに関するご相談は、SNOW VIKING運営（個人運営）へメールでお知らせください。</p>
    <LegalSection title="メールでのお問い合わせ">
      <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("SNOW VIKINGのお問い合わせ")}`}
        className="inline-flex min-h-11 max-w-full items-center break-all underline text-brand">{CONTACT_EMAIL}</a>
      <p className="mt-3">メールアプリが開かない場合は、上記アドレスをコピーして送信してください。個人運営のため、回答に時間がかかる場合があります。</p>
    </LegalSection>
    <LegalSection title="お知らせいただきたい内容">
      <ul className="list-disc space-y-2 pl-5">
        <li>発生日時、対象ページのURL、スキー場名</li>
        <li>操作内容と表示されたエラー、端末・ブラウザー</li>
        <li>投稿に関するご相談では、対象投稿の日時と内容が分かる情報</li>
      </ul>
      <p className="mt-3">パスワード、APIキー、認証メールのリンクや確認コードは送らないでください。画像を添える場合は、ご自身や第三者の個人情報を伏せてください。</p>
    </LegalSection>
    <LegalSection title="アカウントの削除">
      <p><Link href="/account/delete" className="underline text-brand">アカウントの削除はこちら</Link>から、現在のパスワードで本人確認して手続きできます。リンクを開いただけでは削除されません。ログインできない場合や手続きに失敗した場合は、メールでご相談ください。</p>
    </LegalSection>
    <p>本窓口は緊急通報やスキー場への営業状況の問い合わせ窓口ではありません。現地の安全・営業状況は施設の公式案内をご確認ください。</p>
  </LegalPage>;
}
