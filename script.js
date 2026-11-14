/* Chart Converter V3 — interfaz. La lógica de conversión vive en converter.js */
const CC = window.ChartConverter;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const convertBtn = document.getElementById("convert-btn");
const downloadZipBtn = document.getElementById("download-zip-btn");
const chartArea = document.getElementById("chart-area");
const metaArea = document.getElementById("meta-area");
const dropText = document.getElementById("drop-text");
const dropHint = document.getElementById("drop-hint");
const fileList = document.getElementById("file-list");
const chartTitle = document.getElementById("chart-title");
const metaTitle = document.getElementById("meta-title");

// Metadatos extra
const albumToggle = document.getElementById("album-toggle");
const albumInput = document.getElementById("album-input");
const stickerToggle = document.getElementById("sticker-toggle");
const stickerInput = document.getElementById("sticker-input");

// Eventos incluidos
const cameraToggle = document.getElementById("camera-toggle");
const zoomToggle = document.getElementById("zoom-toggle");

// .fnfc
const instAudioInput = document.getElementById("inst-audio");
const oppAudioInput = document.getElementById("opp-audio");
const plyAudioInput = document.getElementById("ply-audio");
const fnfcBtn = document.getElementById("fnfc-btn");

const forwardModes = document.getElementById("forward-modes");
const inverseModes = document.getElementById("inverse-modes");
const statusForward = document.getElementById("status-forward");
const statusInverse = document.getElementById("status-inverse");
const metaExtraBox = document.getElementById("meta-extra-box");
const fnfcBox = document.getElementById("fnfc-box");

// ¿Corre dentro del APK (Capacitor)? En el navegador normal sigue funcionando como antes.
const IS_NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
if (IS_NATIVE) {
    document.documentElement.classList.add("is-native");
    // En Android, un `accept` con extensiones raras (.fnfc) hace que el selector oculte archivos.
    // Se quita y el filtrado ya lo hace isAccepted() por extensión.
    fileInput.removeAttribute("accept");
}

let selectedFiles = [];
let currentSongKey = "pack";
let direction = "forward";        // "forward" (→ V Slice) | "inverse" (V Slice →)
let converterMode = "psych";      // modo de origen (forward)
let inverseMode = "psych_v1";     // modo de destino (inverse)
let currentPack = null;           // { name, files: [{name, content}] } para el ZIP

const FORWARD_LABELS = {
    psych: "Psych Engine", psych063: "Psych 0.6.3 (Legacy)", kade: "Kade Engine",
    psych073: "Psych 0.7.3 (psych_v1)", psych104: "Psych 1.0.4 (psych_v1)",
    pslice: "P Slice", codename: "Codename Engine"
};
const INVERSE_LABELS = {
    psych_v1: "Psych 0.7+ / 1.0 / P Slice", legacy: "Psych 0.6.3 (Legacy)",
    kade: "Kade Engine", codename: "Codename Engine"
};

// ---------------------------------------------------------------- utilidades UI
function showEl(el, visible, display) {
    el.style.display = visible ? (display || "block") : "none";
}

function resetOutputs() {
    selectedFiles = [];
    currentPack = null;
    fileList.textContent = "";
    chartArea.value = "";
    metaArea.value = "";
    convertBtn.style.display = "none";
    downloadZipBtn.style.display = "none";
}

