// Copia solo los archivos de la app web a ./www (la carpeta que Capacitor empaqueta en el APK).
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "style.css", "converter.js", "script.js", "icon.png", "lib/jszip.min.js"];

fs.rmSync(out, { recursive: true, force: true });
for (const rel of files) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) throw new Error(`Falta el archivo ${rel}`);
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}
console.log(`www/ listo (${files.length} archivos).`);
