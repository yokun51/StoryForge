use prost::Message;
use rusqlite::OpenFlags;
use serde::{Deserialize, Serialize};
use serde_json::{from_value, Value};
use std::{
    ffi::OsStr,
    fs::{create_dir_all, read_dir, remove_file, rename},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;
use super::proto::{GameData, MapMarkers, ProspectingLog};
use super::utils::{installations_folder, installations_subdir};

#[derive(Debug, Serialize, Deserialize)]
pub struct World {
    pub data: GameData,
    pub has_map: bool,
    pub path: String,
    pub installation_name: String,
    pub map_markers: Option<Option<MapMarkers>>,
    pub prospecting_logs: Vec<(String, ProspectingLog)>,
}

#[command]
pub fn get_all_saves(app: AppHandle) -> Result<Vec<World>, UiError> {
    let subdir = installations_subdir(app.clone());
    let installation_dir_path = installations_folder(app.clone()).join(&subdir);
    let mut saves: Vec<World> = Vec::new();
    if installation_dir_path.exists() && installation_dir_path.is_dir() {
        for entry in read_dir(&installation_dir_path)
            .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            let installation_name = entry.file_name().into_string().unwrap_or_default();
            if path.is_dir() {
                let saves_path = path.join("Saves");
                if saves_path.exists() && saves_path.is_dir() {
                    for save_entry in read_dir(saves_path)
                        .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
                    {
                        let save_entry = save_entry
                            .map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
                        let save_path = save_entry.path();
                        if save_path.is_file() {
                            if let Some(ext) = save_path.extension() {
                                if ext == "vcdbs" {
                                    let save_path_string = save_path
                                        .as_os_str()
                                        .to_os_string()
                                        .into_string()
                                        .unwrap_or_default();
                                    let uri =
                                        format!("file:{}?immutable=1", save_path.to_string_lossy());
                                    let conn = rusqlite::Connection::open_with_flags(
                                        &uri,
                                        OpenFlags::SQLITE_OPEN_READ_ONLY
                                            | OpenFlags::SQLITE_OPEN_URI,
                                    )
                                    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
                                    let mut stmt =
                                        conn.prepare("SELECT data FROM gamedata LIMIT 1").map_err(
                                            |e| UiError::from(format!("DB prepare error: {e}")),
                                        )?;
                                    let mut rows = stmt.query([]).map_err(|e| {
                                        UiError::from(format!("DB query error: {e}"))
                                    })?;
                                    if let Some(row) = rows
                                        .next()
                                        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
                                    {
                                        let data: Vec<u8> = row.get(0).map_err(|e| {
                                            UiError::from(format!("DB get error: {e}"))
                                        })?;
                                        let gamedata =
                                            GameData::decode(data.as_slice()).map_err(|e| {
                                                UiError::from(format!("Protobuf decode error: {e}"))
                                            })?;
                                        let compressed_gamedata = GameData {
                                            world_name: gamedata.world_name.clone(),
                                            savegame_identifier: gamedata
                                                .savegame_identifier
                                                .clone(),
                                            seed: gamedata.seed,
                                            created_by_player_name: gamedata
                                                .created_by_player_name
                                                .clone(),
                                            created_game_version: gamedata
                                                .created_game_version
                                                .clone(),
                                            last_saved_game_version: gamedata
                                                .last_saved_game_version
                                                .clone(),
                                            last_played: gamedata.last_played,
                                            total_game_seconds: gamedata.total_game_seconds,
                                            total_game_seconds_start: gamedata
                                                .total_game_seconds_start,
                                            total_seconds_played: gamedata.total_seconds_played,
                                            world_type: gamedata.world_type.clone(),
                                            play_style: gamedata.play_style,
                                            ..Default::default()
                                        };
                                        let has_map = path
                                            .join("Maps")
                                            .join(format!("{}.db", gamedata.savegame_identifier))
                                            .exists();
                                        let map_markers = gamedata
                                            .mod_data
                                            .get("playerMapMarkers_v2")
                                            .map(|data| MapMarkers::decode(data.as_slice()).ok());

                                        let mut prospecting_results = Vec::new();
                                        for (key, value) in &gamedata.mod_data {
                                            if key.starts_with("oreMapMarkers-") {
                                                let player_uid =
                                                    key.strip_prefix("oreMapMarkers-").unwrap();
                                                let items = ProspectingLog::decode(&**value)
                                                    .map_err(|e| {
                                                        UiError::from(format!(
                                                            "Protobuf decode error: {e}"
                                                        ))
                                                    })?;
                                                prospecting_results
                                                    .push((player_uid.to_string(), items));
                                            }
                                        }

                                        saves.push(World {
                                            data: compressed_gamedata,
                                            has_map,
                                            path: save_path_string,
                                            installation_name: installation_name.clone(),
                                            map_markers,
                                            prospecting_logs: prospecting_results,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(saves)
}

#[command]
pub fn get_installation_saves(
    app: AppHandle,
    installation_id: u64,
) -> Result<Vec<String>, UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = from_value(installation_zustand).unwrap();
    let installation = installation_json.as_array().and_then(|arr| {
        arr.iter()
            .find(|inst| inst["id"].as_u64() == Some(installation_id))
    });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let saves_path = Path::new(installation["path"].as_str().unwrap()).join("Saves");
    let mut saves = Vec::new();
    if saves_path.exists() && saves_path.is_dir() {
        for entry in
            read_dir(saves_path).map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "vcdbs" {
                        if let Some(file_stem) = path.file_stem() {
                            if let Some(save_name) = file_stem.to_str() {
                                saves.push(save_name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(saves)
}

#[command]
pub fn update_world(
    app: AppHandle,
    installation_id: u64,
    world_path: String,
    name: String,
    identifier: Option<String>,
) -> Result<(), UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = from_value(installation_zustand).unwrap();
    let installation = installation_json.as_array().and_then(|arr| {
        arr.iter()
            .find(|inst| inst["id"].as_u64() == Some(installation_id))
    });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let saves_path = Path::new(installation["path"].as_str().unwrap()).join("Saves");
    if !saves_path.exists() {
        create_dir_all(&saves_path).map_err(|e| UiError::from(format!("Create dir error: {e}")))?;
    }
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }

    if let Some(ext) = world_path.extension() {
        if ext != "vcdbs" {
            return Err(UiError {
                name: "invalid_world_file".into(),
                message: format!("World file {} is not a .vcdbs file", world_path.display()),
            });
        }
    } else {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!(
                "World file {} does not have an extension",
                world_path.display()
            ),
        });
    }

    let file_name = name
        .replace(
            |c: char| !c.is_ascii_alphanumeric() && c != ' ' && c != '_' && c != '-',
            "",
        )
        .to_lowercase();
    let new_world_path = saves_path.join(format!("{}.vcdbs", file_name));
    if let Some(id) = identifier {
        let maps_path = Path::new(&world_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Maps").join(format!("{}.db", id)));
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                let new_maps_path = Path::new(installation["path"].as_str().unwrap())
                    .join("Maps")
                    .join(format!("{}.db", id));
                let maps_dir = new_maps_path.parent().unwrap();
                if !maps_dir.exists() {
                    create_dir_all(maps_dir)
                        .map_err(|e| UiError::from(format!("Create dir error: {e}")))?;
                }
                rename(maps_path, &new_maps_path)
                    .map_err(|e| UiError::from(format!("Rename error: {e}")))?;
            }
        }
    }
    rename(world_path, &new_world_path).map_err(|e| UiError::from(format!("Rename error: {e}")))?;

    let conn = rusqlite::Connection::open_with_flags(
        &new_world_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        let mut gamedata = GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?;
        gamedata.world_name = name.clone();
        let mut buf = Vec::new();
        gamedata
            .encode(&mut buf)
            .map_err(|e| UiError::from(format!("Protobuf encode error: {e}")))?;
        conn.execute("UPDATE gamedata SET data = ?1", [&buf])
            .map_err(|e| UiError::from(format!("DB update error: {e}")))?;
    }
    Ok(())
}

#[command]
pub fn remove_world(world_path: String) -> Result<(), UiError> {
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }
    if world_path.extension() != Some(OsStr::new("vcdbs")) {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!("World file {} is not a .vcdbs file", world_path.display()),
        });
    }

    let conn = rusqlite::Connection::open(world_path)
        .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        let gamedata = GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?;

        let maps_path = Path::new(&world_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("Maps")
                    .join(format!("{}.db", gamedata.savegame_identifier))
            });
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                remove_file(maps_path)
                    .map_err(|e| UiError::from(format!("Remove file error: {e}")))?;
            }
        }
    }
    remove_file(world_path).map_err(|e| UiError::from(format!("Remove file error: {e}")))?;
    Ok(())
}

#[command]
pub fn backup_world(world_path: String) -> Result<String, UiError> {
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }

    let saves_dir = world_path.parent().unwrap();
    let backups_dir = saves_dir.parent().unwrap().join("Backups");

    if !backups_dir.exists() {
        create_dir_all(&backups_dir)
            .map_err(|e| UiError::from(format!("Create backups dir error: {e}")))?;
    }

    let file_stem = world_path.file_stem().unwrap().to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let backup_filename = format!("{}_backup_{}.vcdbs", file_stem, timestamp);
    let backup_path = backups_dir.join(backup_filename);

    std::fs::copy(world_path, &backup_path)
        .map_err(|e| UiError::from(format!("Backup copy error: {e}")))?;

    Ok(backup_path.to_string_lossy().into_owned())
}
