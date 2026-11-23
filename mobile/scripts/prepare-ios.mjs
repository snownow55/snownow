import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(root);
const cli = resolve("node_modules/@capacitor/cli/bin/capacitor");
if (!existsSync("dist/index.html")) throw new Error("Build the bundled client first");
if (!existsSync("ios/App/App.xcodeproj")) execFileSync(process.execPath, [cli, "add", "ios", "--packagemanager", "SPM"], { stdio: "inherit" });
execFileSync(process.execPath, [cli, "sync", "ios"], { stdio: "inherit" });
const info = "ios/App/App/Info.plist";
let plist = readFileSync(info, "utf8");
if (!plist.includes("jp.snowviking.app")) {
  plist = plist.replace(/<\/dict>\s*<\/plist>/, `<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>jp.snowviking.app</string><key>CFBundleURLSchemes</key><array><string>jp.snowviking.app</string></array></dict></array></dict></plist>`);
  writeFileSync(info, plist);
}
const dir = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
mkdirSync(dir, { recursive: true });
copyFileSync("../public/icons/snow-viking-app-store-1024-v2.png", `${dir}/AppIcon-1024.png`);
writeFileSync(`${dir}/Contents.json`, JSON.stringify({ images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }], info: { author: "xcode", version: 1 } }, null, 2));
console.log("IOS_PROJECT_PREPARED_UNSIGNED");

// Remove the unused generated Capacitor icon and replace every generated splash image.
const placeholder = `${dir}/AppIcon-512@2x.png`;
if (existsSync(placeholder)) unlinkSync(placeholder);
const splash = "ios/App/App/Assets.xcassets/Splash.imageset";
for (const image of JSON.parse(readFileSync(`${splash}/Contents.json`, "utf8")).images) {
  copyFileSync("../public/icons/snow-viking-splash-v2.png", `${splash}/${image.filename}`);
}
