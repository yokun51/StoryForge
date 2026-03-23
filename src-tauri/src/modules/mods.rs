use json5::from_str as json5_from_str;
use reqwest::{get, Client};
use serde::{Deserialize, Serialize};
use serde_json::{from_str, from_value, json, to_string_pretty, Value};
use std::{
    fs::{create_dir_all, read_dir, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;
use zip::read::ZipArchive;

use super::errors::UiError;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortBy {
    Created,
    LastReleased,
    Downloads,
    Follows,
    Comments,
    TrendingPoints,
}

impl FromStr for ModSortBy {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "asset.created" => Ok(ModSortBy::Created),
            "lastreleased" => Ok(ModSortBy::LastReleased),
            "downloads" => Ok(ModSortBy::Downloads),
            "follows" => Ok(ModSortBy::Follows),
            "comments" => Ok(ModSortBy::Comments),
            "trendingpoints" => Ok(ModSortBy::TrendingPoints),
            _ => Err("unknown sort key"),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortOrder {
    Desc,
    Asc,
}

impl FromStr for ModSortOrder {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "desc" => Ok(ModSortOrder::Desc),
            "asc" => Ok(ModSortOrder::Asc),
            _ => Err("unknown sort order"),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModRemoveParams {
    pub path: String,
    pub modpath: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FetchModsParams {
    pub versions: Vec<String>,
    pub search: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Mod {
    pub modid: i64,
    pub assetid: i64,
    pub downloads: i64,
    pub follows: i64,
    pub trendingpoints: i64,
    pub comments: i64,
    pub name: String,
    pub summary: String,
    pub modidstrs: Vec<String>,
    pub author: String,
    pub urlalias: Option<String>,
    pub side: String,
    pub r#type: String,
    pub logo: Option<String>,
    pub tags: Vec<String>,
    pub lastreleased: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModsResponse {
    statuscode: String,
    mods: Vec<Mod>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModTags {
    pub tagid: Value,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModTagsResponse {
    statuscode: String,
    tags: Vec<ModTags>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputMod {
    pub modid: String,
    pub name: String,
    pub authors: Vec<String>,
    pub version: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModsResult {
    pub mods: Vec<OutputMod>,
    pub errors: Vec<ModError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModError {
    pub file: String,
    pub stage: String,
    pub message: String,
}

#[command]
pub async fn fetch_mod_tags() -> Result<Vec<ModTags>, UiError> {
    let res = get("https://mods.vintagestory.at/api/tags")
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<ModTagsResponse>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;

    Ok(json.tags)
}

#[command]
pub async fn fetch_mods(options: FetchModsParams) -> Result<Vec<Mod>, UiError> {
    let client = Client::new();

    let mut params = Vec::new();
    if !options.versions.is_empty() {
        for version in options.versions {
            params.push(("gameversions[]".to_string(), version.to_string()));
        }
    }
    if !options.search.is_empty() {
        params.push(("text".to_string(), options.search.clone()));
    }

    let res = client
        .get("https://mods.vintagestory.at/api/mods")
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<ModsResponse>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;
    Ok(json.mods)
}

#[command]
pub async fn fetch_mod_info(modid: String) -> Result<Value, UiError> {
    let url = format!("https://mods.vintagestory.at/api/mod/{}", modid);
    let res = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: Value =
        from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn fetch_authors(search: String) -> Result<Value, UiError> {
    let url = format!(
        "https://mods.vintagestory.at/api/v2/users/by-name/{}?contributors-only=true",
        search
    );
    let res = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: Value =
        from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn add_mod_to_installation(path: String, url: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    let response = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;
    if !response.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", response.status()),
        });
    }
    let filename = url
        .split('=')
        .next_back()
        .ok_or_else(|| UiError::from("Invalid URL"))?;
    let filepath = pb.join(filename);
    let mut file = File::create(&filepath).map_err(|e| UiError {
        name: "create_file_failed".into(),
        message: format!("Failed to create file: {e}"),
    })?;
    let content = response.bytes().await.map_err(|e| UiError {
        name: "read_response_failed".into(),
        message: format!("Failed to read response: {e}"),
    })?;
    file.write_all(&content).map_err(|e| UiError {
        name: "write_file_failed".into(),
        message: format!("Failed to write file: {e}"),
    })?;
    Ok("added".into())
}

// --- Helper pour extraire les mods depuis un dossier arbitraire ---
fn extract_mods_from_dir(mods_path: &Path) -> Result<ModsResult, UiError> {
    let mut mods: Vec<OutputMod> = Vec::new();
    let mut errors: Vec<ModError> = Vec::new();

    let read_dir_iter = match read_dir(mods_path) {
        Ok(rd) => rd,
        Err(e) => {
            return Err(UiError {
                name: "io_error".into(),
                message: format!(
                    "Failed to read directory {}: {}",
                    mods_path.to_string_lossy(),
                    e
                ),
            });
        }
    };

    for entry_res in read_dir_iter {
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                errors.push(ModError {
                    file: mods_path.to_string_lossy().into_owned(),
                    stage: "read_dir_entry".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let is_zip = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("zip"))
            .unwrap_or(false);
        if !is_zip {
            continue;
        }

        let file = match File::open(&path) {
            Ok(f) => f,
            Err(e) => {
                errors.push(ModError {
                    file: path.to_string_lossy().into_owned(),
                    stage: "open_zip_file".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let mut archive = match ZipArchive::new(file) {
            Ok(a) => a,
            Err(e) => {
                errors.push(ModError {
                    file: path.to_string_lossy().into_owned(),
                    stage: "parse_zip".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let mut found_any = false;
        let mut found_valid = false;

        for i in 0..archive.len() {
            let mut file_in_zip = match archive.by_index(i) {
                Ok(f) => f,
                Err(e) => {
                    errors.push(ModError {
                        file: path.to_string_lossy().into_owned(),
                        stage: "read_entry".into(),
                        message: format!("by_index({}): {}", i, e),
                    });
                    continue;
                }
            };

            if file_in_zip.is_dir() {
                continue;
            }

            let name_in_zip = file_in_zip.name().to_string();
            let filename = Path::new(&name_in_zip)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if !filename.eq_ignore_ascii_case("modinfo.json") {
                continue;
            }

            found_any = true;

            let mut contents = String::new();
            if let Err(e) = file_in_zip.read_to_string(&mut contents) {
                errors.push(ModError {
                    file: format!("{}::{}", path.to_string_lossy(), name_in_zip),
                    stage: "read_entry".into(),
                    message: e.to_string(),
                });
                continue;
            }

            match json5_from_str::<Value>(&contents) {
                Ok(json) => {
                    let modid = json
                        .as_object()
                        .and_then(|obj| {
                            obj.iter()
                                .find(|(k, _)| k.eq_ignore_ascii_case("modid"))
                                .map(|(_, v)| v)
                        })
                        .map(|v| {
                            if let Some(s) = v.as_str() {
                                s.to_string()
                            } else if let Some(n) = v.as_i64() {
                                n.to_string()
                            } else if let Some(n) = v.as_u64() {
                                n.to_string()
                            } else if let Some(n) = v.as_f64() {
                                if n.fract() == 0.0 {
                                    (n as i64).to_string()
                                } else {
                                    n.to_string()
                                }
                            } else {
                                "0".to_string()
                            }
                        })
                        .unwrap_or_else(|| "0".to_string());
                    let path = path.to_string_lossy().into_owned();
                    let name = json
                        .as_object()
                        .and_then(|obj| {
                            obj.iter()
                                .find(|(k, _)| k.eq_ignore_ascii_case("name"))
                                .map(|(_, v)| v)
                        })
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown Mod")
                        .to_string();
                    let authors = json
                        .as_object()
                        .and_then(|obj| {
                            obj.iter()
                                .find(|(k, _)| k.eq_ignore_ascii_case("authors"))
                                .map(|(_, v)| v)
                        })
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_else(|| vec!["Unknown".into()]);
                    let version = json
                        .as_object()
                        .and_then(|obj| {
                            obj.iter()
                                .find(|(k, _)| k.eq_ignore_ascii_case("version"))
                                .map(|(_, v)| v)
                        })
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0.0")
                        .to_string();
                    mods.push(OutputMod {
                        modid,
                        name,
                        authors,
                        version,
                        path,
                    });
                    found_valid = true;
                    break;
                }
                Err(e) => {
                    errors.push(ModError {
                        file: format!("{}::{}", path.to_string_lossy(), name_in_zip),
                        stage: "parse_json".into(),
                        message: e.to_string(),
                    });
                }
            }
        }

        if found_any && !found_valid {
            errors.push(ModError {
                file: path.to_string_lossy().into_owned(),
                stage: "zip_summary".into(),
                message: "Found modinfo.json but failed to read/parse any".into(),
            });
        }

        if !found_any {
            errors.push(ModError {
                file: path.to_string_lossy().into_owned(),
                stage: "missing_modinfo".into(),
                message: "No modinfo.json found in archive".into(),
            });
        }
    }

    Ok(ModsResult { mods, errors })
}

#[command]
pub fn get_mods(path: String) -> Result<ModsResult, UiError> {
    let mods_path = PathBuf::from(path).join("Mods");
    if !mods_path.exists() || !mods_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mods_path.to_string_lossy().into_owned(),
        });
    }
    extract_mods_from_dir(&mods_path)
}

#[command]
pub fn get_mods_by_server_folders(path: String) -> Result<Vec<String>, UiError> {
    let clean_path = path.trim_matches('"').trim();
    let mbs_path = std::path::PathBuf::from(clean_path).join("ModsByServer");

    // S'il n'existe pas ou n'est pas un dossier, on renvoie juste une liste vide (pas d'erreur)
    if !mbs_path.exists() || !mbs_path.is_dir() {
        return Ok(vec![]);
    }

    let mut folders = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&mbs_path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    folders.push(name.to_string());
                }
            }
        }
    }

    Ok(folders)
}

#[command]
pub fn get_server_mods(path: String, server_folder: String) -> Result<ModsResult, UiError> {
    let mods_path = std::path::PathBuf::from(path)
        .join("ModsByServer")
        .join(server_folder);

    // Si le dossier du serveur a été supprimé (par ex. après un import réussi), on renvoie 0 mods
    if !mods_path.exists() || !mods_path.is_dir() {
        return Ok(ModsResult {
            mods: vec![],
            errors: vec![],
        });
    }

    extract_mods_from_dir(&mods_path)
}

#[command]
pub fn move_server_mods(
    path: String,
    server_folder: String,
    filenames_to_move: Vec<String>,
    filenames_to_delete: Vec<String>,
) -> Result<usize, UiError> {
    let base_path = std::path::PathBuf::from(&path);
    let source_dir = base_path.join("ModsByServer").join(&server_folder);
    let target_dir = base_path.join("Mods");

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| UiError::from(format!("Create dir error: {e}")))?;
    }

    let mut moved_count = 0;

    // 1. Supprimer les fichiers inutiles (déjà présents avec la bonne version ou ignorés)
    for filename in filenames_to_delete {
        let source_file = source_dir.join(&filename);
        if source_file.exists() && source_file.is_file() {
            std::fs::remove_file(&source_file).ok();
        }
    }

    // 2. Déplacer les fichiers sélectionnés
    for filename in filenames_to_move {
        let source_file = source_dir.join(&filename);
        let target_file = target_dir.join(&filename);
        if source_file.exists() && source_file.is_file() {
            // Remplace l'existant s'il y a lieu
            if target_file.exists() {
                std::fs::remove_file(&target_file).ok();
            }
            // Tente de renommer, sinon copie puis supprime (utile si disques différents)
            if std::fs::rename(&source_file, &target_file)
                .or_else(|_| {
                    std::fs::copy(&source_file, &target_file)
                        .and_then(|_| std::fs::remove_file(&source_file))
                })
                .is_ok()
            {
                moved_count += 1;
            }
        }
    }

    // 3. Supprimer le dossier du serveur s'il est vide après le transfert
    if let Ok(entries) = std::fs::read_dir(&source_dir) {
        if entries.count() == 0 {
            std::fs::remove_dir(&source_dir).ok();
        }
    }

    Ok(moved_count)
}

#[command]
pub fn get_mod_configs(app: AppHandle, installation_id: u64) -> Result<Vec<Value>, UiError> {
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

    let mod_config_path = Path::new(installation["path"].as_str().unwrap()).join("ModConfig");
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }
    let mut configs = Vec::new();
    for entry in
        read_dir(mod_config_path).map_err(|e| UiError::from(format!("Read dir error: {e}")))?
    {
        let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    let filename = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    let mut file = File::open(&path)
                        .map_err(|e| UiError::from(format!("Open file error: {e}")))?;
                    let mut content = String::new();
                    file.read_to_string(&mut content)
                        .map_err(|e| UiError::from(format!("Read file error: {e}")))?;
                    let json_content: Value = json5_from_str(&content)
                        .map_err(|e| UiError::from(format!("Parse JSON error: {e}")))?;
                    configs.push(json!({
                        "filename": filename,
                        "content": json_content
                    }));
                }
            }
        }
    }

    Ok(configs)
}

#[command]
pub fn save_mod_config(
    app: AppHandle,
    installation_id: u64,
    file: String,
    new_code: String,
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

    let mod_config_path = Path::new(installation["path"].as_str().unwrap()).join("ModConfig");
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }

    let file_path = mod_config_path.join(&file);
    if !file_path.exists() || !file_path.is_file() {
        return Err(UiError {
            name: "file_not_found".into(),
            message: file_path.to_string_lossy().into_owned(),
        });
    }

    let mut f = File::create(&file_path).map_err(|e| UiError {
        name: "create_file_failed".into(),
        message: format!("Failed to create file: {e}"),
    })?;
    f.write_all(new_code.as_bytes()).map_err(|e| UiError {
        name: "write_file_failed".into(),
        message: format!("Failed to write file: {e}"),
    })?;

    Ok(())
}

#[command]
pub async fn get_mod_updates(params: String) -> Result<Value, UiError> {
    let url = format!("https://mods.vintagestory.at/api/updates?mods={}", params);
    let res = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;
    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }
    let res_text = res
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;
    let json: Value =
        from_str(&res_text).map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}

#[command]
pub fn get_installation_mods(app: AppHandle, id: i64) -> Result<Vec<OutputMod>, UiError> {
    let installations_zustand = app.zustand().get("installations", "installations").unwrap();
    let installations_json: Value = from_value(installations_zustand).unwrap();
    let installation = installations_json
        .as_array()
        .and_then(|arr| arr.iter().find(|inst| inst["id"].as_i64() == Some(id)))
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", id),
        })?;
    let path = installation["path"].as_str().unwrap_or("");
    get_mods(path.to_string())
        .map(|res| res.mods)
        .map_err(|e| UiError {
            name: e.name,
            message: e.message,
        })
}

#[command]
pub async fn remove_mod_from_installation(params: ModRemoveParams) -> Result<String, UiError> {
    let mods_path = PathBuf::from(&params.path).join("Mods");
    let mod_file = PathBuf::from(&params.modpath);

    // Vérification de sécurité pour s'assurer qu'on ne supprime rien en dehors du dossier Mods
    if mod_file.parent().map(|p| p != mods_path).unwrap_or(true) {
        return Err(UiError {
            name: "invalid_path".into(),
            message: format!(
                "Mod path {} is not inside Mods directory {}",
                mod_file.to_string_lossy(),
                mods_path.to_string_lossy()
            ),
        });
    }

    let mut retries = 5;
    loop {
        // Tente de supprimer le fichier de force
        match std::fs::remove_file(&mod_file) {
            Ok(_) => return Ok("removed".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok("removed".into()),
            Err(e) => {
                retries -= 1;
                if retries == 0 {
                    return Err(UiError {
                        name: "remove_failed".into(),
                        message: format!(
                            "Failed to remove mod file '{}': {}",
                            mod_file.display(),
                            e
                        ),
                    });
                }
                // Pause de 200ms avant de réessayer, au cas où l'antivirus ou un autre process lit le fichier
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    }
}

#[command]
pub fn copy_mod_file(source_path: String, dest_path: String) -> Result<(), UiError> {
    let source = Path::new(&source_path);
    let dest = Path::new(&dest_path);

    if !source.exists() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Source mod file not found: {}", source_path),
        });
    }

    if let Some(parent) = dest.parent() {
        create_dir_all(parent).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create Mod directory: {}", e),
        })?;
    }

    std::fs::copy(source, dest).map_err(|e| UiError {
        name: "copy_failed".into(),
        message: format!("Failed to copy mod: {}", e),
    })?;

    Ok(())
}

#[command]
pub fn get_disabled_mods(path: String) -> Result<Vec<String>, UiError> {
    let clientsettings_path = Path::new(&path).join("clientsettings.json");
    if !clientsettings_path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&clientsettings_path).unwrap_or_default();
    let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));

    let disabled_mods = json
        .get("stringListSettings")
        .and_then(|sls| sls.get("disabledMods"))
        .and_then(|dm| dm.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(disabled_mods)
}

