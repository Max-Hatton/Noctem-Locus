use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{webview::PageLoadEvent, AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const STORAGE_FORMAT_VERSION: u32 = 1;
const STATE_FILE: &str = "state.json";
const PHOTOS_DIR: &str = "photos";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeInfo {
    version: String,
    storage_format_version: u32,
    data_dir: String,
    state_exists: bool,
    photo_count: usize,
    photo_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoMeta {
    id: String,
    observation_id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: u64,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoPayload {
    id: String,
    observation_id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: u64,
    created_at: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupResult {
    cancelled: bool,
    path: Option<String>,
    photo_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreResult {
    cancelled: bool,
    photo_count: usize,
}

fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(PHOTOS_DIR)).map_err(|e| e.to_string())?;
    Ok(root)
}

fn state_path(root: &Path) -> PathBuf {
    root.join(STATE_FILE)
}

fn photo_dir(root: &Path) -> PathBuf {
    root.join(PHOTOS_DIR)
}

fn safe_id(id: &str) -> Result<&str, String> {
    if id.is_empty()
        || id.len() > 180
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err("Invalid photo identifier".into());
    }
    Ok(id)
}

fn photo_paths(root: &Path, id: &str) -> Result<(PathBuf, PathBuf), String> {
    let id = safe_id(id)?;
    let dir = photo_dir(root);
    Ok((dir.join(format!("{id}.json")), dir.join(format!("{id}.bin"))))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid storage path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    let bak = path.with_extension("bak");

    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::copy(path, &bak);
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        if bak.exists() {
            let _ = fs::copy(&bak, path);
        }
        return Err(e.to_string());
    }
    let _ = fs::remove_file(bak);
    Ok(())
}

fn read_state(root: &Path) -> Result<Option<String>, String> {
    let path = state_path(root);
    if path.exists() {
        return fs::read_to_string(path).map(Some).map_err(|e| e.to_string());
    }
    let bak = path.with_extension("bak");
    if bak.exists() {
        return fs::read_to_string(bak).map(Some).map_err(|e| e.to_string());
    }
    Ok(None)
}

fn photo_stats(root: &Path) -> (usize, u64) {
    let mut count = 0usize;
    let mut bytes = 0u64;
    if let Ok(entries) = fs::read_dir(photo_dir(root)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|x| x.to_str()) == Some("bin") {
                count += 1;
                bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    (count, bytes)
}

#[tauri::command]
fn native_info(app: AppHandle) -> Result<NativeInfo, String> {
    let root = app_data_root(&app)?;
    let (photo_count, photo_bytes) = photo_stats(&root);
    Ok(NativeInfo {
        version: app.package_info().version.to_string(),
        storage_format_version: STORAGE_FORMAT_VERSION,
        data_dir: root.to_string_lossy().into_owned(),
        state_exists: read_state(&root)?.is_some(),
        photo_count,
        photo_bytes,
    })
}

#[tauri::command]
fn native_load_state(app: AppHandle) -> Result<Option<String>, String> {
    read_state(&app_data_root(&app)?)
}

#[tauri::command]
fn native_save_state(app: AppHandle, state_json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&state_json)
        .map_err(|e| format!("Settings JSON is invalid: {e}"))?;
    let root = app_data_root(&app)?;
    write_atomic(&state_path(&root), state_json.as_bytes())
}

#[tauri::command]
fn native_photo_exists(app: AppHandle, id: String) -> Result<bool, String> {
    let root = app_data_root(&app)?;
    let (meta, data) = photo_paths(&root, &id)?;
    Ok(meta.exists() && data.exists())
}

#[tauri::command]
fn native_save_photo(app: AppHandle, photo: PhotoPayload) -> Result<(), String> {
    let root = app_data_root(&app)?;
    let (meta_path, data_path) = photo_paths(&root, &photo.id)?;
    let bytes = BASE64
        .decode(photo.data_base64.as_bytes())
        .map_err(|e| format!("Could not decode photo: {e}"))?;
    let meta = PhotoMeta {
        id: photo.id,
        observation_id: photo.observation_id,
        name: photo.name,
        media_type: photo.media_type,
        size: bytes.len() as u64,
        created_at: photo.created_at,
    };
    let meta_json = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
    write_atomic(&data_path, &bytes)?;
    write_atomic(&meta_path, &meta_json)
}

#[tauri::command]
fn native_load_photo(app: AppHandle, id: String) -> Result<Option<PhotoPayload>, String> {
    let root = app_data_root(&app)?;
    let (meta_path, data_path) = photo_paths(&root, &id)?;
    if !meta_path.exists() || !data_path.exists() {
        return Ok(None);
    }
    let meta: PhotoMeta = serde_json::from_slice(&fs::read(meta_path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let bytes = fs::read(data_path).map_err(|e| e.to_string())?;
    Ok(Some(PhotoPayload {
        id: meta.id,
        observation_id: meta.observation_id,
        name: meta.name,
        media_type: meta.media_type,
        size: bytes.len() as u64,
        created_at: meta.created_at,
        data_base64: BASE64.encode(bytes),
    }))
}

fn delete_photo_files(root: &Path, id: &str) -> Result<(), String> {
    let (meta, data) = photo_paths(root, id)?;
    if meta.exists() {
        fs::remove_file(meta).map_err(|e| e.to_string())?;
    }
    if data.exists() {
        fs::remove_file(data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn native_delete_photo(app: AppHandle, id: String) -> Result<(), String> {
    delete_photo_files(&app_data_root(&app)?, &id)
}

#[tauri::command]
fn native_delete_observation_photos(app: AppHandle, observation_id: String) -> Result<(), String> {
    let root = app_data_root(&app)?;
    let mut ids = Vec::new();
    for entry in fs::read_dir(photo_dir(&root)).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        if let Ok(meta) = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<PhotoMeta>(&b).ok())
            .ok_or(())
        {
            if meta.observation_id == observation_id {
                ids.push(meta.id);
            }
        }
    }
    for id in ids {
        let _ = delete_photo_files(&root, &id);
    }
    Ok(())
}

fn add_path_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    source: &Path,
    archive_name: &str,
) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file(archive_name.replace('\\', "/"), options)
        .map_err(|e| e.to_string())?;
    let mut input = File::open(source).map_err(|e| e.to_string())?;
    std::io::copy(&mut input, zip).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn native_create_backup(app: AppHandle) -> Result<BackupResult, String> {
    let root = app_data_root(&app)?;
    let mut selected = match app
        .dialog()
        .file()
        .set_title("Back up Noctem Locus")
        .set_file_name("Noctem-Locus-Backup.nlbackup")
        .add_filter("Noctem Locus backup", &["nlbackup"])
        .blocking_save_file()
    {
        Some(path) => path.into_path().map_err(|e| e.to_string())?,
        None => {
            return Ok(BackupResult {
                cancelled: true,
                path: None,
                photo_count: 0,
            })
        }
    };
    if selected.extension().and_then(|e| e.to_str()) != Some("nlbackup") {
        selected.set_extension("nlbackup");
    }

    let file = File::create(&selected).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let manifest = serde_json::json!({
        "format": "noctem-locus-backup",
        "formatVersion": STORAGE_FORMAT_VERSION,
        "appVersion": app.package_info().version.to_string(),
        "createdUnix": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
    });
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes())
        .map_err(|e| e.to_string())?;

    if state_path(&root).exists() {
        add_path_to_zip(&mut zip, &state_path(&root), STATE_FILE)?;
    }

    let mut photo_count = 0usize;
    if let Ok(entries) = fs::read_dir(photo_dir(&root)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|x| x.to_str()) else {
                continue;
            };
            add_path_to_zip(&mut zip, &path, &format!("photos/{name}"))?;
            if path.extension().and_then(|x| x.to_str()) == Some("bin") {
                photo_count += 1;
            }
        }
    }
    zip.finish().map_err(|e| e.to_string())?;

    Ok(BackupResult {
        cancelled: false,
        path: Some(selected.to_string_lossy().into_owned()),
        photo_count,
    })
}