function refreshLabels() {
    if (direction === "forward") {
        dropText.innerHTML = IS_NATIVE
            ? `Toca aquí para elegir tus charts de <span>${FORWARD_LABELS[converterMode] || "Psych Engine"}</span>`
            : `¡Suelta tus charts de <span>${FORWARD_LABELS[converterMode] || "Psych Engine"}</span> aquí!`;
        dropHint.textContent = IS_NATIVE ? "Se abrirá el explorador de archivos de tu celular" : "O haz clic para explorar tus Archivos";
        convertBtn.textContent = "✨ PROCESAR ARCHIVOS ✨";
        chartTitle.textContent = "chart.json";
        metaTitle.textContent = "metadata.json";
        chartArea.placeholder = "Las notas convertidas aparecerán aquí...";
        metaArea.placeholder = "Los metadatos aparecerán aquí...";
    } else {
        dropText.innerHTML = IS_NATIVE
            ? `Toca aquí para elegir tu <span>chart + metadata</span> de V Slice (o un <span>.fnfc</span>)`
            : `¡Suelta tu <span>chart + metadata</span> de V Slice (o un <span>.fnfc</span>) aquí!`;
        dropHint.textContent = `Destino: ${INVERSE_LABELS[inverseMode]} · acepta .json, .fnfc y .zip`;
        convertBtn.textContent = `🔄 CONVERTIR A ${INVERSE_LABELS[inverseMode].toUpperCase()}`;
        chartTitle.textContent = "chart convertido";
        metaTitle.textContent = "informe / archivos";
        chartArea.placeholder = "El primer archivo convertido aparecerá aquí...";
        metaArea.placeholder = "Aquí verás los archivos generados y avisos...";
    }
}

function setDirection(dir) {
    direction = dir;
    const fwd = dir === "forward";
    showEl(forwardModes, fwd);
    showEl(statusForward, fwd);
    showEl(inverseModes, !fwd);
    showEl(statusInverse, !fwd);
    showEl(metaExtraBox, fwd);
    showEl(fnfcBox, fwd);
    downloadZipBtn.textContent = fwd ? "🎁 DESCARGAR PACK (.ZIP)" : "🎁 DESCARGAR ARCHIVOS CONVERTIDOS (.ZIP)";
    resetOutputs();
    refreshLabels();
}

// Radios: dirección / modo de origen / modo de destino
function bindRadioGroup(name, onChange) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
        radio.addEventListener("change", () => {
            if (!radio.checked) return;
            document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.closest(".mode-card").classList.remove("selected"));
            radio.closest(".mode-card").classList.add("selected");
            onChange(radio.value);
        });
    });
}
bindRadioGroup("direction", setDirection);
bindRadioGroup("converter-mode", v => { converterMode = v; resetOutputs(); refreshLabels(); });
bindRadioGroup("inverse-mode", v => { inverseMode = v; resetOutputs(); refreshLabels(); });

albumToggle.addEventListener("change", e => {
    albumInput.disabled = !e.target.checked;
    if (e.target.checked) albumInput.focus();
});
stickerToggle.addEventListener("change", e => {
    stickerInput.disabled = !e.target.checked;
    if (e.target.checked) stickerInput.focus();
});

// ---------------------------------------------------------------- carga de archivos
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", e => {
    handleFiles(e.target.files);
    fileInput.value = ""; // permite volver a elegir el mismo archivo
});
dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.style.borderColor = "#ff007f";
});
dropZone.addEventListener("dragleave", () => { dropZone.style.borderColor = ""; });
dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.style.borderColor = "";
    handleFiles(e.dataTransfer.files);
});

function isAccepted(name) {
    const n = name.toLowerCase();
    return direction === "inverse"
        ? (n.endsWith(".json") || n.endsWith(".fnfc") || n.endsWith(".zip"))
        : n.endsWith(".json");
}

function handleFiles(files) {
    selectedFiles = Array.from(files).filter(f => isAccepted(f.name));
    // Los resultados anteriores ya no corresponden a los nuevos archivos.
    chartArea.value = "";
    metaArea.value = "";
    currentPack = null;
    downloadZipBtn.style.display = "none";

    if (selectedFiles.length > 0) {
        fileList.textContent = `🔥 ¡${selectedFiles.length} archivo(s) detectado(s) listo(s) para reventar!`;
        convertBtn.style.display = "block";
    } else {
        fileList.textContent = direction === "inverse"
            ? "⚠️ No se encontraron archivos .json, .fnfc o .zip válidos."
            : "⚠️ No se encontraron archivos .json válidos.";
        convertBtn.style.display = "none";
    }
}

