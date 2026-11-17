import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const root = 'android/app';
const main = `${root}/src/main`;
const java = `${main}/java/pt/ignispyro/fogotecnico`;
for (const file of ['MainActivity.java', 'ReleaseUpdates.java']) {
  copyFileSync(`android-src/${file}`, `${java}/${file}`);
}

const res = `${main}/res`;
mkdirSync(`${res}/mipmap-nodpi`, { recursive: true });
mkdirSync(`${res}/mipmap-anydpi-v26`, { recursive: true });
mkdirSync(`${res}/drawable-nodpi`, { recursive: true });
copyFileSync('app/assets/icon-192.png', `${res}/mipmap-nodpi/fogo_launcher.png`);
copyFileSync('app/assets/icon-512.png', `${res}/drawable-nodpi/fogo_launcher_art.png`);
writeFileSync(`${res}/mipmap-anydpi-v26/fogo_launcher.xml`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@android:color/white" />
    <foreground>
        <inset android:drawable="@drawable/fogo_launcher_art" android:inset="16%" />
    </foreground>
</adaptive-icon>
`);

const manifest = `${main}/AndroidManifest.xml`;
writeFileSync(manifest, readFileSync(manifest, 'utf8')
  .replace('android:allowBackup="true"', 'android:allowBackup="false"')
  .replaceAll(/@mipmap\/ic_launcher(?:_round)?/g, '@mipmap/fogo_launcher'));

const gradle = `${root}/build.gradle`;
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
writeFileSync(gradle, readFileSync(gradle, 'utf8')
  .replace(/versionCode \d+/, `versionCode ${major * 10000 + minor * 100 + patch}`)
  .replace(/versionName "[^"]+"/, `versionName "${version}"`));
