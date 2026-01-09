use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use walkdir::WalkDir;
use tokio::io::AsyncBufReadExt;

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
    let main_py = find_main_py(&app).ok_or_else(|| "找不到 main.py 文件".to_string())?;

    let output_dir = main_py.parent().unwrap().join("output");
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;
    
    let python_cmd = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };

    let mut cmd = tokio::process::Command::new(python_cmd);
    cmd.arg(main_py.to_string_lossy().as_ref())
        .arg(&config.input_path)
        .arg("-f")
        .arg(config.fps.to_string())
        .arg("-o")
        .arg(&config.output_name)
        .arg("--no-zip")
        .arg("--output-dir")
        .arg(output_dir.to_string_lossy().as_ref())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    log::info!("执行命令: {:?}", cmd);

    let mut child = cmd.spawn()
        .map_err(|e| format!("启动 Python 脚本失败: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let mut stdout_reader = tokio::io::BufReader::new(stdout).lines();
    let mut stderr_reader = tokio::io::BufReader::new(stderr).lines();

    let app_handle = app.clone();
    
    let stdout_task = tokio::spawn(async move {
        let mut temp_dir = None;
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            log::info!("Python stdout: {}", line);
            if line.starts_with("PROGRESS:") {
                if let Ok(p) = line.replace("PROGRESS:", "").parse::<u32>() {
                    let _ = app_handle.emit("conversion-progress", p);
                }
            } else if line.starts_with("TEMP_DIR:") {
                temp_dir = Some(line.replace("TEMP_DIR:", "").trim().to_string());
            }
        }
        temp_dir
    });

    let stderr_task = tokio::spawn(async move {
        let mut error = String::new();
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            log::error!("Python stderr: {}", line);
            error.push_str(&line);
            error.push('\n');
        }
        error
    });

    let status = child.wait().await
        .map_err(|e| format!("等待进程结束失败: {}", e))?;

    let temp_dir_captured = stdout_task.await.map_err(|e| e.to_string())?;
    let error_msg = stderr_task.await.map_err(|e| e.to_string())?;

    if !status.success() {
        return Ok(ConversionResult {
            success: false,
            temp_dir: None,
            frame_paths: None,
            total_frames: None,
            error: Some(format!("转换失败: {}", error_msg)),
        });
    }

    let temp_path_str = temp_dir_captured.ok_or_else(|| "Python 脚本未返回临时目录".to_string())?;
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

fn find_main_py(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let main_py = resource_dir.join("main.py");
        if main_py.exists() {
            return Some(main_py);
        }
    }
    
    if let Ok(current_dir) = std::env::current_dir() {
        let mut search_dir = current_dir.clone();
        
        for _ in 0..3 {
            let main_py = search_dir.join("main.py");
            if main_py.exists() {
                return Some(main_py);
            }
            
            if let Some(parent) = search_dir.parent() {
                let main_py = parent.join("main.py");
                if main_py.exists() {
                    return Some(main_py);
                }
                search_dir = parent.to_path_buf();
            } else {
                break;
            }
        }
    }
    
    None
}

#[tauri::command]
async fn get_video_info(app: tauri::AppHandle, video_path: String) -> Result<VideoInfo, String> {
    let _main_py = find_main_py(&app).ok_or_else(|| "找不到 main.py 文件".to_string())?;
    
    let python_cmd = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };
    
    // 我们在 main.py 中已经有 cv2 了，直接写一个小脚本来获取信息
    let script = format!(
        "import cv2; cap = cv2.VideoCapture(r'{}'); \
         fps = cap.get(cv2.CAP_PROP_FPS); \
         total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); \
         dur = total / fps if fps > 0 else 0; \
         print(f'{{dur}},{{fps}},{{total}}'); cap.release()",
        video_path
    );

    let output = tokio::process::Command::new(python_cmd)
        .arg("-c")
        .arg(script)
        .output()
        .await
        .map_err(|e| format!("执行 Python 失败: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = out.split(',').collect();
    
    if parts.len() < 3 {
        return Err("解析视频信息失败".to_string());
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
        if cfg!(debug_assertions) {
        app.handle().plugin(
            tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        }
        app.handle().plugin(tauri_plugin_fs::init())?;
        app.handle().plugin(tauri_plugin_dialog::init())?;
        app.handle().plugin(tauri_plugin_shell::init())?;
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![convert_video, get_video_info, export_to_zip, cleanup_temp])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