#[tauri::command]
async fn native_restore_backup(app: AppHandle) -> Result<RestoreResult, String> {
    let selected = match app
        .dialog()
        .file()
        .set_title("Restore Noctem Locus backup")
        .add_filter("Noctem Locus backup", &["nlbackup"])
        .blocking_pick_file()
    {
        Some(path) => path.into_path().map_err(|e| e.to_string())?,
        None => {
            return Ok(RestoreResult {
                cancelled: true,
                photo_count: 0,
            })
        }
    };

    let root = app_data_root(&app)?;
    let temp = root.join("restore-staging");
    if temp.exists() {
        fs::remove_dir_all(&temp).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;

    let file = File::open(&selected).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid backup: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry
            .enclosed_name()
            .ok_or_else(|| "Backup contains an unsafe path".to_string())?
            .to_owned();
        let allowed = name == Path::new("manifest.json")
            || name == Path::new(STATE_FILE)
            || name.starts_with(Path::new(PHOTOS_DIR));
        if !allowed {
            continue;
        }
        let out = temp.join(&name);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut output = File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
    }

    let manifest_path = temp.join("manifest.json");
    if !manifest_path.exists() {
        return Err("This is not a Noctem Locus backup (manifest missing)".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(&manifest_path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if manifest.get("format").and_then(|v| v.as_str()) != Some("noctem-locus-backup") {
        return Err("This is not a recognized Noctem Locus backup".into());
    }

    let staged_state = temp.join(STATE_FILE);
    if !staged_state.exists() {
        return Err("Backup does not contain application data".into());
    }
    let new_state = fs::read(&staged_state).map_err(|e| e.to_string())?;
    serde_json::from_slice::<serde_json::Value>(&new_state)
        .map_err(|e| format!("Backup settings are invalid: {e}"))?;

    let staged_photos = temp.join(PHOTOS_DIR);
    if !staged_photos.exists() {
        fs::create_dir_all(&staged_photos).map_err(|e| e.to_string())?;
    }

    let current_state = fs::read(state_path(&root)).ok();
    let current_photos = photo_dir(&root);
    let previous_photos = root.join("photos-before-restore");
    if previous_photos.exists() {
        fs::remove_dir_all(&previous_photos).map_err(|e| e.to_string())?;
    }
    if current_photos.exists() {
        fs::rename(&current_photos, &previous_photos).map_err(|e| e.to_string())?;
    }

    if let Err(e) = fs::rename(&staged_photos, &current_photos) {
        if previous_photos.exists() {
            let _ = fs::rename(&previous_photos, &current_photos);
        }
        return Err(e.to_string());
    }

    if let Err(e) = write_atomic(&state_path(&root), &new_state) {
        let _ = fs::remove_dir_all(&current_photos);
        if previous_photos.exists() {
            let _ = fs::rename(&previous_photos, &current_photos);
        }
        if let Some(old) = current_state {
            let _ = write_atomic(&state_path(&root), &old);
        }
        return Err(e);
    }

    let _ = fs::remove_dir_all(&previous_photos);
    let _ = fs::remove_dir_all(&temp);
    let (photo_count, _) = photo_stats(&root);
    Ok(RestoreResult {
        cancelled: false,
        photo_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            native_info,
            native_load_state,
            native_save_state,
            native_photo_exists,
            native_save_photo,
            native_load_photo,
            native_delete_photo,
            native_delete_observation_photos,
            native_create_backup,
            native_restore_backup
        ])
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                if let Err(error) = webview.eval(include_str!("../../frontend/native-bridge.js")) {
                    eprintln!("Noctem Locus native bridge injection failed: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Noctem Locus");
}