#[command]
pub fn toggle_mod_state(
    path: String,
    modid: String,
    version: String,
    enable: bool,
) -> Result<(), UiError> {
    let clientsettings_path = Path::new(&path).join("clientsettings.json");
    let mut json: Value = if clientsettings_path.exists() {
        let content = std::fs::read_to_string(&clientsettings_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    if !json.is_object() {
        json = json!({});
    }

    let obj = json.as_object_mut().unwrap();

    let string_list_settings = obj.entry("stringListSettings").or_insert(json!({}));
    if !string_list_settings.is_object() {
        *string_list_settings = json!({});
    }

    let settings_obj = string_list_settings.as_object_mut().unwrap();
    let disabled_mods = settings_obj.entry("disabledMods").or_insert(json!([]));

    if !disabled_mods.is_array() {
        *disabled_mods = json!([]);
    }

    if let Some(arr) = disabled_mods.as_array_mut() {
        if enable {
            arr.retain(|v| {
                if let Some(s) = v.as_str() {
                    s != modid && !s.starts_with(&format!("{}@", modid))
                } else {
                    true
                }
            });
        } else {
            let already_disabled = arr.iter().any(|v| {
                if let Some(s) = v.as_str() {
                    s == modid || s.starts_with(&format!("{}@", modid))
                } else {
                    false
                }
            });
            if !already_disabled {
                arr.push(json!(format!("{}@{}", modid, version)));
            }
        }
    }

    let content = to_string_pretty(&json).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize: {}", e),
    })?;

    if let Some(parent) = clientsettings_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&clientsettings_path, content).map_err(|e| UiError {
        name: "write_error".into(),
        message: format!("Failed to write: {}", e),
    })?;
    Ok(())
}

