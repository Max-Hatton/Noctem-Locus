(() => {
  if (window.__NOCTEM_LOCUS_NATIVE_BRIDGE__) return;
  window.__NOCTEM_LOCUS_NATIVE_BRIDGE__ = true;

  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;

  const VERSION = '0.9.1';
  const legacySaveSettings = typeof saveSettings === 'function' ? saveSettings : null;
  const legacyPhotoPut = typeof photoDbPut === 'function' ? photoDbPut : null;
  const legacyPhotoGet = typeof photoDbGet === 'function' ? photoDbGet : null;
  const legacyPhotoDelete = typeof photoDbDelete === 'function' ? photoDbDelete : null;
  const legacyPhotoDeleteObservation = typeof photoDbDeleteObservation === 'function' ? photoDbDeleteObservation : null;
  const legacyRenderShell = typeof renderShell === 'function' ? renderShell : null;
  const legacyRenderSettings = typeof renderSettings === 'function' ? renderSettings : null;
  const legacyRenderObservations = typeof renderObservations === 'function' ? renderObservations : null;

  let stateWriteChain = Promise.resolve();
  let migrationCount = 0;
  let migrationFinished = false;
  let latestNativeInfo = null;

  function bridgeToast(message) {
    try {
      if (typeof toast === 'function') toast(message);
      else console.log('[Noctem Locus]', message);
    } catch (_) {
      console.log('[Noctem Locus]', message);
    }
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function queueNativeStateWrite() {
    let snapshot;
    try {
      snapshot = JSON.stringify(settings);
    } catch (error) {
      console.warn('Could not serialize Noctem Locus state', error);
      return Promise.reject(error);
    }
    stateWriteChain = stateWriteChain
      .catch(() => {})
      .then(() => invoke('native_save_state', { stateJson: snapshot }))
      .catch(error => {
        console.warn('Native state save failed', error);
        throw error;
      });
    return stateWriteChain;
  }

  async function loadNativeState() {
    try {
      const stored = await invoke('native_load_state');
      if (stored) {
        JSON.parse(stored);
        localStorage.setItem('astro.settings', stored);
        settings = loadSettings();
      } else {
        await invoke('native_save_state', { stateJson: JSON.stringify(settings) });
      }
      return true;
    } catch (error) {
      console.warn('Native state initialization failed; keeping compatibility storage', error);
      return false;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('Could not read image'));
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, type) {
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
  }

  async function savePhotoNative(record) {
    const blob = record?.blob;
    if (!(blob instanceof Blob)) throw new Error('Photo has no image data');
    const dataBase64 = await blobToBase64(blob);
    const payload = {
      id: String(record.id || ''),
      observationId: String(record.observationId || ''),
      name: String(record.name || 'Observation photo'),
      type: String(record.type || blob.type || 'application/octet-stream'),
      size: Number(record.size || blob.size || 0),
      createdAt: String(record.createdAt || new Date().toISOString()),
      dataBase64
    };
    await invoke('native_save_photo', { photo: payload });
    return true;
  }

  async function loadPhotoNative(id) {
    const record = await invoke('native_load_photo', { id: String(id) });
    if (!record) return null;
    return {
      id: record.id,
      observationId: record.observationId,
      name: record.name,
      type: record.type,
      size: record.size,
      createdAt: record.createdAt,
      blob: base64ToBlob(record.dataBase64, record.type)
    };
  }

  async function migrateLegacyPhotos() {
    if (!legacyPhotoGet) {
      migrationFinished = true;
      return 0;
    }
    let migrated = 0;
    const observations = Array.isArray(settings?.observations) ? settings.observations : [];
    for (const observation of observations) {
      for (const id of Array.isArray(observation.photoIds) ? observation.photoIds : []) {
        try {
          if (await invoke('native_photo_exists', { id: String(id) })) continue;
          const legacy = await legacyPhotoGet(id);
          if (legacy?.blob) {
            await savePhotoNative(legacy);
            migrated += 1;
          }
        } catch (error) {
          console.warn(`Could not migrate legacy photo ${id}`, error);
        }
      }
    }
    migrationCount = migrated;
    migrationFinished = true;
    return migrated;
  }

  function installNativePersistence() {
    if (legacySaveSettings) {
      saveSettings = function nativeSaveSettingsBridge() {
        legacySaveSettings();
        void queueNativeStateWrite();
      };
    }

    if (legacyPhotoPut && legacyPhotoGet) {
      photoDbPut = async function nativePhotoPut(record) {
        try {
          return await savePhotoNative(record);
        } catch (error) {
          console.warn('Native photo save failed; falling back to WebView storage', error);
          return legacyPhotoPut(record);
        }
      };

      photoDbGet = async function nativePhotoGet(id) {
        try {
          const native = await loadPhotoNative(id);
          if (native) return native;
        } catch (error) {
          console.warn('Native photo read failed; checking legacy storage', error);
        }
        return legacyPhotoGet(id);
      };

      photoDbDelete = async function nativePhotoDelete(id) {
        try {
          await invoke('native_delete_photo', { id: String(id) });
        } catch (error) {
          console.warn('Native photo delete failed', error);
        }
        try {
          await legacyPhotoDelete?.(id);
        } catch (_) {}
      };

      photoDbDeleteObservation = async function nativeObservationPhotoDelete(observationId) {
        try {
          await invoke('native_delete_observation_photos', { observationId: String(observationId) });
        } catch (error) {
          console.warn('Native observation photo cleanup failed', error);
        }
        try {
          await legacyPhotoDeleteObservation?.(observationId);
        } catch (_) {}
      };
    }
  }

  function updateChrome() {
    document.title = `Noctem Locus v${VERSION}`;
    const brandVersion = document.querySelector('.brand p');
    if (brandVersion) brandVersion.textContent = `Offline astronomy v${VERSION}`;
    const badge = document.getElementById('buildBadge');
    if (badge) badge.textContent = '● Native storage active';
  }

  async function refreshNativeDataCard() {
    const status = document.getElementById('nativeStorageStatus');
    const path = document.getElementById('nativeStoragePath');
    const migration = document.getElementById('nativeMigrationStatus');
    if (!status && !path && !migration) return;
    try {
      latestNativeInfo = await invoke('native_info');
      if (status) {
        status.textContent = `${latestNativeInfo.photoCount} photo${latestNativeInfo.photoCount === 1 ? '' : 's'} · ${formatBytes(latestNativeInfo.photoBytes)} · storage format ${latestNativeInfo.storageFormatVersion}`;
      }
      if (path) path.textContent = latestNativeInfo.dataDir;
      if (migration) {
        migration.textContent = migrationFinished
          ? (migrationCount ? `${migrationCount} legacy photo${migrationCount === 1 ? '' : 's'} migrated into native storage this launch.` : 'Legacy WebView data checked; native migration is complete.')
          : 'Checking older WebView data for migration…';
      }
    } catch (error) {
      if (status) status.textContent = `Native storage status unavailable: ${error}`;
    }
  }

  function augmentSettings() {
    const card = document.querySelector('.settingsCard');
    if (!card || document.getElementById('nativeDataCard')) return;

    const catalogParagraph = Array.from(card.querySelectorAll('p')).find(p => p.textContent.includes('v0.9.0'));
    if (catalogParagraph) catalogParagraph.textContent = catalogParagraph.textContent.replace('v0.9.0', `v${VERSION}`);

    const exportSettingsButton = document.getElementById('exportSettings');
    if (exportSettingsButton && typeof downloadText === 'function') {
      exportSettingsButton.onclick = () => downloadText(
        `noctem-locus-v${VERSION}-settings.json`,
        JSON.stringify(settings, null, 2),
        'application/json'
      );
    }

    card.insertAdjacentHTML('beforeend', `
      <div id="nativeDataCard">
        <div class="settingsDivider"></div>
        <div class="settingsHeading">
          <div>
            <h3>Native data & backup</h3>
            <p>Noctem Locus v${VERSION} stores the working copy of your settings, equipment, alignments, observation log, and photos in its Windows application-data folder. Browser storage is kept only as a compatibility fallback during migration.</p>
          </div>
          <span class="validationBadge valid">Native storage active</span>
        </div>
        <div class="notice" style="margin-top:14px">
          <strong>Storage:</strong> <span id="nativeStorageStatus">Loading…</span><br>
          <strong>Data folder:</strong> <span id="nativeStoragePath" style="overflow-wrap:anywhere">Loading…</span><br>
          <span id="nativeMigrationStatus">Checking older WebView data for migration…</span>
        </div>
        <div class="inlineActions">
          <button class="primaryButton" id="nativeBackupButton">Full backup</button>
          <button class="secondaryButton" id="nativeRestoreButton">Restore backup</button>
        </div>
        <p class="mutedText">A full <span class="kbd">.nlbackup</span> file contains your application data and attached observation photos. Keep one somewhere outside the Noctem Locus data folder if the log becomes important to you.</p>
        <div class="settingsDivider"></div>
        <h3>About</h3>
        <p><strong>Noctem Locus v${VERSION}</strong> · Native Windows beta · Offline astronomy and telescope companion.</p>
      </div>
    `);

    document.getElementById('nativeBackupButton')?.addEventListener('click', async () => {
      const button = document.getElementById('nativeBackupButton');
      if (button) button.disabled = true;
      try {
        await queueNativeStateWrite();
        const result = await invoke('native_create_backup');
        if (result.cancelled) bridgeToast('Backup cancelled');
        else bridgeToast(`Full backup saved with ${result.photoCount} photo${result.photoCount === 1 ? '' : 's'}`);
      } catch (error) {
        console.error(error);
        bridgeToast(`Backup failed: ${error}`);
      } finally {
        if (button) button.disabled = false;
        void refreshNativeDataCard();
      }
    });

    document.getElementById('nativeRestoreButton')?.addEventListener('click', async () => {
      if (!confirm('Restore a Noctem Locus backup? This will replace the current settings, equipment, observations, and attached photos in the app.')) return;
      const button = document.getElementById('nativeRestoreButton');
      if (button) button.disabled = true;
      try {
        const result = await invoke('native_restore_backup');
        if (result.cancelled) {
          bridgeToast('Restore cancelled');
          return;
        }
        const restored = await invoke('native_load_state');
        if (restored) localStorage.setItem('astro.settings', restored);
        bridgeToast(`Backup restored · ${result.photoCount} photo${result.photoCount === 1 ? '' : 's'}`);
        setTimeout(() => location.reload(), 300);
      } catch (error) {
        console.error(error);
        bridgeToast(`Restore failed: ${error}`);
      } finally {
        if (button) button.disabled = false;
      }
    });

    void refreshNativeDataCard();
  }

  function adjustObservationCopy() {
    const intro = document.querySelector('.obsHeader .mutedText');
    if (intro) intro.textContent = 'Record what you saw, your equipment and conditions, and attach photos from the scope or your phone. Logs and photos stay offline in Noctem Locus native app storage.';
    const photoHelp = document.querySelector('.obsPhotoPicker small');
    if (photoHelp) photoHelp.textContent = 'Add one or several photos. Original image files are stored in the Noctem Locus application-data folder and included in Full Backup.';
  }

  function installUiPatches() {
    if (legacyRenderSettings) {
      renderSettings = function nativeRenderSettingsBridge() {
        legacyRenderSettings();
        augmentSettings();
        updateChrome();
      };
    }
    if (legacyRenderObservations) {
      renderObservations = function nativeRenderObservationsBridge() {
        legacyRenderObservations();
        adjustObservationCopy();
        updateChrome();
      };
    }
    if (legacyRenderShell) {
      renderShell = function nativeRenderShellBridge() {
        legacyRenderShell();
        updateChrome();
        if (typeof page !== 'undefined' && page === 'Settings') augmentSettings();
        if (typeof page !== 'undefined' && page === 'Observations') adjustObservationCopy();
      };
    }
  }

  async function initialize() {
    await loadNativeState();
    installNativePersistence();
    installUiPatches();
    updateChrome();

    try {
      latestNativeInfo = await invoke('native_info');
    } catch (_) {}

    void migrateLegacyPhotos().then(() => {
      void refreshNativeDataCard();
    });

    if (typeof renderShell === 'function') renderShell();
    void queueNativeStateWrite();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void queueNativeStateWrite();
    });

    window.noctemLocusNative = {
      version: VERSION,
      info: () => invoke('native_info'),
      saveNow: () => queueNativeStateWrite(),
      backup: async () => {
        await queueNativeStateWrite();
        return invoke('native_create_backup');
      }
    };
  }

  void initialize().catch(error => {
    console.error('Noctem Locus native bridge failed', error);
    bridgeToast('Native data bridge could not start; compatibility storage is still available.');
  });
})();
