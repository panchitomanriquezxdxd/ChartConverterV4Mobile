// Ajustes al proyecto ./android recién generado con `npx cap add android`.
//  1) versionCode / versionName (para poder instalar cada APK nuevo encima del anterior)
//  2) Android 15+: evita que la app se dibuje debajo de la barra de estado
const fs = require("fs");
const path = require("path");

const androidDir = path.resolve(__dirname, "..", "android");
const versionCode = process.env.VERSION_CODE || "1";
const versionName = process.env.VERSION_NAME || "4.0.0";

function patch(file, fn, label) {
    const p = path.join(androidDir, file);
    if (!fs.existsSync(p)) {
        console.warn(`[patch-android] No existe ${file}; se omite "${label}".`);
        return;
    }
    const before = fs.readFileSync(p, "utf8");
    const after = fn(before);
    if (after === before) {
        console.warn(`[patch-android] "${label}" no cambió nada en ${file} (¿plantilla distinta?).`);
        return;
    }
    fs.writeFileSync(p, after);
    console.log(`[patch-android] ${label}: OK`);
}

patch("app/build.gradle", s => s
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`), "versionCode/versionName");

patch("app/src/main/res/values/styles.xml", s => {
    if (s.includes("windowOptOutEdgeToEdgeEnforcement")) return s;
    // Se inserta al final del estilo AppTheme.NoActionBar (el que usa la actividad principal).
    return s.replace(
        /(<style\s+name="AppTheme\.NoActionBar"[^>]*>)/,
        '$1\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'
    );
}, "opt-out edge-to-edge");