#[command]
pub fn set_disabled_mods(path: String, disabled_mods: Vec<String>) -> Result<(), UiError> {
    let clientsettings_path = Path::new(&path).join("clientsettings.json");
    let mut json: Value = if clientsettings_path.exists() {
        let content = std::fs::read_to_string(&clientsettings_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    if !json.is_object() {
        json = json!({});
    }

    let obj = json.as_object_mut().unwrap();

    let string_list_settings = obj.entry("stringListSettings").or_insert(json!({}));
    if !string_list_settings.is_object() {
        *string_list_settings = json!({});
    }

    let settings_obj = string_list_settings.as_object_mut().unwrap();
    let json_disabled_mods: Vec<Value> = disabled_mods.into_iter().map(Value::String).collect();

    settings_obj.insert("disabledMods".to_string(), Value::Array(json_disabled_mods));

    let content = to_string_pretty(&json).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize: {}", e),
    })?;

    if let Some(parent) = clientsettings_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&clientsettings_path, content).map_err(|e| UiError {
        name: "write_error".into(),
        message: format!("Failed to write: {}", e),
    })?;
    Ok(())
}

#[command]
pub fn get_locked_mods(path: String) -> Result<Vec<String>, UiError> {
    let clientsettings_path = Path::new(&path).join("clientsettings.json");
    if !clientsettings_path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&clientsettings_path).unwrap_or_default();
    let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));

    let locked_mods = json
        .get("stringListSettings")
        .and_then(|sls| sls.get("lockedMods"))
        .and_then(|dm| dm.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(locked_mods)
}

