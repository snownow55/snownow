import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT_EMAIL } from "@/lib/account-deletion";

export const metadata: Metadata = { title: "プライバシーポリシー | SNOW VIKING" };

export default function PrivacyPage() {
  return <LegalPage title="プライバシーポリシー" updatedAt="2026年11月24日">
    <p>SNOW VIKING運営（個人運営）は、本サービスの利用者情報を以下のとおり取り扱います。</p>
    <LegalSection title="1. 取得・保存する情報">
      <ul className="list-disc space-y-2 pl-5">
        <li>アカウント情報：メールアドレス、ユーザーID、メール確認状態、認証に必要な情報。パスワードはSupabaseの認証基盤で管理し、本サービスの投稿データには保存しません。</li>
        <li>投稿情報：投稿先スキー場、雪質・混雑などのコンディション、コメント、投稿日時・編集日時、投稿者との紐付けに必要なユーザーID。</li>
        <li>設定・制限情報：登録エリア、投稿制限の判定に用いる最終投稿時刻など。</li>
        <li>通信・端末情報：IPアドレス、ブラウザー・端末情報、アクセス日時、リクエストや障害に関するログ。配信・認証等の外部サービスでも処理される場合があります。</li>
        <li>お問い合わせ情報：送信元メールアドレス、お問い合わせ本文、利用者が任意に提供した情報。</li>
      </ul>
      <p className="mt-3">ブラウザーのGPS等による現在位置の取得は行っていません。登録エリアや投稿先施設は、利用者が選んだ情報です。</p>
    </LegalSection>
    <LegalSection title="2. 利用目的">
      <p>本人認証、認証メールの送信、投稿の保存・公開・編集・削除、登録エリアの共有、投稿制限、不正利用の防止、安全なサービス運営、障害調査、お問い合わせ対応、アカウント削除のために利用します。</p>
    </LegalSection>
    <LegalSection title="3. 投稿の公開範囲">
      <p>投稿先、コンディション、コメント、投稿日時・編集済み表示などは、ログインしていない人を含む他の利用者が閲覧できます。投稿本文にメールアドレス、氏名、連絡先などの個人情報を記載しないでください。アカウントのメールアドレスを投稿表示に使用することはありません。公開された情報は、第三者に保存・転載される可能性があります。</p>
    </LegalSection>
    <LegalSection title="4. Cookie等の利用">
      <p>ログイン状態の維持や認証処理のため、Cookieやブラウザーの保存領域を利用します。Cookie等を無効にすると認証などの機能を利用できない場合があります。利用状況の把握とサービス改善のため、Vercel Web Analyticsを利用します。解析用Cookieは使用しません。認証ユーザーID・メールアドレス・投稿本文を解析イベントに追加せず、閲覧URLからはクエリー文字列とハッシュを除外し、スキー場のURLは定型の区分へ置き換えます。解析データはVercelの保持方針に従い、通信基盤の運用・セキュリティログとは別に扱われます。広告配信は行っていません。</p>
    </LegalSection>
    <LegalSection title="5. 外部サービスへの委託">
      <p>Supabase（認証・DB）、Vercel（アプリの配信・実行・アクセス解析）、認証メールの配送に設定されたサービス（Resend等）を利用します。機能の提供に必要な情報を各事業者で処理します。お問い合わせメールはGmailで受信・管理します。委託先の設備等により、日本国外で処理・保存される場合があります。</p>
      <p className="mt-3">各事業者の取扱いは、<a href="https://supabase.com/privacy" className="underline text-brand">Supabase</a>、<a href="https://vercel.com/legal/privacy-policy" className="underline text-brand">Vercel</a>、<a href="https://resend.com/legal/privacy-policy" className="underline text-brand">Resend</a>、<a href="https://policies.google.com/privacy?hl=ja" className="underline text-brand">Google</a>のポリシーもご確認ください。</p>
    </LegalSection>
    <LegalSection title="6. 第三者提供と安全管理">
      <p>公開投稿、サービス提供に必要な委託、本人の同意がある場合、法令に基づく場合等を除き、個人情報を第三者へ提供しません。情報へのアクセス制御や認証・通信の保護により、不正アクセスや漏えいの防止に努めます。</p>
    </LegalSection>
    <LegalSection title="7. 保存期間とアカウント削除">
      <p>アカウント・投稿・設定等はサービス提供に必要な間保存します。日本時間0時の投稿表示リセットでは過去の投稿を削除しません。投稿者は自分の投稿を削除できます。</p>
      <p className="mt-3"><Link href="/account/delete" className="underline text-brand">アカウント削除画面</Link>で再認証・最終確認を行うと、本人の認証アカウント、過去分を含む投稿、登録エリア、投稿制限履歴を削除します。投稿の匿名化保存は行いません。バックアップや外部サービスのログは即時消去されず、各サービスの保持・更新方針に従って残る場合があります。お問い合わせ記録も対応や法令上必要な範囲で保持する場合があります。</p>
    </LegalSection>
    <LegalSection title="8. 開示・訂正・削除等のご相談">
      <p>ご自身の情報の開示・訂正・削除・利用停止等は、以下の窓口へご連絡ください。本人確認を行ったうえで、法令に従って対応します。パスワードやAPIキーをメールに記載しないでください。</p>
      <p className="mt-3">運営：SNOW VIKING運営（個人運営）</p>
      <p>連絡先：<a href={`mailto:${CONTACT_EMAIL}`} className="break-all underline text-brand">{CONTACT_EMAIL}</a></p>
    </LegalSection>
    <LegalSection title="9. ポリシーの変更">
      <p>取扱いの変更は本ページで案内します。法令上、本人の同意や追加の通知が必要な場合は、それに従って対応します。</p>
    </LegalSection>
  </LegalPage>;
}
