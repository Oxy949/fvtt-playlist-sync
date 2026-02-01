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

  // Sound synchronization behavior. Recreating sounds breaks UUID references in the world.
  game.settings.register(MODULE_ID, "soundSyncStrategy", {
    name: "PLAYLISTSYNC.SoundSyncStrategy.name",
    hint: "PLAYLISTSYNC.SoundSyncStrategy.hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      merge: "PLAYLISTSYNC.SoundSyncStrategy.merge",
      recreate: "PLAYLISTSYNC.SoundSyncStrategy.recreate"
    },
    default: "merge"
  });

  // How we match a filesystem file to an existing PlaylistSound.
  game.settings.register(MODULE_ID, "soundMatchMode", {
    name: "PLAYLISTSYNC.SoundMatchMode.name",
    hint: "PLAYLISTSYNC.SoundMatchMode.hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      name: "PLAYLISTSYNC.SoundMatchMode.nameChoice",
      path: "PLAYLISTSYNC.SoundMatchMode.pathChoice",
      stem: "PLAYLISTSYNC.SoundMatchMode.stemChoice"
    },
    default: "name"
  });

  // What to do with sounds that exist in the playlist but are not found on disk.
  game.settings.register(MODULE_ID, "orphanPolicy", {
    name: "PLAYLISTSYNC.OrphanPolicy.name",
    hint: "PLAYLISTSYNC.OrphanPolicy.hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      keep: "PLAYLISTSYNC.OrphanPolicy.keep",
      deleteManaged: "PLAYLISTSYNC.OrphanPolicy.deleteManaged",
      deleteAll: "PLAYLISTSYNC.OrphanPolicy.deleteAll"
    },
    default: "keep"
  });

  // Fine-grained update toggles (only used for merge strategy).
  game.settings.register(MODULE_ID, "updateSoundParams", {
    name: "PLAYLISTSYNC.UpdateSoundParams.name",
    hint: "PLAYLISTSYNC.UpdateSoundParams.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "updateSoundPath", {
    name: "PLAYLISTSYNC.UpdateSoundPath.name",
    hint: "PLAYLISTSYNC.UpdateSoundPath.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "updateSoundName", {
    name: "PLAYLISTSYNC.UpdateSoundName.name",
    hint: "PLAYLISTSYNC.UpdateSoundName.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "updateSoundSort", {
    name: "PLAYLISTSYNC.UpdateSoundSort.name",
    hint: "PLAYLISTSYNC.UpdateSoundSort.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "markManagedSounds", {
    name: "PLAYLISTSYNC.MarkManagedSounds.name",
    hint: "PLAYLISTSYNC.MarkManagedSounds.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Prefer matching sounds by the module metadata (sourcePath flag) when available.
  // Makes sync idempotent even if the sound name was changed (manually or by FVTT).
  game.settings.register(MODULE_ID, "preferManagedMatch", {
    name: "PLAYLISTSYNC.PreferManagedMatch.name",
    hint: "PLAYLISTSYNC.PreferManagedMatch.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
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
      width: 560,
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

      soundSyncTitle: game.i18n.localize("PLAYLISTSYNC.SoundSyncTitle"),
      soundSyncHint: game.i18n.localize("PLAYLISTSYNC.SoundSyncHint"),

      soundSyncStrategy: game.settings.get(MODULE_ID, "soundSyncStrategy"),
      soundSyncStrategyLabel: game.i18n.localize("PLAYLISTSYNC.SoundSyncStrategy.label"),
      soundSyncStrategyHint: game.i18n.localize("PLAYLISTSYNC.SoundSyncStrategy.hint"),
      soundStrategies: {
        merge: localizeWithFallback("PLAYLISTSYNC.SoundSyncStrategy.merge", "Update existing (preserve references)"),
        recreate: localizeWithFallback("PLAYLISTSYNC.SoundSyncStrategy.recreate", "Recreate all (break references)")
      },

      soundMatchMode: game.settings.get(MODULE_ID, "soundMatchMode"),
      soundMatchModeLabel: game.i18n.localize("PLAYLISTSYNC.SoundMatchMode.label"),
      soundMatchModeHint: game.i18n.localize("PLAYLISTSYNC.SoundMatchMode.hint"),
      soundMatchModes: {
        name: localizeWithFallback("PLAYLISTSYNC.SoundMatchMode.nameChoice", "By name"),
        path: localizeWithFallback("PLAYLISTSYNC.SoundMatchMode.pathChoice", "By file path"),
        stem: localizeWithFallback("PLAYLISTSYNC.SoundMatchMode.stemChoice", "By filename stem")
      },

      orphanPolicy: game.settings.get(MODULE_ID, "orphanPolicy"),
      orphanPolicyLabel: game.i18n.localize("PLAYLISTSYNC.OrphanPolicy.label"),
      orphanPolicyHint: game.i18n.localize("PLAYLISTSYNC.OrphanPolicy.hint"),
      orphanPolicies: {
        keep: localizeWithFallback("PLAYLISTSYNC.OrphanPolicy.keep", "Keep"),
        deleteManaged: localizeWithFallback("PLAYLISTSYNC.OrphanPolicy.deleteManaged", "Delete only managed"),
        deleteAll: localizeWithFallback("PLAYLISTSYNC.OrphanPolicy.deleteAll", "Delete all unmatched")
      },

      updateSoundParams: !!game.settings.get(MODULE_ID, "updateSoundParams"),
      updateSoundParamsLabel: game.i18n.localize("PLAYLISTSYNC.UpdateSoundParams.label"),
      updateSoundParamsHint: game.i18n.localize("PLAYLISTSYNC.UpdateSoundParams.hint"),

      updateSoundPath: !!game.settings.get(MODULE_ID, "updateSoundPath"),
      updateSoundPathLabel: game.i18n.localize("PLAYLISTSYNC.UpdateSoundPath.label"),
      updateSoundPathHint: game.i18n.localize("PLAYLISTSYNC.UpdateSoundPath.hint"),

      updateSoundName: !!game.settings.get(MODULE_ID, "updateSoundName"),
      updateSoundNameLabel: game.i18n.localize("PLAYLISTSYNC.UpdateSoundName.label"),
      updateSoundNameHint: game.i18n.localize("PLAYLISTSYNC.UpdateSoundName.hint"),

      updateSoundSort: !!game.settings.get(MODULE_ID, "updateSoundSort"),
      updateSoundSortLabel: game.i18n.localize("PLAYLISTSYNC.UpdateSoundSort.label"),
      updateSoundSortHint: game.i18n.localize("PLAYLISTSYNC.UpdateSoundSort.hint"),

      markManagedSounds: !!game.settings.get(MODULE_ID, "markManagedSounds"),
      markManagedSoundsLabel: game.i18n.localize("PLAYLISTSYNC.MarkManagedSounds.label"),
      markManagedSoundsHint: game.i18n.localize("PLAYLISTSYNC.MarkManagedSounds.hint"),

      preferManagedMatch: !!game.settings.get(MODULE_ID, "preferManagedMatch"),
      preferManagedMatchLabel: game.i18n.localize("PLAYLISTSYNC.PreferManagedMatch.label"),
      preferManagedMatchHint: game.i18n.localize("PLAYLISTSYNC.PreferManagedMatch.hint"),

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

    // Sound sync options (stored as world settings)
    for (const key of ["soundSyncStrategy", "soundMatchMode", "orphanPolicy"]) {
      html.find(`select[name="${key}"]`).on("change", async (ev) => {
        const value = String(ev.currentTarget.value ?? "");
        await game.settings.set(MODULE_ID, key, value);
        this.render(false);
      });
    }

    for (const key of [
      "updateSoundParams",
      "updateSoundPath",
      "updateSoundName",
      "updateSoundSort",
      "markManagedSounds",
      "preferManagedMatch"
    ]) {
      html.find(`input[name="${key}"]`).on("change", async (ev) => {
        const value = !!ev.currentTarget.checked;
        await game.settings.set(MODULE_ID, key, value);
        this.render(false);
      });
    }

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

    const soundSyncStrategy = String(game.settings.get(MODULE_ID, "soundSyncStrategy") ?? "merge");
    const soundMatchMode = String(game.settings.get(MODULE_ID, "soundMatchMode") ?? "name");
    const orphanPolicy = String(game.settings.get(MODULE_ID, "orphanPolicy") ?? "keep");
    const updateSoundParams = !!game.settings.get(MODULE_ID, "updateSoundParams");
    const updateSoundPath = !!game.settings.get(MODULE_ID, "updateSoundPath");
    const updateSoundName = !!game.settings.get(MODULE_ID, "updateSoundName");
    const updateSoundSort = !!game.settings.get(MODULE_ID, "updateSoundSort");
    const markManagedSounds = !!game.settings.get(MODULE_ID, "markManagedSounds");
    const preferManagedMatch = !!game.settings.get(MODULE_ID, "preferManagedMatch");

    const plan = buildSyncPlan(files, rootPath, flattenPaths);

    // Compile presets once
    const compiledPresets = compilePresets(getPresetsRaw());

    const result = await applySyncPlan(plan, compiledPresets, {
      rootPath,
      flattenPaths,
      soundSyncStrategy,
      soundMatchMode,
      orphanPolicy,
      updateSoundParams,
      updateSoundPath,
      updateSoundName,
      updateSoundSort,
      markManagedSounds,
      preferManagedMatch
    });

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    ui.notifications.info(
      game.i18n.format("PLAYLISTSYNC.InfoScanComplete", {
        time: dt,
        playlists: result.playlistsTouched,
        created: result.soundsCreated,
        updated: result.soundsUpdated,
        deleted: result.soundsDeleted
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

  // Громкость применяется на звуки, а не на плейлист
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

function extractStemFromDisplayName(name) {
  // In flattened mode, names look like "[horror/crypt] home".
  // Strip the leading tag to get a stable file stem.
  const s = String(name ?? "");
  return s.replace(/^\[[^\]]+\]\s*/u, "").trim();
}

function toSoundId(sound) {
  return sound?.id ?? sound?._id ?? null;
}

function isManagedSound(sound) {
  try {
    return !!sound?.getFlag?.(MODULE_ID, "managed") || !!sound?.flags?.[MODULE_ID]?.managed;
  } catch {
    return !!sound?.flags?.[MODULE_ID]?.managed;
  }
}

function getManagedMeta(sound) {
  try {
    return {
      sourcePath: sound?.getFlag?.(MODULE_ID, "sourcePath") ?? sound?.flags?.[MODULE_ID]?.sourcePath ?? null,
      stem: sound?.getFlag?.(MODULE_ID, "stem") ?? sound?.flags?.[MODULE_ID]?.stem ?? null
    };
  } catch {
    return {
      sourcePath: sound?.flags?.[MODULE_ID]?.sourcePath ?? null,
      stem: sound?.flags?.[MODULE_ID]?.stem ?? null
    };
  }
}

function pushToMultiMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function indexExistingSounds(sounds) {
  const byName = new Map();
  const byPath = new Map();
  const byStem = new Map();
  const byManagedPath = new Map();

  for (const s of sounds ?? []) {
    const name = String(s?.name ?? "").trim();
    const pth = normalizePath(s?.path ?? "");

    const stemFromName = extractStemFromDisplayName(name);
    const meta = getManagedMeta(s);
    const stem = String(meta?.stem ?? "") || stemFromName || decodedFileStem(pth) || name;

    const managedPath = normalizePath(meta?.sourcePath ?? "");

    pushToMultiMap(byName, name, s);
    pushToMultiMap(byPath, pth, s);
    pushToMultiMap(byStem, stem, s);
    if (managedPath) pushToMultiMap(byManagedPath, managedPath, s);
  }

  return { byName, byPath, byStem, byManagedPath };
}

function pickBestCandidate(candidates, usedIds) {
  const list = Array.isArray(candidates) ? candidates : [];
  const filtered = list.filter((s) => {
    const id = toSoundId(s);
    return id && !usedIds.has(id);
  });
  if (!filtered.length) return null;
  const managed = filtered.find(isManagedSound);
  return managed ?? filtered[0];
}

function buildDesiredSoundData(filePaths, preset, options = {}) {
  const { rootPath = "", flattenPaths = false } = options || {};

  // If no preset matched the playlist, don't force per-sound parameters on existing sounds.
  // (Otherwise we would keep resetting user-tweaked volume/repeat/etc on every sync.)
  const hasPreset = !!preset;

  const hasPresetVolume = hasPreset && typeof preset?.volume === "number" && Number.isFinite(preset.volume);
  const perSoundVolume = hasPresetVolume ? clamp01(preset.volume) : null;

  const repeat = hasPreset && typeof preset?.repeat === "boolean" ? !!preset.repeat : null;
  const channel = hasPreset ? preset?.channel : null;
  const fade = hasPreset && Number.isFinite(Number(preset?.fade)) ? Math.max(0, Math.trunc(Number(preset.fade))) : null;

  return (filePaths ?? []).map((path, i) => {
    const normPath = normalizePath(path);
    const stem = decodedFileStem(normPath);
    const name = flattenPaths ? taggedSoundName(normPath, rootPath) : stem;

    return {
      name,
      stem,
      path: normPath,
      repeat,
      volume: perSoundVolume,
      channel,
      fade,
      sort: (i + 1) * 10
    };
  });
}

function buildManagedFlags(desired) {
  return {
    [MODULE_ID]: {
      managed: true,
      sourcePath: desired.path,
      stem: desired.stem
    }
  };
}

async function recreatePlaylistSounds(playlist, filePaths, preset, options = {}) {
  const desired = buildDesiredSoundData(filePaths, preset, options);
  const markManagedSounds = !!options?.markManagedSounds;

  const existingIds = (playlist.sounds?.map?.((s) => toSoundId(s)) ?? [])
    .filter(Boolean);
  const deleted = existingIds.length;

  const soundsData = desired.map((d) => ({
    name: d.name,
    path: d.path,
    repeat: d.repeat ?? false,
    volume: d.volume ?? 0.8,
    ...(d.channel ? { channel: d.channel } : {}),
    ...(d.fade !== null ? { fade: d.fade } : {}),
    sort: d.sort,
    ...(markManagedSounds ? { flags: buildManagedFlags(d) } : {})
  }));

  // Safer order: create first, then delete old (so a failed create doesn't wipe the playlist).
  if (soundsData.length) {
    await playlist.createEmbeddedDocuments("PlaylistSound", soundsData, { render: false });
  }

  if (existingIds.length) {
    await playlist.deleteEmbeddedDocuments("PlaylistSound", existingIds, { render: false });
  }

  return { created: soundsData.length, updated: 0, deleted };
}

async function mergePlaylistSounds(playlist, filePaths, preset, options = {}) {
  const {
    rootPath = "",
    flattenPaths = false,
    soundMatchMode = "name",
    orphanPolicy = "keep",
    updateSoundParams = true,
    updateSoundPath = true,
    updateSoundName = true,
    updateSoundSort = true,
    markManagedSounds = true,
    preferManagedMatch = true
  } = options || {};

  const existingSounds = playlist.sounds?.contents ?? Array.from(playlist.sounds ?? []);
  const idx = indexExistingSounds(existingSounds);

  const desired = buildDesiredSoundData(filePaths, preset, { rootPath, flattenPaths });

  const usedIds = new Set();
  const updates = [];
  const creates = [];

  function getKey(d) {
    switch (String(soundMatchMode ?? "name")) {
      case "path":
        return { map: idx.byPath, key: d.path };
      case "stem":
        return { map: idx.byStem, key: d.stem };
      case "name":
      default:
        return { map: idx.byName, key: d.name };
    }
  }

  for (const d of desired) {
    // First, try to match by module metadata (sourcePath flag). This keeps sync idempotent
    // even if the user renamed a sound, or FVTT auto-adjusted the name.
    let candidate = null;
    if (preferManagedMatch) {
      candidate = pickBestCandidate(idx.byManagedPath.get(d.path), usedIds);
    }
    if (!candidate) {
      const { map, key } = getKey(d);
      candidate = pickBestCandidate(map.get(key), usedIds);
    }

    if (candidate) {
      const id = toSoundId(candidate);
      usedIds.add(id);

      const upd = { _id: id };
      let changed = false;

      if (updateSoundParams) {
        if (d.repeat !== null && typeof candidate.repeat === "boolean" && candidate.repeat !== d.repeat) {
          upd.repeat = d.repeat;
          changed = true;
        }

        const vol = Number(candidate.volume);
        if (d.volume !== null && Number.isFinite(vol) && Math.abs(vol - d.volume) > 1e-6) {
          upd.volume = d.volume;
          changed = true;
        }

        if (d.channel && candidate.channel !== d.channel) {
          upd.channel = d.channel;
          changed = true;
        }

        if (d.fade !== null && Number(candidate.fade) !== d.fade) {
          upd.fade = d.fade;
          changed = true;
        }
      }

      if (updateSoundPath && normalizePath(candidate.path ?? "") !== d.path) {
        upd.path = d.path;
        changed = true;
      }

      if (updateSoundName && String(candidate.name ?? "") !== d.name) {
        upd.name = d.name;
        changed = true;
      }

      if (updateSoundSort && Number(candidate.sort) !== d.sort) {
        upd.sort = d.sort;
        changed = true;
      }

      if (markManagedSounds) {
        const alreadyManaged = isManagedSound(candidate);
        const meta = getManagedMeta(candidate);
        if (!alreadyManaged || normalizePath(meta.sourcePath ?? "") !== d.path || String(meta.stem ?? "") !== d.stem) {
          upd.flags = {
            ...(candidate.flags ?? {}),
            ...buildManagedFlags(d)
          };
          changed = true;
        }
      }

      if (changed) updates.push(upd);
    } else {
      const data = {
        name: d.name,
        path: d.path,
        repeat: d.repeat ?? false,
        volume: d.volume ?? 0.8,
        ...(d.channel ? { channel: d.channel } : {}),
        ...(d.fade !== null ? { fade: d.fade } : {}),
        sort: d.sort,
        ...(markManagedSounds ? { flags: buildManagedFlags(d) } : {})
      };
      creates.push(data);
    }
  }

  if (updates.length) {
    await playlist.updateEmbeddedDocuments("PlaylistSound", updates, { render: false });
  }

  if (creates.length) {
    await playlist.createEmbeddedDocuments("PlaylistSound", creates, { render: false });
  }

  const orphans = existingSounds.filter((s) => {
    const id = toSoundId(s);
    return id && !usedIds.has(id);
  });

  let toDelete = [];
  if (String(orphanPolicy ?? "keep") === "deleteAll") {
    toDelete = orphans.map((s) => toSoundId(s)).filter(Boolean);
  } else if (String(orphanPolicy ?? "keep") === "deleteManaged") {
    toDelete = orphans.filter(isManagedSound).map((s) => toSoundId(s)).filter(Boolean);
  }

  if (toDelete.length) {
    await playlist.deleteEmbeddedDocuments("PlaylistSound", toDelete, { render: false });
  }

  return { created: creates.length, updated: updates.length, deleted: toDelete.length };
}

async function applySyncPlan(plan, compiledPresets, options = {}) {
  const { rootPath = "", flattenPaths = false, soundSyncStrategy = "merge" } = options || {};

  let playlistsTouched = 0;
  let soundsCreated = 0;
  let soundsUpdated = 0;
  let soundsDeleted = 0;

  for (const [category, playlists] of plan.entries()) {
    const folderId = flattenPaths ? null : (await getOrCreatePlaylistFolder(category)).id;

    for (const [playlistName, meta] of playlists.entries()) {
      const playlist = await getOrCreatePlaylist(playlistName, folderId, { preferAnyFolder: flattenPaths });

      const preset = matchPresetForPlaylistPath(meta.fsPath, compiledPresets);
      await applyPlaylistPreset(playlist, preset);

      const counts =
        String(soundSyncStrategy ?? "merge") === "recreate"
          ? await recreatePlaylistSounds(playlist, meta.files, preset, options)
          : await mergePlaylistSounds(playlist, meta.files, preset, options);

      playlistsTouched += 1;
      soundsCreated += counts.created;
      soundsUpdated += counts.updated;
      soundsDeleted += counts.deleted;
    }
  }

  return { playlistsTouched, soundsCreated, soundsUpdated, soundsDeleted };
}
