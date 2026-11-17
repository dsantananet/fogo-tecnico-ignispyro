# Compilar para Android

Requisitos: Node.js 22, JDK 21, Android SDK com API 35 e Build Tools 35.0.0.

```sh
npm install
npx cap add android
node android-src/prepare.mjs
cd android
bash gradlew assembleRelease
```

O workflow verifica a assinatura e instala o APK assinado num emulador Android antes de o guardar como artefacto.
A assinatura de distribuição usa a chave IgnisPyro. Para compilações locais de desenvolvimento, usa `assembleDebug`.
Mantém a chave de assinatura original para publicar atualizações compatíveis com instalações existentes.

Para instalar por USB, habilita a depuração, autoriza o PC no telefone e usa
`adb install -r Fogo-Tecnico-IgnisPyro-v2.1.0.apk`.