#[command]
pub fn toggle_mod_lock(path: String, modid: String, lock: bool) -> Result<(), UiError> {
    let clientsettings_path = Path::new(&path).join("clientsettings.json");
    let mut json: Value = if clientsettings_path.exists() {
        let content = std::fs::read_to_string(&clientsettings_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    if !json.is_object() {
        json = json!({});
    }

    let obj = json.as_object_mut().unwrap();

    let string_list_settings = obj.entry("stringListSettings").or_insert(json!({}));
    if !string_list_settings.is_object() {
        *string_list_settings = json!({});
    }

    let settings_obj = string_list_settings.as_object_mut().unwrap();
    let locked_mods = settings_obj.entry("lockedMods").or_insert(json!([]));

    if !locked_mods.is_array() {
        *locked_mods = json!([]);
    }

    if let Some(arr) = locked_mods.as_array_mut() {
        if lock {
            let already_locked = arr.iter().any(|v| v.as_str() == Some(&modid));
            if !already_locked {
                arr.push(json!(modid));
            }
        } else {
            arr.retain(|v| v.as_str() != Some(&modid));
        }
    }

    let content = to_string_pretty(&json).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize: {}", e),
    })?;

    if let Some(parent) = clientsettings_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&clientsettings_path, content).map_err(|e| UiError {
        name: "write_error".into(),
        message: format!("Failed to write: {}", e),
    })?;
    Ok(())
}
