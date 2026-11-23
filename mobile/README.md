# SNOW VIKING iOS client

Status: bundled client builds and unsigned iOS project generation are implemented. Xcode compilation, signing, real iPhone authentication and App Store review are NOT verified. No production API/Auth/DB setting has been changed.

## Architecture

- Capacitor 8 serves `mobile/dist` from `capacitor://localhost`; no `server.url` loads the website.
- Vite compiles existing React pages (list/detail/post/settings/legal) with small Next navigation/image/link adapters. Web builds keep their original Next implementation.
- Supabase public credentials only. On iOS session/PKCE values use the secure-storage plugin's Keychain backend; the Windows browser preview uses sessionStorage. No management key is allowed in client builds.
- Existing Vercel APIs remain server-side. The native client sends its user's bearer token over HTTPS to `https://snowviking.jp`. Server `getUser()` verifies it before existing RPCs/admin deletion run. Native Cookie credentials are not used.
- Native API handling is off unless server `NATIVE_APP_API_ENABLED=true`. Origin is exact `capacitor://localhost`; no wildcard or credentialed CORS. The development-only origin is `http://localhost:5173`.
- API timeout/lost-response handling reuses existing UI; deletion is never automatically retried. No offline data cache is introduced.

## Windows local development

From repository root:

```powershell
npm ci
npm ci --prefix mobile
Copy-Item mobile/env.example mobile/.env.local
```

Edit `mobile/.env.local` locally with **development** public credentials only. For write tests set `VITE_API_BASE_URL=http://localhost:3000` and run the existing Next dev server with development Supabase configuration and `NATIVE_APP_API_ENABLED=true`. Do not point a test account deletion at production.

```powershell
npm --prefix mobile run dev
```

Open `http://localhost:5173`. Missing public credentials disable authentication and data access. Browser preview does not test iOS Keychain/native plugins. To typecheck/build the unsigned assets, use `npm --prefix mobile run build`; production-mode assets accept only the HTTPS production API. `npm --prefix mobile run ios:prepare` builds assets and syncs the unsigned SPM project; macOS is still required to compile iOS.

## Manual setup still required (approval required before production changes)

1. Apple Developer Program membership and App Store Connect app with bundle ID `jp.snowviking.app`. Confirm identifier availability. Individual enrolment exposes the legal seller name.
2. Approve/deploy the server API changes separately, then enable `NATIVE_APP_API_ENABLED=true` on the intended Vercel environment. Existing web auth stays cookie-based.
3. Add `jp.snowviking.app://auth/callback` to the corresponding Supabase Redirect URLs (keep all existing web URLs). The scheme is configured in the generated Info.plist. Both signup and recovery use PKCE; open the email on the same device where it was requested. Existing email templates must preserve the redirect/code flow; if templates hard-code the web callback they need a separate approved adjustment. No URL has been added automatically.
4. Native account deletion still requires the existing server-side deletion flag, server-only management key and already-reviewed DB cascade migration. Do not put them in Codemagic's VITE variables or the iOS app. No SQL is added or reapplied here.

## Codemagic (manual builds only)

Connect the existing GitHub repository; do NOT enable automatic build triggers. Root `codemagic.yaml` defines `ios-testflight` without triggers. Link App Store Connect integration named `SNOW_VIKING`, with signing/upload permissions and automatic signing for `jp.snowviking.app`.

Create environment group `snowviking-ios` with only public client configuration:

- `VITE_SUPABASE_PROJECT_REF=rtgqyctqjfoercdymssd`
- `VITE_SUPABASE_URL=https://rtgqyctqjfoercdymssd.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the matching publishable/anon key
- `VITE_API_BASE_URL=https://snowviking.jp`

Apple signing credentials belong in Codemagic's protected App Store Connect integration, never Git or chat. The release preflight rejects server keys and mismatched project refs. Manually start `ios-testflight` on the dedicated branch after approving API/Auth prerequisites. It builds the local web bundle, prepares/syncs the Swift Package Manager project, applies profiles and builds an IPA. Publishing uploads to TestFlight only; it does NOT submit an App Store review. Native compilation/signing may reveal Xcode-specific issues and has not yet run.

## Icon provenance

Original `public/snow-viking-logo.png` is unchanged. The mascot crop is (100,155)-(558,505) in its original 2048x682 coordinates, with a stepped right boundary excluding the wordmark. No artwork is regenerated. Normal icons trim the exported mascot by (8,12)-(453,348) and retain only a small outer margin. Maskable placement uses the enclosing circle of the existing artwork to maximize its scale; visible pixels are checked against the central 80%-diameter safe circle. PNGs are opaque; App Store icon is 1024px. The iOS preparation script copies that same artwork into AppIcon. Versioned PWA icon URLs avoid the old horizontal-logo cache. Existing installed Android icons may update later or require reinstall after an approved deployment.

## App Store blockers / next implementation

The current app has contact/manual moderation text but no dedicated report/block controls. Before submission implement the minimum UGC controls (Guideline 1.2):

- Report a post with a reason through an authenticated RPC; reviewer access server-side only, no public report list.
- Block an author by post ID via server RPC, without exposing author UUIDs. Apply the block filter to authenticated feed reads on the server; unblocking belongs in a minimal settings list.
- Server validation/filtering of prohibited content and an operator process for timely review and user restriction. A filter alone is not sufficient.
- These require a separate reviewed DB migration and deletion/retention rules; none is included/applied here.

Verify native signup/recovery, cold-start session/Keychain, login/logout, post/edit/delete, native account deletion, external links, safe-area/keyboard and return-from-background behavior on TestFlight. Prepare screenshots, age rating, App Privacy declarations (Supabase/Vercel/mail processing), support/privacy URLs and a review account. Reusing web screens alone does not guarantee compliance with minimum functionality (4.2); review the actual installed experience before submission. Email/password-only login does not itself add a social-login/Sign in with Apple requirement.
