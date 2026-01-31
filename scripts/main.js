const MODULE_ID = "fvtt-playlist-sync";

const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav", ".flac", ".m4a", ".webm", ".aac"];

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "rootPath", {
    name: "Корневая папка аудио",
    hint: "Папка внутри Data, которую нужно просканировать (по умолчанию audio).",
    scope: "world",
    config: true,
    type: String,
    default: "audio"
  });

  game.settings.registerMenu(MODULE_ID, "syncMenu", {
    name: "Синхронизация плейлистов",
    label: "Открыть",
    hint: "Создать/обновить плейлисты по структуре папок в Data/audio.",
    type: PlaylistSyncMenu,
    restricted: true
  });
});

class PlaylistSyncMenu extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "playlist-sync-menu",
      title: "Синхронизация плейлистов",
      template: `modules/${MODULE_ID}/templates/sync-menu.hbs`,
      width: 520,
      closeOnSubmit: false
    });
  }

  getData() {
    return {
      rootPath: game.settings.get(MODULE_ID, "rootPath")
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
  }

  async _updateObject(_event, _formData) {
    // ничего: мы сохраняем rootPath на change
  }

  async _doSync() {
    if (!game.user.isGM) {
      ui.notifications.warn("Синхронизация доступна только GM.");
      return;
    }

    const rootPath = normalizePath(game.settings.get(MODULE_ID, "rootPath") || "audio");
    ui.notifications.info(`Playlist Sync: сканирую Data/${rootPath} ...`);

    const t0 = Date.now();

    let files;
    try {
      files = await collectAudioFilesRecursive("data", rootPath);
      console.log(`${MODULE_ID} | found files:`, files.length, files.slice(0, 10));
    } catch (err) {
      console.error(`${MODULE_ID} | browse error`, err);
      ui.notifications.error("Playlist Sync: не удалось просканировать папку (см. консоль).");
      return;
    }

    const plan = buildSyncPlan(files, rootPath);

    const result = await applySyncPlan(plan);

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    ui.notifications.info(
      `Playlist Sync: готово за ${dt}s. Плейлистов: ${result.playlistsTouched}, звуков: ${result.soundsCreated}.`
    );
  }
}

function normalizePath(p) {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
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
 *  category => Folder (Playlist)
 *  playlistName => subdirs... (как путь, например "battle" или "horror/crypt")
 */
function buildSyncPlan(files, rootPath) {
  const rootParts = splitPath(rootPath);

  /** @type {Map<string, Map<string, string[]>>} category -> playlistName -> files[] */
  const plan = new Map();

  for (const full of files) {
    const parts = splitPath(full);

    // найти индекс rootPath в пути
    // Обычно rootPath = "audio", тогда parts начинается с ["audio", ...]
    let start = 0;
    if (rootParts.length > 0) {
      const candidate = parts.slice(0, rootParts.length).join("/");
      if (candidate === rootParts.join("/")) start = rootParts.length;
    }

    const rel = parts.slice(start); // <category>/<subdirs...>/<file>
    if (rel.length < 3) continue; // нужно минимум category/playlist/file

    const category = safeDecode(rel[0]);
    const playlistPathParts = rel.slice(1, -1).map(safeDecode);
    const playlistName = playlistPathParts.join("/");

    if (!playlistName) continue;

    if (!plan.has(category)) plan.set(category, new Map());
    const catMap = plan.get(category);

    if (!catMap.has(playlistName)) catMap.set(playlistName, []);
    catMap.get(playlistName).push(full);
  }

  // сортируем файлы внутри каждой группы
  for (const [, catMap] of plan) {
    for (const [pl, arr] of catMap) {
      arr.sort((a, b) => decodedFileStem(a).localeCompare(decodedFileStem(b), "ru"));
      catMap.set(pl, arr);
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

async function getOrCreatePlaylist(name, folderId) {
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

async function replacePlaylistSounds(playlist, filePaths) {
  const existingIds = playlist.sounds?.map((s) => s.id) ?? [];
  if (existingIds.length) {
    await playlist.deleteEmbeddedDocuments("PlaylistSound", existingIds);
  }

  const soundsData = filePaths.map((path, i) => ({
    name: decodedFileStem(path),
    path,
    repeat: false,
    volume: 0.8,
    sort: (i + 1) * 10
  }));

  if (soundsData.length) {
    await playlist.createEmbeddedDocuments("PlaylistSound", soundsData);
  }

  return soundsData.length;
}

async function applySyncPlan(plan) {
  let playlistsTouched = 0;
  let soundsCreated = 0;

  for (const [category, playlists] of plan.entries()) {
    const folder = await getOrCreatePlaylistFolder(category);

    for (const [playlistName, files] of playlists.entries()) {
      const playlist = await getOrCreatePlaylist(playlistName, folder.id);
      const created = await replacePlaylistSounds(playlist, files);

      playlistsTouched += 1;
      soundsCreated += created;
    }
  }

  return { playlistsTouched, soundsCreated };
}