function copyToClipboard(areaId, button) {
    const textarea = document.getElementById(areaId);
    const reset = () => {
        button.innerText = "📋 Copiar";
        button.style.borderColor = "";
        button.style.color = "";
    };
    if (!textarea.value) {
        button.innerText = "❌ ¡Vacío!";
        setTimeout(reset, 1500);
        return;
    }
    const done = () => {
        button.innerText = "✅ ¡Copiado!";
        button.style.borderColor = "#00ff66";
        button.style.color = "#00ff66";
        setTimeout(reset, 2000);
    };
    const fallback = () => {
        textarea.focus();
        textarea.select();
        try {
            if (document.execCommand("copy")) return done();
        } catch (err) {
            console.error("Error al copiar código: ", err);
        }
        button.innerText = "❌ Sin permisos";
        setTimeout(reset, 1500);
    };
    // navigator.clipboard no existe en contextos no seguros (file://) o falla sin permisos.
    if (!navigator.clipboard || !window.isSecureContext) return fallback();
    navigator.clipboard.writeText(textarea.value).then(done).catch(fallback);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo generado."));
        reader.readAsDataURL(blob);
    });
}

// Android WebView ignora <a download> con blobs: se escribe el archivo en la caché de la app
// y se abre el menú "Compartir" de Android, desde donde se guarda en Archivos/Descargas, Drive, WhatsApp, etc.
async function saveNative(blob, filename) {
    const plugins = window.Capacitor.Plugins || {};
    const { Filesystem, Share } = plugins;
    if (!Filesystem || !Share) throw new Error("Los plugins nativos de archivos no están disponibles.");
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: filename, data, directory: "CACHE", recursive: true });
    try {
        await Share.share({ title: filename, dialogTitle: `Guardar / compartir ${filename}`, url: written.uri });
    } catch (err) {
        // Cerrar el menú sin elegir nada no es un error.
        if (!/cancel/i.test(String(err && err.message || err))) throw err;
    }
}

