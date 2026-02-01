const MODULE_ID = "fvtt-playlist-sync";

const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav", ".flac", ".m4a", ".webm", ".aac"];

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "rootPath", {
    name: "PLAYLISTSYNC.RootPath.name",
    hint: "PLAYLISTSYNC.RootPath.hint",
    scope: "world",
    config: true,
    type: String,
    default: "assets/audio"
  });

  game.settings.register(MODULE_ID, "flattenPaths", {
    name: "PLAYLISTSYNC.FlattenPaths.name",
    hint: "PLAYLISTSYNC.FlattenPaths.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });


  // Presets:
  //  - pattern: JS RegExp (plain source like "audio/ambient" or literal like "/audio\\/ambient/i")
  //  - volume: 0..1 (playlist volume)
  //  - repeat: boolean
  //  - channel: "music" | "ambient" | "interface"
  //  - fade: number (ms) applied to playlist sounds
  //  - mode: "keep" | "sequential" | "shuffle" | "simultaneous" | "manual"
  game.settings.register(MODULE_ID, "presets", {
    name: "PLAYLISTSYNC.Presets.name",
    hint: "PLAYLISTSYNC.Presets.hint",
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "syncMenu", {
    name: "PLAYLISTSYNC.SyncMenu.name",
    label: "PLAYLISTSYNC.SyncMenu.label",
    hint: "PLAYLISTSYNC.SyncMenu.hint",
    type: PlaylistSyncMenu,
    restricted: true
  });
});

class PlaylistSyncMenu extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "playlist-sync-menu",
      title: "PLAYLISTSYNC.MenuTitle",
      template: `modules/${MODULE_ID}/templates/sync-menu.hbs`,
      width: 520,
      closeOnSubmit: false
    });
  }

  getData() {
    const presets = getPresetsForUi();
    return {
      rootPath: game.settings.get(MODULE_ID, "rootPath"),
      flattenPaths: game.settings.get(MODULE_ID, "flattenPaths"),
      flattenLabel: game.i18n.localize("PLAYLISTSYNC.FlattenPaths.name"),
      flattenHint: game.i18n.localize("PLAYLISTSYNC.FlattenPaths.hint"),
      menuDescription: game.i18n.localize("PLAYLISTSYNC.MenuDescription"),
      menuExample1: game.i18n.format("PLAYLISTSYNC.MenuExample1", { rootPath: game.settings.get(MODULE_ID, "rootPath") }),
      menuExample2: game.i18n.localize("PLAYLISTSYNC.MenuExample2"),
      menuExample3: game.i18n.localize("PLAYLISTSYNC.MenuExample3"),
      menuLabel: game.i18n.localize("PLAYLISTSYNC.MenuLabel"),
      menuNote1: game.i18n.localize("PLAYLISTSYNC.MenuNote1"),
      menuButton: game.i18n.localize("PLAYLISTSYNC.MenuButton"),
      menuNote2: game.i18n.localize("PLAYLISTSYNC.MenuNote2"),

      presetsTitle: game.i18n.localize("PLAYLISTSYNC.PresetsTitle"),
      presetsHint: game.i18n.localize("PLAYLISTSYNC.PresetsHint"),
      presetsAdd: game.i18n.localize("PLAYLISTSYNC.PresetsAdd"),
      presetsEmpty: game.i18n.localize("PLAYLISTSYNC.PresetsEmpty"),

      presets: presets,
      channels: {
        music: game.i18n.localize("PLAYLISTSYNC.ChannelMusic"),
        environment: game.i18n.localize("PLAYLISTSYNC.ChannelEnvironment"),
        interface: game.i18n.localize("PLAYLISTSYNC.ChannelInterface")
      },

      modes: {
        keep: localizeWithFallback("PLAYLISTSYNC.PresetModeKeep", "Don't change"),
        sequential: localizeWithFallback("PLAYLISTSYNC.PresetModeSequential", "Sequential"),
        shuffle: localizeWithFallback("PLAYLISTSYNC.PresetModeShuffle", "Shuffle"),
        simultaneous: localizeWithFallback("PLAYLISTSYNC.PresetModeSimultaneous", "Simultaneous"),
        manual: localizeWithFallback("PLAYLISTSYNC.PresetModeManual", "Manual")
      },

      presetLabelPattern: localizeWithFallback("PLAYLISTSYNC.PresetLabelPattern", "RegExp"),
      presetLabelVolume: localizeWithFallback("PLAYLISTSYNC.PresetLabelVolume", "Volume"),
      presetLabelRepeat: localizeWithFallback("PLAYLISTSYNC.PresetLabelRepeat", "Repeat"),
      presetLabelChannel: localizeWithFallback("PLAYLISTSYNC.PresetLabelChannel", "Channel"),
      presetLabelFade: localizeWithFallback("PLAYLISTSYNC.PresetLabelFade", "Fade, ms"),
      presetLabelMode: localizeWithFallback("PLAYLISTSYNC.PresetLabelMode", "Playback mode"),

      presetMoveUpTitle: localizeWithFallback("PLAYLISTSYNC.PresetMoveUpTitle", "Up"),
      presetMoveDownTitle: localizeWithFallback("PLAYLISTSYNC.PresetMoveDownTitle", "Down"),
      presetDeleteTitle: localizeWithFallback("PLAYLISTSYNC.PresetDeleteTitle", "Delete"),
      presetInvalidRegexPrefix: localizeWithFallback("PLAYLISTSYNC.PresetInvalidRegexPrefix", "Invalid RegExp:")

    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('button[data-action="sync"]').on("click", async () => {
      await this._doSync();
    });

    html.find('input[name="rootPath"]').on("change", async (ev) => {
      const value = String(ev.currentTarget.value ?? "").trim();
      await game.settings.set(MODULE_ID, "rootPath", value);
      this.render(false);
    });

    html.find('input[name="flattenPaths"]').on("change", async (ev) => {
      const value = !!ev.currentTarget.checked;
      await game.settings.set(MODULE_ID, "flattenPaths", value);
      this.render(false);
    });

    // Presets UI
    html.find('button[data-action="add-preset"]').on("click", async () => {
      const presets = getPresetsRaw();
      presets.push(makeDefaultPreset());
      await savePresets(presets);
      this.render(false);
    });

    html.find('button[data-action="delete-preset"]').on("click", async (ev) => {
      const idx = Number(ev.currentTarget?.dataset?.index);
      if (!Number.isFinite(idx)) return;
      const presets = getPresetsRaw();
      presets.splice(idx, 1);
      await savePresets(presets);
      this.render(false);
    });

    html.find('button[data-action="move-preset"]').on("click", async (ev) => {
      const idx = Number(ev.currentTarget?.dataset?.index);
      const dir = String(ev.currentTarget?.dataset?.dir ?? "");
      if (!Number.isFinite(idx) || !dir) return;

      const presets = getPresetsRaw();
      const j = dir === "up" ? idx - 1 : dir === "down" ? idx + 1 : idx;
      if (j < 0 || j >= presets.length || j === idx) return;

      const tmp = presets[idx];
      presets[idx] = presets[j];
      presets[j] = tmp;

      await savePresets(presets);
      this.render(false);
    });

    // Any preset field change
    html.find(".playlist-sync-preset").on("change", "input, select", async (ev) => {
      const el = ev.currentTarget;
      const idx = Number(el?.dataset?.index);
      const field = String(el?.dataset?.field ?? "");
      if (!Number.isFinite(idx) || !field) return;

      const presets = getPresetsRaw();
      const p = presets[idx] ?? makeDefaultPreset();

      let v;
      if (el.type === "checkbox") v = !!el.checked;
      else v = String(el.value ?? "");

      switch (field) {
        case "pattern":
          p.pattern = String(v).trim();
          break;
        case "volume":
          p.volume = clamp01(Number(v));
          break;
        case "repeat":
          p.repeat = !!v;
          break;
        case "channel":
          p.channel = String(v);
          break;
        case "fade":
          p.fade = Math.max(0, Math.trunc(Number(v) || 0));
          break;
        case "mode":
          p.mode = String(v);
          break;
      }

      presets[idx] = sanitizePreset(p);
      await savePresets(presets);
      this.render(false);
    });
  }

  async _updateObject(_event, _formData) {
    // ничего: мы сохраняем rootPath на change
  }

  async _doSync() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("PLAYLISTSYNC.WarnGMOnly"));
      return;
    }

    const rootPath = normalizePath(game.settings.get(MODULE_ID, "rootPath") || "assets/audio");
    ui.notifications.info(
      game.i18n.format("PLAYLISTSYNC.InfoScanStart", { rootPath })
    );

    const t0 = Date.now();

    let files;
    try {
      files = await collectAudioFilesRecursive("data", rootPath);
      console.log(`${MODULE_ID} | found files:`, files.length, files.slice(0, 10));
    } catch (err) {
      console.error(`${MODULE_ID} | browse error`, err);
      ui.notifications.error(game.i18n.localize("PLAYLISTSYNC.ErrorBrowseFailed"));
      return;
    }

    const flattenPaths = !!game.settings.get(MODULE_ID, "flattenPaths");

    const plan = buildSyncPlan(files, rootPath, flattenPaths);

    // Compile presets once
    const compiledPresets = compilePresets(getPresetsRaw());

    const result = await applySyncPlan(plan, compiledPresets, { rootPath, flattenPaths });

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    ui.notifications.info(
      game.i18n.format("PLAYLISTSYNC.InfoScanComplete", {
        time: dt,
        playlists: result.playlistsTouched,
        sounds: result.soundsCreated
      })
    );
  }
}

