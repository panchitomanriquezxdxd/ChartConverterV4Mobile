/* =====================================================================
 *  Chart Converter V3 — núcleo de conversión (sin DOM, probable en Node)
 *  Normal : Psych / Kade / Codename  →  V Slice
 *  Inversa: V Slice  →  Psych (psych_v1 / legacy) / Kade / Codename
 * ===================================================================== */
(function (root) {
    "use strict";

    const KNOWN_DIFFS = ["easy", "normal", "hard", "erect", "nightmare"];
    const DEFAULT_RATINGS = { easy: 3, normal: 5, hard: 6, erect: 7, nightmare: 8 };

    // ------------------------------------------------------------ utilidades
    function parseJson(text) {
        // Quita BOM (muchos editores de Windows lo añaden y JSON.parse revienta).
        return JSON.parse(String(text).replace(/^﻿/, ""));
    }
    function toNum(v, fallback) {
        const n = typeof v === "number" ? v : parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    }
    const round3 = x => Math.round(x * 1000) / 1000;
    const round4 = x => Math.round(x * 10000) / 10000;
    function slug(s, fb) {
        const r = String(s == null ? "" : s).toLowerCase().trim()
            .replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
        return r || fb || "song";
    }
    function baseName(name) {
        return String(name || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    }
    function getDiff(name) {
        const lower = baseName(name).toLowerCase();
        for (const d of KNOWN_DIFFS) {
            if (lower === d || lower.endsWith("-" + d) || lower.endsWith("_" + d)) return d;
        }
        return "normal";
    }
    function songKeyFromFile(name) {
        let b = baseName(name).toLowerCase();
        for (const d of KNOWN_DIFFS) {
            if (b.endsWith("-" + d) || b.endsWith("_" + d)) { b = b.slice(0, -(d.length + 1)); break; }
        }
        return b.replace(/-(chart|metadata)$/, "");
    }

    // ------------------------------------------------------------ PSYCH / KADE → V SLICE
    // psychMode: "auto" | "063" (legacy/Kade) | "073" | "104" (psych_v1 absoluto; pslice usa "104")
    function convertPsychToVSlice(rawData, file, psychMode) {
        psychMode = psychMode || "auto";
        const song = rawData && rawData.song && typeof rawData.song === "object" ? rawData.song : rawData;

        if (!song || !Array.isArray(song.notes)) {
            throw new Error("No se encontró el array 'notes' (chart de Psych/Kade). Verifica el formato o que tengas el modo correcto seleccionado.");
        }

        const warnings = [];
        // psych_v1 = carriles ABSOLUTOS. "psych_v1_convert" y sin formato = legacy (relativo a mustHitSection).
        const fmt = typeof song.format === "string" ? song.format.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
        const isV1 = psychMode === "073" || psychMode === "104" ||
            (psychMode === "auto" && fmt.startsWith("psychv1") && !fmt.includes("convert"));
        const needsLaneRemap = !isV1;

        const remapLane = (lane, mustHitSection) => {
            const raw = ((lane % 8) + 8) % 8;
            const isPlayer = raw < 4 ? !!mustHitSection : !mustHitSection;
            return (raw % 4) + (isPlayer ? 0 : 4);
        };

        const toZoom = (key, value) => {
            // "Add Camera Zoom" suma (0.015 por defecto) → zoom relativo al stage = 1 + valor.
            // El resto de eventos "zoom" llevan el zoom absoluto.
            const zoom = key === "addcamerazoom" ? 1 + toNum(value, 0.015) : toNum(value, 1);
            return { ease: "expoInOut", duration: 4, mode: "stage", zoom: round4(zoom) };
        };

        const eventsArr = [];
        const addPsychEvent = (name, v1, t) => {
            if (!Number.isFinite(t)) return;
            const key = String(name == null ? "" : name).toLowerCase().replace(/[^a-z]/g, "");
            if (key === "focuscamera") {
                const c = parseInt(v1, 10);
                eventsArr.push({ t, e: "FocusCamera", v: { char: c === 0 ? 0 : (c === 2 ? 2 : 1) } });
            } else if (key.includes("zoom")) {
                eventsArr.push({ t, e: "ZoomCamera", v: toZoom(key, v1) });
            }
        };

        // Eventos inline en sectionNotes (Psych 0.7+/1.0):
        //  [time, "Nombre", v1, v2]  |  [time, -1, "Nombre", v1, v2]
        const extractInline = note => {
            if (note.length < 2) return null;
            if (typeof note[1] === "string") return { name: note[1], v1: note[2], t: toNum(note[0], NaN) };
            if (typeof note[1] === "number" && note[1] < 0 && typeof note[2] === "string") {
                return { name: note[2], v1: note[3], t: toNum(note[0], NaN) };
            }
            return null;
        };

        // Eventos de song.events: [[time, [[nombre, v1, v2], ...]], ...]
        const psychEvents = (rawData && rawData.events) || song.events;
        if (Array.isArray(psychEvents)) {
            psychEvents.forEach(group => {
                if (!Array.isArray(group)) return;
                const evTime = toNum(group[0], NaN);
                if (Array.isArray(group[1])) {
                    group[1].forEach(sub => { if (Array.isArray(sub)) addPsychEvent(sub[0], sub[1], evTime); });
                }
            });
        }

        const baseBpm = toNum(song.bpm, 100) > 0 ? toNum(song.bpm, 100) : 100;
        let bpm = baseBpm;
        const notesArr = [];
        const timeChanges = [{ t: 0, b: 0, bpm, n: 4, d: 4, bt: [4, 4, 4, 4] }];
        let currentTime = 0;
        let currentBeat = 0;
        let lastFocus = -1;

        song.notes.forEach(sec => {
            if (!sec || typeof sec !== "object") return;

            if (sec.changeBPM && toNum(sec.bpm, 0) > 0) {
                bpm = toNum(sec.bpm, bpm);
                const last = timeChanges[timeChanges.length - 1];
                const t = Math.round(currentTime);
                if (last.t === t) { last.bpm = bpm; last.b = round4(currentBeat); }
                else if (last.bpm !== bpm) {
                    timeChanges.push({ t, b: round4(currentBeat), bpm, n: 4, d: 4, bt: [4, 4, 4, 4] });
                }
            }

            const focusChar = sec.gfSection ? 2 : (sec.mustHitSection ? 0 : 1);
            if (focusChar !== lastFocus) {
                eventsArr.push({ t: Math.round(currentTime), e: "FocusCamera", v: { char: focusChar } });
                lastFocus = focusChar;
            }

            (Array.isArray(sec.sectionNotes) ? sec.sectionNotes : []).forEach(n => {
                if (!Array.isArray(n)) return;

                const inline = extractInline(n);
                if (inline) { addPsychEvent(inline.name, inline.v1, inline.t); return; }

                const t = toNum(n[0], NaN);
                const rawLane = toNum(n[1], NaN);
                if (!Number.isFinite(t) || !Number.isFinite(rawLane)) return;
                if (rawLane < 0) return; // nota de GF/evento antiguo: V-Slice no tiene carril GF

                const d = needsLaneRemap ? remapLane(rawLane, sec.mustHitSection) : ((rawLane % 8) + 8) % 8;
                const note = { t, d, l: Math.max(0, toNum(n[2], 0)), p: [] };
                if (typeof n[3] === "string" && n[3] !== "") note.k = n[3]; // tipo de nota (Hurt Note, Alt Animation…)
                notesArr.push(note);
            });

            const beats = toNum(sec.sectionBeats, NaN) > 0
                ? toNum(sec.sectionBeats, 4)
                : (toNum(sec.lengthInSteps, 0) > 0 ? toNum(sec.lengthInSteps, 16) / 4 : 4);
            currentTime += (60000 / bpm) * beats;
            currentBeat += beats;
        });

        notesArr.sort((a, b) => a.t - b.t);

        const name = song.song || (file && file.name ? songKeyFromFile(file.name) : "Unknown");
        return {
            canonicalKey: String(name).toLowerCase(),
            songName: name,
            speed: toNum(song.speed, 2.5),
            bpm: baseBpm,
            player1: song.player1 || "bf",
            player2: song.player2 || "dad",
            girlfriend: song.gfVersion || song.player3 || "gf",
            stage: song.stage || "stage",
            difficulties: null,
            notesArr, eventsArr, timeChanges, warnings
        };
    }

    // ------------------------------------------------------------ CODENAME → V SLICE
    function convertCodenameToVSlice(rawData) {
        let chart = (rawData && typeof rawData === "object") ? rawData : {};
        const wrapped = chart.song && typeof chart.song === "object" ? chart.song : null;
        if (wrapped && (wrapped.strumLines || Array.isArray(wrapped.chart) || wrapped.codenameChart)) chart = wrapped;

        if (!Array.isArray(chart.strumLines)) {
            throw new Error("No se encontró un chart nativo de Codename (strumLines). Si el archivo es de Psych (o un chart CNE en formato legacy), usa el modo 'Psych To V Slice'.");
        }

        const warnings = [];
        const meta = chart.meta || (rawData && rawData.meta) || {};
        const baseBpm = toNum(meta.bpm, 100) > 0 ? toNum(meta.bpm, 100) : 100;
        const noteTypes = Array.isArray(chart.noteTypes) ? chart.noteTypes : [];
        const notesArr = [];
        const eventsArr = [];
        let skippedGf = 0;

        const findLine = type => chart.strumLines.find(s => Number(s.type) === type);
        const getChara = (type, fb) => {
            const line = findLine(type);
            return line && Array.isArray(line.characters) && line.characters[0] ? line.characters[0] : fb;
        };

        for (const sl of chart.strumLines) {
            const type = Number(sl.type);
            if (type === 2) { skippedGf += (sl.notes || []).length; continue; } // GF no existe en V-Slice
            const baseLane = type === 1 ? 0 : 4; // PLAYER → 0-3 | OPPONENT → 4-7
            for (const n of sl.notes || []) {
                const t = toNum(n.time, NaN);
                if (!Number.isFinite(t)) continue;
                const note = { t, d: baseLane + (((Number(n.id) || 0) % 4) + 4) % 4, l: Math.max(0, toNum(n.sLen, 0)), p: [] };
                const nType = Number(n.type);
                if (nType > 0 && noteTypes[nType - 1]) note.k = noteTypes[nType - 1];
                notesArr.push(note);
            }
        }
        if (skippedGf) warnings.push(`${skippedGf} nota(s) de la strumline GF omitidas (V-Slice no tiene carril GF).`);

        const timeChanges = [{ t: 0, b: 0, bpm: baseBpm, n: 4, d: 4, bt: [4, 4, 4, 4] }];

        for (const ev of chart.events || []) {
            const name = String(ev.name || "").toLowerCase();
            const params = Array.isArray(ev.params) ? ev.params : [];
            const t = toNum(ev.time, 0);

            if (name === "camera movement") {
                // params[0] = ÍNDICE de strumline objetivo → se resuelve a su tipo.
                const idx = Number(params[0]);
                const line = chart.strumLines[idx];
                const type = line ? Number(line.type) : (idx === 1 ? 1 : 0);
                eventsArr.push({ t, e: "FocusCamera", v: { char: type === 1 ? 0 : (type === 2 ? 2 : 1) } });
            } else if (name === "camera zoom") {
                // [tween?, zoom, cam, duración, ease, tipo, modo]
                const zoom = toNum(params[1], 1.4);
                const mode = params[6] === "stage" ? "stage" : "direct";
                eventsArr.push({ t, e: "ZoomCamera", v: { ease: "expoInOut", duration: 4, mode, zoom } });
            } else if (name === "add camera zoom") {
                eventsArr.push({ t, e: "ZoomCamera", v: { ease: "expoInOut", duration: 4, mode: "stage", zoom: round4(1 + toNum(params[0], 0.015)) } });
            } else if (name === "bpm change") {
                const bpm = toNum(params[0], 0);
                if (bpm > 0) timeChanges.push({ t, b: 0, bpm, n: 4, d: 4, bt: [4, 4, 4, 4] });
            }
        }

        timeChanges.sort((a, b) => a.t - b.t);
        // Recalcula el beat de cada cambio de BPM
        for (let i = 1; i < timeChanges.length; i++) {
            const p = timeChanges[i - 1];
            timeChanges[i].b = round4(p.b + (timeChanges[i].t - p.t) / (60000 / p.bpm));
        }
        notesArr.sort((a, b) => a.t - b.t);

        const songName = meta.displayName || meta.name || "unknown";
        return {
            canonicalKey: String(meta.name || songName).toLowerCase(),
            songName,
            speed: toNum(chart.scrollSpeed, 1),
            bpm: baseBpm,
            player1: getChara(1, "bf"),
            player2: getChara(0, "dad"),
            girlfriend: getChara(2, "gf"),
            stage: chart.stage || "stage",
            difficulties: Array.isArray(meta.difficulties) ? meta.difficulties.slice() : null,
            notesArr, eventsArr, timeChanges, warnings
        };
    }

    // ------------------------------------------------------------ METADATA V SLICE
    function buildVSliceMeta(opts) {
        const diffs = (opts.difficulties && opts.difficulties.length) ? opts.difficulties : ["normal"];
        const ratings = {};
        diffs.forEach(d => { ratings[d] = DEFAULT_RATINGS[d] || 5; });

        const playData = {};
        if (opts.stickerPack) playData.stickerPack = opts.stickerPack;
        playData.difficulties = diffs;
        playData.characters = {
            player: opts.player1 || "bf",
            girlfriend: opts.girlfriend || "gf",
            opponent: opts.player2 || "dad",
            instrumental: "",
            opponentVocals: ["Opponent"],
            playerVocals: ["Player"]
        };
        playData.stage = opts.stage || "stage";
        playData.noteStyle = "funkin";
        playData.ratings = ratings;
        if (opts.album) playData.album = opts.album;
        playData.previewStart = 0;
        playData.previewEnd = 0;

        return {
            version: "2.2.4",
            songName: opts.songName || "Unknown",
            artist: "Unknown",
            charter: "V-Slice Converter",
            looped: false,
            offsets: { instrumental: 0, altInstrumentals: {}, vocals: {}, altVocals: {} },
            playData,
            generatedBy: "Chart Converter V3 GCD",
            timeFormat: "ms",
            timeChanges: (opts.timeChanges && opts.timeChanges.length)
                ? opts.timeChanges
                : [{ t: 0, b: 0, bpm: opts.bpm || 100, n: 4, d: 4, bt: [4, 4, 4, 4] }]
        };
    }

    // ------------------------------------------------------------ V SLICE → PSYCH / KADE / CODENAME
    // target: "psych_v1" | "legacy" | "kade" | "codename"
    function normalizeTimeChanges(meta, warnings) {
        let tcs = meta && Array.isArray(meta.timeChanges) ? meta.timeChanges
            .map(tc => ({ t: toNum(tc.t, 0), bpm: toNum(tc.bpm, 0) }))
            .filter(tc => tc.bpm > 0) : [];
        if (!tcs.length) {
            warnings.push("No se encontró metadata con timeChanges: se asumió 100 BPM. Sube también el archivo -metadata.json para obtener el BPM real.");
            tcs = [{ t: 0, bpm: 100 }];
        }
        tcs.sort((a, b) => a.t - b.t);
        if (tcs[0].t > 0) tcs.unshift({ t: 0, bpm: tcs[0].bpm });
        else tcs[0].t = 0;
        return tcs;
    }

    // Divide la canción en secciones (4 beats; se acorta si cae un cambio de BPM dentro).
    function buildSections(tcs, endTime) {
        const sections = [];
        let s = 0;
        const bpmAt = t => { let b = tcs[0].bpm; for (const tc of tcs) if (tc.t <= t + 1) b = tc.bpm; return b; };
        while (s <= endTime + 1 && sections.length < 20000) {
            const bpm = bpmAt(s);
            const beatMs = 60000 / bpm;
            const full = 4 * beatMs;
            const next = tcs.find(tc => tc.t > s + 1 && tc.t < s + full - 1);
            let beats = 4, nextStart = s + full;
            if (next) { beats = round4((next.t - s) / beatMs); nextStart = next.t; }
            sections.push({ start: s, beats, bpm, end: nextStart });
            s = nextStart;
        }
        return sections;
    }

    function sectionIndex(sections, t) {
        let lo = 0, hi = sections.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (sections[mid].start <= t + 1) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    function convertVSliceToTarget(chart, meta, target, opts) {
        opts = opts || {};
        const warnings = [];
        const camera = opts.camera !== false;
        const zoomOn = opts.zoom !== false;

        let notesByDiff = chart && chart.notes;
        if (Array.isArray(notesByDiff)) notesByDiff = { normal: notesByDiff };
        if (!notesByDiff || typeof notesByDiff !== "object" || !Object.keys(notesByDiff).length) {
            throw new Error("El chart V-Slice no contiene notas (campo 'notes' con dificultades).");
        }

        const tcs = normalizeTimeChanges(meta, warnings);
        const pd = (meta && meta.playData) || {};
        const chars = pd.characters || {};
        const songName = (meta && meta.songName) || opts.songName || "Unknown";
        const player1 = chars.player || "bf";
        const player2 = chars.opponent || "dad";
        const gf = chars.girlfriend || "gf";
        const stage = pd.stage || "stage";
        const key = slug(songName, opts.songKey || "song");
        const diffs = Object.keys(notesByDiff);

        const allEvents = (Array.isArray(chart.events) ? chart.events : [])
            .map(e => ({ t: toNum(e.t, NaN), e: e.e, v: e.v || {} }))
            .filter(e => Number.isFinite(e.t))
            .sort((a, b) => a.t - b.t);
        const focusEvents = camera ? allEvents.filter(e => e.e === "FocusCamera")
            .map(e => ({ t: e.t, c: Number(toNum(e.v.char, 0)) })) : [];
        const zoomEvents = zoomOn ? allEvents.filter(e => e.e === "ZoomCamera") : [];
        const otherEvents = allEvents.filter(e => e.e !== "FocusCamera" && e.e !== "ZoomCamera");
        if (otherEvents.length) {
            const names = [...new Set(otherEvents.map(e => e.e))].slice(0, 6).join(", ");
            warnings.push(`${otherEvents.length} evento(s) sin equivalente omitidos (${names}).`);
        }

        const files = [];
        const isCodename = target === "codename";
        const isV1 = target === "psych_v1";
        const isKade = target === "kade";

        // Lane inversa (exacta respecto a la conversión normal)
        const encodeLane = (d, mustHit) => {
            const lane = ((Math.round(d) % 8) + 8) % 8;
            if (isV1) return lane;
            const isPlayer = lane < 4;
            const lo = lane % 4;
            return (isPlayer === !!mustHit) ? lo : lo + 4;
        };

        const focusAt = t => {
            let c = 0; // por defecto: jugador
            for (const f of focusEvents) { if (f.t <= t + 2) c = f.c; else break; }
            return c;
        };

        const diffNames = {};
        let lostFocus = 0, approxZoom = 0;

        diffs.forEach(diff => {
            const notes = (Array.isArray(notesByDiff[diff]) ? notesByDiff[diff] : [])
                .filter(n => n && Number.isFinite(toNum(n.t, NaN)))
                .sort((a, b) => a.t - b.t);
            const speed = toNum(chart.scrollSpeed && chart.scrollSpeed[diff], 1);

            let endTime = 0;
            notes.forEach(n => { endTime = Math.max(endTime, n.t + toNum(n.l, 0)); });
            allEvents.forEach(e => { endTime = Math.max(endTime, e.t); });
            const sections = buildSections(tcs, endTime);
            const bySection = sections.map(() => []);

            if (isCodename) {
                const noteTypes = [];
                const lines = [
                    { type: 0, notes: [] }, { type: 1, notes: [] }, { type: 2, notes: [] }
                ];
                notes.forEach(n => {
                    const d = ((Math.round(toNum(n.d, 0)) % 8) + 8) % 8;
                    const out = { time: round3(n.t), id: d % 4, type: 0, sLen: round3(Math.max(0, toNum(n.l, 0))) };
                    if (typeof n.k === "string" && n.k) {
                        let i = noteTypes.indexOf(n.k);
                        if (i < 0) { noteTypes.push(n.k); i = noteTypes.length - 1; }
                        out.type = i + 1;
                    }
                    lines[d < 4 ? 1 : 0].notes.push(out);
                });
                const strumLines = [
                    { characters: [player2], type: 0, notes: lines[0].notes, position: "dad", visible: true, strumPos: [0.25, 50], strumScale: 1, vocalsSuffix: "" },
                    { characters: [player1], type: 1, notes: lines[1].notes, position: "boyfriend", visible: true, strumPos: [0.75, 50], strumScale: 1, vocalsSuffix: "" },
                    { characters: [gf], type: 2, notes: lines[2].notes, position: "girlfriend", visible: false, strumPos: [0.5, 50], strumScale: 1, vocalsSuffix: "" }
                ];
                const events = [];
                focusEvents.forEach(f => events.push({ name: "Camera Movement", time: round3(f.t), params: [f.c === 0 ? 1 : (f.c === 2 ? 2 : 0)] }));
                zoomEvents.forEach(z => events.push({
                    name: "Camera Zoom", time: round3(z.t),
                    params: [true, toNum(z.v.zoom, 1), "camGame", toNum(z.v.duration, 4), z.v.ease || "expoInOut", "beat", z.v.mode === "stage" ? "stage" : "direct"]
                }));
                tcs.slice(1).forEach(tc => events.push({ name: "BPM Change", time: round3(tc.t), params: [tc.bpm] }));
                events.sort((a, b) => a.time - b.time);
                const cMeta = { name: key, displayName: songName, bpm: tcs[0].bpm, beatsPerMeasure: 4, stepsPerBeat: 4, difficulties: diffs.map(d => d.toUpperCase()), icon: player2 };
                files.push({
                    name: `charts/${key}/${diff}.json`,
                    content: JSON.stringify({ strumLines, events, meta: cMeta, noteTypes, scrollSpeed: speed, stage, codenameChart: true }, null, 2)
                });
                diffNames[diff] = true;
                return;
            }

            // --- Psych / Kade: secciones
            const focusPerSection = sections.map(sec => focusAt(sec.start));
            notes.forEach(n => {
                const i = sectionIndex(sections, n.t);
                const mustHit = focusPerSection[i] === 0;
                const out = [round3(n.t), encodeLane(toNum(n.d, 0), mustHit), round3(Math.max(0, toNum(n.l, 0)))];
                if (typeof n.k === "string" && n.k) out.push(n.k);
                bySection[i].push(out);
            });

            const evGroups = new Map(); // t → [[nombre, v1, v2]]
            const pushEv = (t, name, v1, v2) => {
                const k = round3(t);
                if (!evGroups.has(k)) evGroups.set(k, []);
                evGroups.get(k).push([name, String(v1), String(v2 == null ? "" : v2)]);
            };

            focusEvents.forEach(f => {
                const i = sectionIndex(sections, f.t);
                if (f.t > sections[i].start + 2) {
                    if (isV1) pushEv(f.t, "FocusCamera", f.c, "");
                    else lostFocus++;
                }
            });
            zoomEvents.forEach(z => {
                const zoom = toNum(z.v.zoom, 1);
                if (z.v.mode !== "stage") approxZoom++;
                pushEv(z.t, "Add Camera Zoom", round4(zoom - 1), "");
            });
            const events = [...evGroups.entries()].sort((a, b) => a[0] - b[0]).map(([t, list]) => [t, list]);

            let prevBpm = tcs[0].bpm;
            const notesOut = sections.map((sec, i) => {
                const changeBPM = i > 0 && sec.bpm !== prevBpm;
                prevBpm = sec.bpm;
                const sOut = {
                    sectionNotes: bySection[i],
                    sectionBeats: sec.beats,
                    lengthInSteps: Math.round(sec.beats * 4),
                    mustHitSection: focusPerSection[i] === 0,
                    gfSection: focusPerSection[i] === 2,
                    bpm: sec.bpm,
                    changeBPM,
                    altAnim: false,
                    typeOfSection: 0
                };
                if (isKade) { sOut.startTime = round3(sec.start); sOut.endTime = round3(sec.end); }
                return sOut;
            });

            const songObj = {
                song: songName,
                notes: notesOut,
                events: isKade ? [] : events,
                bpm: tcs[0].bpm,
                needsVoices: true,
                speed,
                player1, player2,
                gfVersion: gf,
                stage,
                validScore: true
            };
            if (isKade) songObj.eventObjects = [{ name: "Init BPM", position: 0, value: tcs[0].bpm, type: "BPM Change" }];
            if (isV1) { songObj.format = "psych_v1"; songObj.offset = 0; }

            const content = JSON.stringify(isV1 ? songObj : { song: songObj }, null, 2);
            const fname = diff === "normal" ? `${key}.json` : `${key}-${diff}.json`;
            files.push({ name: fname, content });
        });

        if (lostFocus) warnings.push(`${lostFocus} cambio(s) de cámara a mitad de sección no caben en el formato legacy (se ajustan al inicio de la sección).`);
        if (approxZoom) warnings.push(`${approxZoom} ZoomCamera en modo 'direct' aproximados como 'Add Camera Zoom'.`);

        if (isCodename) {
            files.push({
                name: `charts/${key}/meta.json`,
                content: JSON.stringify({ name: key, displayName: songName, bpm: tcs[0].bpm, beatsPerMeasure: 4, stepsPerBeat: 4, difficulties: diffs.map(d => d.toUpperCase()) }, null, 2)
            });
        }

        return { songName, key, files, warnings, difficulties: diffs };
    }

    const api = {
        parseJson, getDiff, songKeyFromFile, slug, baseName,
        convertPsychToVSlice, convertCodenameToVSlice, buildVSliceMeta, convertVSliceToTarget
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.ChartConverter = api;
})(typeof window !== "undefined" ? window : globalThis);