async function downloadBlob(blob, filename) {
    if (IS_NATIVE) {
        try {
            await saveNative(blob, filename);
        } catch (err) {
            console.error(err);
            alert("❌ No se pudo guardar el archivo: " + (err && err.message ? err.message : err));
        }
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Firefox antiguo exige que esté en el DOM
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function requireJSZip() {
    if (typeof JSZip === "undefined") {
        alert("❌ No se pudo cargar JSZip (lib/jszip.min.js). Recarga la app para generar ZIP/.fnfc.");
        return false;
    }
    return true;
}

// ---------------------------------------------------------------- conversión normal (→ V Slice)
function psychModeFor(mode) {
    if (mode === "psych063" || mode === "kade") return "063";
    if (mode === "psych073") return "073";
    if (mode === "psych104" || mode === "pslice") return "104";
    return "auto";
}

async function runForward() {
    const isCodename = converterMode === "codename";
    const finalChart = {
        version: "2.0.0",
        scrollSpeed: {},
        notes: {},
        events: [],
        generatedBy: isCodename ? "Chart Converter V3 GCD (Codename → V Slice)" : "Chart Converter V3 GCD"
    };
    let finalMeta = null;
    let songKey = "pack";
    const activeDifficulties = [];
    const warnings = [];
    const seenEvents = new Set();

    for (const file of selectedFiles) {
        let rawData;
        try {
            rawData = CC.parseJson(await file.text());
        } catch (err) {
            throw new Error(`"${file.name}" no es un JSON válido (${err.message}).`);
        }

        let result;
        try {
            result = isCodename
                ? CC.convertCodenameToVSlice(rawData)
                : CC.convertPsychToVSlice(rawData, file, psychModeFor(converterMode));
        } catch (err) {
            throw new Error(`"${file.name}": ${err.message}`);
        }

        const diff = CC.getDiff(file.name);
        if (activeDifficulties.includes(diff)) warnings.push(`Dos archivos apuntan a la dificultad '${diff}': se usó el último ("${file.name}").`);
        else activeDifficulties.push(diff);
        if (songKey === "pack") songKey = CC.slug(result.canonicalKey, "pack");

        finalChart.scrollSpeed[diff] = result.speed;
        finalChart.notes[diff] = result.notesArr;
        warnings.push(...result.warnings.map(w => `${file.name}: ${w}`));

        // Los eventos de V-Slice son globales: se deduplican entre dificultades.
        result.eventsArr.forEach(ev => {
            if (ev.e === "FocusCamera" && !cameraToggle.checked) return;
            if (ev.e === "ZoomCamera" && !zoomToggle.checked) return;
            const k = `${ev.t}|${ev.e}|${JSON.stringify(ev.v)}`;
            if (seenEvents.has(k)) return;
            seenEvents.add(k);
            finalChart.events.push(ev);
        });

        if (!finalMeta) {
            finalMeta = { result };
        }
    }

    const r = finalMeta.result;
    const meta = CC.buildVSliceMeta({
        songName: r.songName,
        bpm: r.bpm,
        player1: r.player1,
        player2: r.player2,
        girlfriend: r.girlfriend,
        stage: r.stage,
        difficulties: activeDifficulties,
        timeChanges: r.timeChanges,
        stickerPack: stickerToggle.checked ? (stickerInput.value.trim() || "Custom Stickers") : null,
        album: albumToggle.checked ? (albumInput.value.trim() || "Custom Album") : null
    });

    finalChart.events.sort((a, b) => a.t - b.t);
    chartArea.value = JSON.stringify(finalChart, null, 2);
    metaArea.value = JSON.stringify(meta, null, 2);

    currentSongKey = songKey;
    currentPack = {
        name: `${songKey}_VSlice_Pack.zip`,
        files: [
            { name: `${songKey}-chart.json`, content: chartArea.value },
            { name: `${songKey}-metadata.json`, content: metaArea.value }
        ]
    };
    return { songKey, warnings };
}

// ---------------------------------------------------------------- conversión inversa (V Slice →)
function looksLikeVSliceChart(o) {
    return o && typeof o === "object" && o.notes && typeof o.notes === "object" && !Array.isArray(o.notes) &&
        (o.scrollSpeed !== undefined || Object.values(o.notes).some(Array.isArray));
}
function looksLikeVSliceMeta(o) {
    return o && typeof o === "object" && (o.playData || Array.isArray(o.timeChanges) || o.songName);
}

async function collectJsonEntries() {
    const entries = []; // { name, text }
    for (const file of selectedFiles) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".fnfc") || lower.endsWith(".zip")) {
            if (!requireJSZip()) throw new Error("JSZip no disponible.");
            let zip;
            try {
                zip = await JSZip.loadAsync(file);
            } catch (err) {
                throw new Error(`No se pudo abrir "${file.name}" como ZIP/.fnfc (${err.message}).`);
            }
            const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && n.toLowerCase().endsWith(".json") && !/(^|\/)manifest\.json$/i.test(n));
            for (const n of names) entries.push({ name: n, text: await zip.files[n].async("string") });
        } else {
            entries.push({ name: file.name, text: await file.text() });
        }
    }
    return entries;
}

