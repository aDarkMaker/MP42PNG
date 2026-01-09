use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;
use tauri::{Emitter, Manager};
use walkdir::WalkDir;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
struct ConversionConfig {
    input_path: String,
    output_name: String,
    fps: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConversionResult {
    success: bool,
    temp_dir: Option<String>,
    frame_paths: Option<Vec<String>>,
    total_frames: Option<u32>,
    error: Option<String>,
}

#[tauri::command]
async fn convert_video(
    app: tauri::AppHandle,
    config: ConversionConfig,
) -> Result<ConversionResult, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("获取缓存目录失败: {}", e))?;
    let output_dir = cache_dir.join("MP42PNG_output");
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;

    let sidecar_command = app.shell()
        .sidecar("main")
        .map_err(|e| format!("创建 Sidecar 失败: {}", e))?
        .env("PYTHONIOENCODING", "utf-8")
        .args([
            &config.input_path,
            "-f", &config.fps.to_string(),
            "-o", &config.output_name,
            "--no-zip",
            "--output-dir", &output_dir.to_string_lossy()
        ]);

    let (mut rx, mut _child) = sidecar_command
        .spawn()
        .map_err(|e| format!("启动 Sidecar 失败: {}", e))?;

    let app_handle = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut temp_dir = None;
        let mut stderr_content = String::new();
        let mut unprocessed_text = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    unprocessed_text.push_str(&text);
                    
                    while let Some(pos) = unprocessed_text.find('\n') {
                        let line = unprocessed_text[..pos].trim().to_string();
                        unprocessed_text = unprocessed_text[pos + 1..].to_string();
                        
                        if line.starts_with("PROGRESS:") {
                            if let Ok(p) = line.replace("PROGRESS:", "").trim().parse::<u32>() {
                                let _ = app_handle.emit("conversion-progress", p);
                            }
                        } else if line.starts_with("TEMP_DIR:") {
                            temp_dir = Some(line.replace("TEMP_DIR:", "").trim().to_string());
                        }
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(bytes) => {
                    let err_text = String::from_utf8_lossy(&bytes);
                    stderr_content.push_str(&err_text);
                }
                _ => {}
            }
        }

        let final_line = unprocessed_text.trim();
        if !final_line.is_empty() {
            if final_line.starts_with("TEMP_DIR:") {
                temp_dir = Some(final_line.replace("TEMP_DIR:", "").trim().to_string());
            }
        }
        
        (temp_dir, stderr_content)
    });

    let (temp_dir_captured, stderr_captured) = stdout_task.await.map_err(|e| e.to_string())?;

    if temp_dir_captured.is_none() {
        return Err(format!("转换失败: Sidecar 未返回临时目录。\n错误详情: {}", stderr_captured));
    }

    let temp_path_str = temp_dir_captured.unwrap();
    let temp_path = Path::new(&temp_path_str);

    let mut frame_paths = Vec::new();
    if temp_path.exists() {
        let mut entries: Vec<_> = std::fs::read_dir(temp_path)
            .map_err(|e| format!("读取临时目录失败: {}", e))?
            .filter_map(|e| e.ok())
            .collect();

        entries.sort_by_key(|e| e.file_name());

        for entry in entries {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("png") {
                frame_paths.push(path.to_string_lossy().to_string());
            }
        }
    }

    Ok(ConversionResult {
        success: true,
        temp_dir: Some(temp_path_str),
        frame_paths: Some(frame_paths),
        total_frames: None,
        error: None,
    })
}

#[tauri::command]
async fn export_to_zip(
    app: tauri::AppHandle,
    temp_dir: String,
    target_zip_path: String,
) -> Result<bool, String> {
    let temp_path = Path::new(&temp_dir);
    if !temp_path.exists() {
        return Err("临时目录不存在".to_string());
    }

    let entries: Vec<_> = WalkDir::new(temp_path).into_iter().filter_map(|e| e.ok()).collect();
    let total = entries.len();

    let zip_file = std::fs::File::create(&target_zip_path)
        .map_err(|e| format!("创建 ZIP 文件失败: {}", e))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut buffer = Vec::new();
    for (i, entry) in entries.iter().enumerate() {
        let path = entry.path();
        let name = path.strip_prefix(Path::new(temp_path)).unwrap();

        if path.is_file() {
            zip.start_file(name.to_string_lossy().to_string(), options)
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            buffer.clear();
        } else if !name.as_os_str().is_empty() {
            zip.add_directory(name.to_string_lossy().to_string(), options)
                .map_err(|e| e.to_string())?;
        }

        if total > 0 {
            let percentage = ((i + 1) as f64 / total as f64 * 100.0) as u32;
            let _ = app.emit("export-progress", percentage);
        }
    }

    zip.finish().map_err(|e| e.to_string())?;

    let _ = std::fs::remove_dir_all(temp_path);

    Ok(true)
}

#[tauri::command]
async fn cleanup_temp(temp_dir: String) -> Result<(), String> {
    let path = Path::new(&temp_dir);
    if path.exists() {
        std::fs::remove_dir_all(path).map_err(|e| format!("清理失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn get_video_info(app: tauri::AppHandle, video_path: String) -> Result<VideoInfo, String> {
    let output = app.shell()
        .sidecar("main")
        .map_err(|e| format!("创建 Sidecar 失败: {}", e))?
        .env("PYTHONIOENCODING", "utf-8")
        .args(["--info", &video_path])
        .output()
        .await
        .map_err(|e| format!("执行 Sidecar 失败: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("获取视频信息失败: {}", err_msg));
    }

    let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = out.split(',').collect();
    
    if parts.len() < 3 {
        return Err(format!("解析视频信息失败，输出内容: {}", out));
    }

    Ok(VideoInfo {
        duration: parts[0].parse().unwrap_or(0.0),
        fps: parts[1].parse().unwrap_or(30.0),
        total_frames: parts[2].parse().unwrap_or(0),
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct VideoInfo {
    duration: f64,
    fps: f64,
    total_frames: u32,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .setup(|app| {
        app.handle().plugin(tauri_plugin_fs::init())?;
        app.handle().plugin(tauri_plugin_dialog::init())?;
        app.handle().plugin(tauri_plugin_shell::init())?;
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![convert_video, get_video_info, export_to_zip, cleanup_temp])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