function localizeWithFallback(key, fallback) {
  try {
    if (game?.i18n?.has?.(key)) return game.i18n.localize(key);
  } catch {}
  return fallback;
}

function normalizePath(p) {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function normalizePresetMode(mode) {
  const raw = String(mode ?? "").trim().toLowerCase();
  if (!raw) return "keep";
  if (raw === "soundboard") return "manual";
  const allowed = ["keep", "sequential", "shuffle", "simultaneous", "manual"];
  return allowed.includes(raw) ? raw : "keep";
}

function resolvePlaylistModeValue(presetMode, existingMode) {
  const key = normalizePresetMode(presetMode);
  if (key === "keep") return null;

  // Some FVTT versions store this as a string, others as a numeric enum.
  if (typeof existingMode === "string") {
    const map = {
      sequential: "sequential",
      shuffle: "shuffle",
      simultaneous: "simultaneous",
      manual: "soundboard"
    };
    return map[key] ?? null;
  }

  const modes =
    globalThis?.CONST?.PLAYLIST_MODES ??
    globalThis?.Playlist?.MODES ??
    null;

  const wanted = {
    sequential: "SEQUENTIAL",
    shuffle: "SHUFFLE",
    simultaneous: "SIMULTANEOUS",
    manual: "SOUNDBOARD"
  }[key];

  if (modes && wanted && modes[wanted] !== undefined) return modes[wanted];

  // Fallback mapping (common across many FVTT versions). We only use it if existingMode looks numeric.
  const fallback = { sequential: 1, shuffle: 2, simultaneous: 3, manual: 4 }[key];
  if (typeof existingMode === "number" && Number.isFinite(existingMode)) return fallback ?? null;

  return null;
}

function splitPath(p) {
  return normalizePath(p).split("/").filter(Boolean);
}

function safeDecode(str) {
  const s = String(str ?? "");
  try {
    // Иногда встречается '+' вместо пробелов, на всякий
    return decodeURIComponent(s.replace(/\+/g, "%20"));
  } catch {
    return s; // если строка невалидная, не падаем
  }
}


function getFileMetaUnderRoot(fullPath, rootPath) {
  const rootParts = splitPath(rootPath);
  const parts = splitPath(fullPath);

  // найти индекс rootPath в пути
  let start = 0;
  if (rootParts.length > 0) {
    const candidate = parts.slice(0, rootParts.length).join("/");
    if (candidate === rootParts.join("/")) start = rootParts.length;
  }

  const rel = parts.slice(start); // <category>/<subdirs...>/<file>
  if (rel.length < 2) return null;

  const category = safeDecode(rel[0]);
  const subdirs = rel.slice(1, -1).map(safeDecode);

  return { category, subdirs };
}

function taggedSoundName(fullPath, rootPath) {
  const base = decodedFileStem(fullPath);
  const meta = getFileMetaUnderRoot(fullPath, rootPath);
  if (!meta) return base;

  const tag = meta.subdirs.length ? meta.subdirs.join("/") : "";
  return tag ? `[${tag}] ${base}` : base;
}

function taggedSoundSortKey(fullPath, rootPath) {
  // чтобы сортировка была предсказуемой: сначала тег (если есть), потом имя
  const base = decodedFileStem(fullPath);
  const meta = getFileMetaUnderRoot(fullPath, rootPath);
  if (!meta) return base;

  const tag = meta.subdirs.length ? meta.subdirs.join("/") : "";
  return tag ? `${tag} ${base}` : base;
}


function getPresetsRaw() {
  const v = game.settings.get(MODULE_ID, "presets");
  return Array.isArray(v) ? v.map((p) => ({ ...p })) : [];
}

async function savePresets(presets) {
  const clean = Array.isArray(presets) ? presets.map(sanitizePreset) : [];
  await game.settings.set(MODULE_ID, "presets", clean);
}

function makeDefaultPreset() {
  return {
    id: foundry.utils.randomID(),
    pattern: "audio/ambient",
    volume: 0.8,
    repeat: false,
    channel: "environment",
    fade: 1000,
    mode: "keep"
  };
}

function sanitizePreset(p) {
  const out = {
    id: String(p?.id || foundry.utils.randomID()),
    pattern: String(p?.pattern ?? "").trim(),
    volume: clamp01(p?.volume ?? 0.8),
    repeat: !!p?.repeat,
    channel: ["music", "environment", "interface"].includes(String(p?.channel))
      ? String(p.channel)
      : "music",
    fade: Math.max(0, Math.trunc(Number(p?.fade) || 0)),
    mode: normalizePresetMode(p?.mode)
  };
  return out;
}

function parseRegexString(pattern) {
  const s = String(pattern ?? "").trim();
  if (!s) return { source: null, flags: null, error: new Error("empty") };
  const m = s.match(/^\/(.*)\/([dgimsuy]*)$/);
  if (m) return { source: m[1], flags: m[2], error: null };
  return { source: s, flags: "", error: null };
}

function compilePresets(presets) {
  const compiled = [];
  for (const raw of Array.isArray(presets) ? presets : []) {
    const p = sanitizePreset(raw);
    const parsed = parseRegexString(p.pattern);
    if (parsed.error) continue;
    try {
      const re = new RegExp(parsed.source, parsed.flags || "");
      compiled.push({ ...p, re });
    } catch (err) {
      console.warn(`${MODULE_ID} | bad preset regex:`, p.pattern, err);
      // Без всплывашек: не хочется спамить при каждом рендере
    }
  }
  return compiled;
}

function getPresetsForUi() {
  return getPresetsRaw().map((raw) => {
    const p = sanitizePreset(raw);
    const parsed = parseRegexString(p.pattern);
    let valid = true;
    let error = "";
    if (parsed.error) {
      valid = false;
      error = parsed.error.message;
    } else {
      try {
        // eslint-disable-next-line no-new
        new RegExp(parsed.source, parsed.flags || "");
      } catch (e) {
        valid = false;
        error = String(e?.message ?? e);
      }
    }
    return { ...p, _valid: valid, _error: error };
  });
}

function matchPresetForPlaylistPath(playlistPath, compiledPresets) {
  const pth = normalizePath(safeDecode(playlistPath));
  for (const p of compiledPresets ?? []) {
    try {
      if (p?.re?.test?.(pth)) return p;
    } catch {}
  }
  return null;
}

function encodePathName(name) {
  // Для поиска старых "закодированных" плейлистов вида %D0%...
  return String(name ?? "")
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

function decodedFileStem(path) {
  const base = splitPath(path).pop() ?? "";
  const decoded = safeDecode(base);
  const lastDot = decoded.lastIndexOf(".");
  return lastDot > 0 ? decoded.slice(0, lastDot) : decoded;
}

function fileBaseName(path) {
  const parts = splitPath(path);
  const file = parts[parts.length - 1] ?? "";
  const lastDot = file.lastIndexOf(".");
  return lastDot > 0 ? file.slice(0, lastDot) : file;
}

function fileExt(path) {
  const base = splitPath(path).pop() ?? "";
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx).toLowerCase() : "";
}

async function collectAudioFilesRecursive(source, dir) {
  const out = [];

  async function walk(currentDir) {
    // ВАЖНО: не используем options.extensions, потому что оно часто отсекает всё "в ноль"
    const res = await FilePicker.browse(source, currentDir);

    // files
    for (const f of res.files ?? []) {
      const ext = fileExt(f);
      if (!AUDIO_EXTENSIONS.includes(ext)) continue;
      out.push(normalizePath(f));
    }

    // dirs
    for (const d of res.dirs ?? []) {
      await walk(normalizePath(d));
    }
  }

  await walk(normalizePath(dir));
  return out;
}


/**
 * Правило:
 *  Data/<rootPath>/<category>/<subdirs...>/<file>
 *  category => Folder (Playlist) (если режим не "плоский")
 *  playlistName => subdirs... (как путь, например "battle" или "horror/crypt")
 *
 * Если включён "плоский" режим (FlattenPaths):
 *  - создаётся только один плейлист на category
 *  - все файлы из подпапок добавляются в корневой плейлист
 *  - имена звуков получают префикс-тег из подпапок: "[horror] home" или "[horror/crypt] home"
 */
function buildSyncPlan(files, rootPath, flattenPaths = false) {
  /** @type {Map<string, Map<string, {files: string[], fsPath: string}>>} category -> playlistName -> meta */
  const plan = new Map();

  for (const full of files) {
    const meta = getFileMetaUnderRoot(full, rootPath);
    if (!meta) continue;

    const { category, subdirs } = meta;

    const playlistSubPath = subdirs.length ? subdirs.join("/") : "";

    const playlistName = flattenPaths ? category : (playlistSubPath || category);
    if (!playlistName) continue;

    const fsPath = normalizePath(
      `${safeDecode(rootPath)}/${category}${(!flattenPaths && playlistSubPath) ? `/${playlistSubPath}` : ""}`
    );

    if (!plan.has(category)) plan.set(category, new Map());
    const catMap = plan.get(category);

    if (!catMap.has(playlistName)) catMap.set(playlistName, { files: [], fsPath });
    catMap.get(playlistName).files.push(full);
  }

  // сортируем файлы внутри каждой группы
  for (const [, catMap] of plan) {
    for (const [pl, meta] of catMap) {
      meta.files.sort((a, b) => {
        const ka = flattenPaths ? taggedSoundSortKey(a, rootPath) : decodedFileStem(a);
        const kb = flattenPaths ? taggedSoundSortKey(b, rootPath) : decodedFileStem(b);
        return ka.localeCompare(kb, "ru");
      });
      catMap.set(pl, meta);
    }
  }

  return plan;
}

async function getOrCreatePlaylistFolder(name) {
  const existing = game.folders?.find(
    (f) => f.type === "Playlist" && f.name === name && !f.folder
  );
  if (existing) return existing;

  return await Folder.create({
    name,
    type: "Playlist",
    folder: null
  });
}

async function getOrCreatePlaylist(name, folderId, options = {}) {
  const { preferAnyFolder = false } = options || {};

  // В "плоском" режиме лучше переиспользовать существующий плейлист с тем же именем,
  // даже если он лежит внутри папки (чтобы не плодить дубликаты).
  if (preferAnyFolder && folderId == null) {
    const existingAny = game.playlists?.find((p) => p.name === name);
    if (existingAny) {
      // при желании выносим в корень
      if ((existingAny.folder?.id ?? null) !== null) {
        await existingAny.update({ folder: null }, { render: false });
      }
      return existingAny;
    }
  }

  const existing = game.playlists?.find(
    (p) => p.name === name && (p.folder?.id ?? null) === folderId
  );
  if (existing) return existing;

  return await Playlist.create(
    {
      name,
      folder: folderId
    },
    { renderSheet: false }
  );
}

async function applyPlaylistPreset(playlist, preset) {
  if (!preset) return;

  const data = playlist.toObject();
  const update = {};

  if (typeof preset.volume === "number" && Number.isFinite(preset.volume) && Object.hasOwn(data, "volume")) {
    update.volume = clamp01(preset.volume);
  }
  if (Object.hasOwn(data, "repeat")) {
    update.repeat = !!preset.repeat;
  }
  if (Object.hasOwn(data, "channel")) {
    update.channel = preset.channel;
  }
  if (Object.hasOwn(data, "fade") && typeof preset?.fade === "number" && Number.isFinite(preset.fade)) {
    update.fade = Math.max(0, Math.trunc(preset.fade));
  }

  if (Object.hasOwn(data, "mode")) {
    const modeValue = resolvePlaylistModeValue(preset?.mode, data.mode);
    if (modeValue !== null) update.mode = modeValue;
  }

  if (Object.keys(update).length) {
    await playlist.update(update, { render: false });
  }
}

async function replacePlaylistSounds(playlist, filePaths, preset, options = {}) {
  const { rootPath = "", flattenPaths = false } = options || {};

  const existingIds = playlist.sounds?.map((s) => s.id) ?? [];
  if (existingIds.length) {
    await playlist.deleteEmbeddedDocuments("PlaylistSound", existingIds);
  }

  const hasPresetVolume = typeof preset?.volume === "number" && Number.isFinite(preset.volume);
  const hasPlaylistVolume = (() => {
    try {
      return Object.hasOwn(playlist.toObject(), "volume");
    } catch {
      return false;
    }
  })();

  const perSoundVolume = hasPresetVolume && hasPlaylistVolume ? 1.0 : 0.8; // чтобы не умножать громкость дважды
  const repeat = typeof preset?.repeat === "boolean" ? preset.repeat : false;
  const channel = preset?.channel;
  const fade = Number.isFinite(Number(preset?.fade)) ? Math.max(0, Math.trunc(Number(preset.fade))) : null;

  const soundsData = filePaths.map((path, i) => ({
    name: flattenPaths ? taggedSoundName(path, rootPath) : decodedFileStem(path),
    path,
    repeat,
    volume: perSoundVolume,
    ...(channel ? { channel } : {}),
    ...(fade !== null ? { fade } : {}),
    sort: (i + 1) * 10
  }));

  if (soundsData.length) {
    await playlist.createEmbeddedDocuments("PlaylistSound", soundsData);
  }

  return soundsData.length;
}

async function applySyncPlan(plan, compiledPresets, options = {}) {
  const { rootPath = "", flattenPaths = false } = options || {};

  let playlistsTouched = 0;
  let soundsCreated = 0;

  for (const [category, playlists] of plan.entries()) {
    const folderId = flattenPaths ? null : (await getOrCreatePlaylistFolder(category)).id;

    for (const [playlistName, meta] of playlists.entries()) {
      const playlist = await getOrCreatePlaylist(playlistName, folderId, { preferAnyFolder: flattenPaths });

      const preset = matchPresetForPlaylistPath(meta.fsPath, compiledPresets);
      await applyPlaylistPreset(playlist, preset);

      const created = await replacePlaylistSounds(playlist, meta.files, preset, { rootPath, flattenPaths });

      playlistsTouched += 1;
      soundsCreated += created;
    }
  }

  return { playlistsTouched, soundsCreated };
}