async function runInverse() {
    const entries = await collectJsonEntries();
    const warnings = [];
    const chart = { notes: {}, scrollSpeed: {}, events: [] };
    let meta = null;
    let chartCount = 0;
    const seenEvents = new Set();

    for (const entry of entries) {
        let obj;
        try {
            obj = CC.parseJson(entry.text);
        } catch (err) {
            throw new Error(`"${entry.name}" no es un JSON válido (${err.message}).`);
        }
        if (looksLikeVSliceChart(obj)) {
            chartCount++;
            Object.keys(obj.notes).forEach(d => {
                if (chart.notes[d]) warnings.push(`La dificultad '${d}' aparece en más de un chart; se usó la última ("${entry.name}").`);
                chart.notes[d] = obj.notes[d];
            });
            Object.assign(chart.scrollSpeed, obj.scrollSpeed || {});
            (Array.isArray(obj.events) ? obj.events : []).forEach(ev => {
                const k = `${ev.t}|${ev.e}|${JSON.stringify(ev.v)}`;
                if (!seenEvents.has(k)) { seenEvents.add(k); chart.events.push(ev); }
            });
        } else if (looksLikeVSliceMeta(obj)) {
            if (!meta) meta = obj;
            else warnings.push(`Se ignoró metadata adicional ("${entry.name}"); solo se usa la primera.`);
        } else {
            warnings.push(`"${entry.name}" no parece un chart ni metadata de V Slice: se ignoró.`);
        }
    }

    if (!chartCount) {
        throw new Error("No se encontró ningún chart de V Slice (archivo con 'notes' por dificultad y 'scrollSpeed'). Si tus archivos son de Psych/Kade/Codename usa la dirección Normal.");
    }
    chart.events.sort((a, b) => a.t - b.t);

    const result = CC.convertVSliceToTarget(chart, meta, inverseMode, {
        camera: cameraToggle.checked,
        zoom: zoomToggle.checked,
        songKey: CC.songKeyFromFile(selectedFiles[0].name)
    });
    warnings.push(...result.warnings);

    chartArea.value = result.files[0].content;
    chartTitle.textContent = result.files[0].name;
    const report = [
        `Canción: ${result.songName}`,
        `Destino: ${INVERSE_LABELS[inverseMode]}`,
        `Dificultades: ${result.difficulties.join(", ")}`,
        "",
        "Archivos generados:",
        ...result.files.map(f => `  • ${f.name}`),
        ...(warnings.length ? ["", "Avisos:", ...warnings.map(w => `  ⚠ ${w}`)] : [])
    ];
    metaArea.value = report.join("\n");

    const suffix = { psych_v1: "Psych", legacy: "Psych063", kade: "Kade", codename: "Codename" }[inverseMode];
    currentPack = { name: `${result.key}_${suffix}_Pack.zip`, files: result.files };
    return { songKey: result.key, warnings };
}

// ---------------------------------------------------------------- acciones
async function runConversion() {
    if (selectedFiles.length === 0) return null;
    convertBtn.disabled = true;
    try {
        const res = direction === "inverse" ? await runInverse() : await runForward();
        downloadZipBtn.style.display = "block";
        fileList.textContent = res.warnings.length
            ? `✅ Conversión lista con ${res.warnings.length} aviso(s) — revisa el panel derecho / consola.`
            : "✅ ¡Conversión lista!";
        if (res.warnings.length && direction === "forward") console.warn(res.warnings.join("\n"));
        return res;
    } catch (err) {
        alert("❌ Error al convertir: " + err.message);
        console.error(err);
        fileList.textContent = "❌ " + err.message;
        chartArea.value = "";
        metaArea.value = "";
        currentPack = null;
        downloadZipBtn.style.display = "none";
        return null;
    } finally {
        convertBtn.disabled = false;
    }
}

convertBtn.addEventListener("click", runConversion);

downloadZipBtn.addEventListener("click", async () => {
    if (!currentPack || !requireJSZip()) return;
    const zip = new JSZip();
    currentPack.files.forEach(f => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, currentPack.name);
});

fnfcBtn.addEventListener("click", async () => {
    if (!requireJSZip()) return;
    const instFile = instAudioInput.files[0];

    if (selectedFiles.length === 0) {
        alert("❌ No hay charts cargados. Arrastra o sube los archivos JSON del mapa antes de generar el pack.");
        return;
    }
    // Se reconvierte siempre para reflejar los interruptores actuales (cámara, zoom, álbum, stickers).
    const res = await runConversion();
    if (!res) return;

    if (!instFile) {
        alert("❌ Debes subir el audio 'Inst.ogg' — es OBLIGATORIO para el pack .fnfc.");
        return;
    }

    const songKey = currentPack.files[0].name.replace(/-chart\.json$/, "") || "song";

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: "1.0.0", songId: songKey }, null, 2));
    currentPack.files.forEach(f => zip.file(f.name, f.content));
    zip.file("Inst.ogg", instFile);
    if (plyAudioInput.files[0]) zip.file("Voices-Player.ogg", plyAudioInput.files[0]);
    if (oppAudioInput.files[0]) zip.file("Voices-Opponent.ogg", oppAudioInput.files[0]);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${songKey}.fnfc`);
});

refreshLabels();
