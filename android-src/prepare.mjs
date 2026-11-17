import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const root = 'android/app';
copyFileSync('android-src/MainActivity.java', `${root}/src/main/java/pt/ignispyro/fogotecnico/MainActivity.java`);

const manifest = `${root}/src/main/AndroidManifest.xml`;
writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('android:allowBackup="true"', 'android:allowBackup="false"'));

const gradle = `${root}/build.gradle`;
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
writeFileSync(gradle, readFileSync(gradle, 'utf8')
  .replace(/versionCode \d+/, `versionCode ${major * 10000 + minor * 100 + patch}`)
  .replace(/versionName "[^"]+"/, `versionName "${version}"`));
