# Chart Converter V4 (Mobile)

Conversor de charts de Friday Night Funkin' por Gamer_CountryBalls & Panchito Manriquez.

- **Normal:** Psych (0.6.3 / 0.7.3 / 1.0.4), Kade, P Slice y Codename → V Slice
- **Inversa:** V Slice → Psych / Kade / Codename
- Exporta `.zip` y packs `.fnfc`

Funciona como página web (abre `index.html`) y como **APK de Android** (Capacitor).

## Descargar el APK

1. Ve a la pestaña **Releases** del repo y descarga el `.apk` más reciente
   (o entra a **Actions → Build Android APK** y baja el artefacto `ChartConverterV4-apk`).
2. Ábrelo en tu celular y permite "instalar apps desconocidas" cuando Android lo pida.

El APK se compila solo en cada `push` a `main`, o a mano desde **Actions → Build Android APK → Run workflow**.
Está firmado con la clave fija de `keystore/debug.keystore`, así que cada APK nuevo se instala encima del anterior sin desinstalar.

## En el APK

- Funciona **sin internet** (JSZip va incluido en `lib/`).
- Al convertir, **🎁 DESCARGAR PACK** y **💿 GENERAR .FNFC** abren el menú "Compartir" de Android:
  desde ahí lo guardas en Archivos/Descargas, Drive, lo mandas por WhatsApp, etc.
- El selector de archivos es el de Android; los audios `.ogg` del `.fnfc` se eligen igual.

## Compilar localmente

Requisitos: Node 22, JDK 21 y Android SDK.

```bash
npm install
npm run android:init   # genera ./android, íconos y sincroniza
npm run android:apk    # android/app/build/outputs/apk/debug/app-debug.apk
```

Tras cambiar `index.html`, `script.js`, `converter.js` o `style.css`: `npm run android:sync`.
