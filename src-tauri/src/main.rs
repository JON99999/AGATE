#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::net::TcpListener;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::Manager;

static REGISTERED_OAUTH_TOKEN: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    Command::new("explorer")
      .arg(&path)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  #[cfg(target_os = "macos")]
  {
    use std::process::Command;
    Command::new("open")
      .arg(&path)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  #[cfg(target_os = "linux")]
  {
    use std::process::Command;
    Command::new("xdg-open")
      .arg(&path)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
  // Use Tauri's native platform-compliant opener
  tauri::api::shell::open(&app.shell_scope(), url, None)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn browse_folder() -> Result<Option<String>, String> {
  use std::sync::mpsc::channel;
  let (tx, rx) = channel();
  tauri::api::dialog::FileDialogBuilder::new().pick_folder(move |path_buf| {
    let path_str = path_buf.map(|p| p.to_string_lossy().into_owned());
    let _ = tx.send(path_str);
  });
  rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
fn check_local_paths(
  mp3s: String,
  logs: String,
  schedules: String,
) -> bool {
  let mp3_exists = if mp3s.is_empty() { true } else { std::path::Path::new(&mp3s).exists() };
  let logs_exists = if logs.is_empty() { true } else { std::path::Path::new(&logs).exists() };
  let sched_exists = if schedules.is_empty() { true } else { std::path::Path::new(&schedules).exists() };
  
  mp3_exists && logs_exists && sched_exists
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
struct AppSettings {
  mode: Option<String>,
  #[serde(rename = "localPathMP3s")]
  local_path_mp3s: Option<String>,
  #[serde(rename = "localPathLogs")]
  local_path_logs: Option<String>,
  #[serde(rename = "localPathSchedules")]
  local_path_schedules: Option<String>,
}

static APP_SETTINGS: Mutex<Option<AppSettings>> = Mutex::new(None);

fn get_base_dir() -> std::path::PathBuf {
  if let Ok(path_str) = std::env::var("APP_USER_DATA_PATH") {
    std::path::Path::new(&path_str).to_path_buf()
  } else {
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
  }
}

fn load_or_init_settings() -> AppSettings {
  let mut settings_guard = APP_SETTINGS.lock().unwrap();
  if let Some(ref s) = *settings_guard {
    return s.clone();
  }
  
  let base_dir = get_base_dir();
  let settings_path = base_dir.join("data").join("settings.json");
  let s = if settings_path.exists() {
    if let Ok(content) = std::fs::read_to_string(settings_path) {
      serde_json::from_str(&content).unwrap_or_default()
    } else {
      AppSettings::default()
    }
  } else {
    AppSettings::default()
  };
  
  *settings_guard = Some(s.clone());
  s
}

fn save_settings_internal(new_settings: AppSettings) {
  let mut settings_guard = APP_SETTINGS.lock().unwrap();
  *settings_guard = Some(new_settings.clone());
  
  let base_dir = get_base_dir();
  let data_dir = base_dir.join("data");
  let _ = std::fs::create_dir_all(&data_dir);
  let settings_path = data_dir.join("settings.json");
  if let Ok(serialized) = serde_json::to_string_pretty(&new_settings) {
    let _ = std::fs::write(settings_path, serialized);
  }
}

fn get_schedule_file_path(settings: &AppSettings) -> std::path::PathBuf {
  if settings.mode.as_deref() == Some("Local") {
    if let Some(ref path_str) = settings.local_path_schedules {
      if !path_str.is_empty() {
        return std::path::Path::new(path_str).join("schedules.json");
      }
    }
  }
  get_base_dir().join("data").join("schedules.json")
}

fn get_log_file_path(settings: &AppSettings) -> std::path::PathBuf {
  if settings.mode.as_deref() == Some("Local") {
    if let Some(ref path_str) = settings.local_path_logs {
      if !path_str.is_empty() {
        return std::path::Path::new(path_str).join("logs.json");
      }
    }
  }
  get_base_dir().join("Scheduler Logs").join("logs.json")
}

fn encode_uri_component(input: &str) -> String {
  let mut encoded = String::new();
  for byte in input.as_bytes() {
    match *byte {
      b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        encoded.push(*byte as char);
      }
      _ => {
        encoded.push_str(&format!("%{:02X}", byte));
      }
    }
  }
  encoded
}

fn decode_uri_component(input: &str) -> String {
  let mut bytes = Vec::new();
  let mut chars = input.bytes();
  while let Some(b) = chars.next() {
    if b == b'%' {
      if let (Some(h1), Some(h2)) = (chars.next(), chars.next()) {
        let hex = vec![h1, h2];
        if let Ok(hex_str) = std::str::from_utf8(&hex) {
          if let Ok(byte) = u8::from_str_radix(hex_str, 16) {
            bytes.push(byte);
            continue;
          }
        }
        bytes.push(b'%');
        bytes.push(h1);
        bytes.push(h2);
      } else {
        bytes.push(b'%');
      }
    } else {
      bytes.push(b);
    }
  }
  String::from_utf8_lossy(&bytes).into_owned()
}

fn list_local_mp3s(settings: &AppSettings) -> String {
  let folder_path_str = match settings.local_path_mp3s {
    Some(ref path_str) if !path_str.is_empty() => path_str,
    _ => return "[]".to_string(),
  };
  
  let folder_path = std::path::Path::new(folder_path_str);
  if !folder_path.exists() || !folder_path.is_dir() {
    return "[]".to_string();
  }
  
  let mut list = Vec::new();
  if let Ok(entries) = std::fs::read_dir(folder_path) {
    for entry_opt in entries {
      if let Ok(entry) = entry_opt {
        let path = entry.path();
        if path.is_file() {
          if let Some(ext) = path.extension() {
            if ext.to_string_lossy().to_lowercase() == "mp3" {
              if let Some(file_name) = path.file_name() {
                let name_str = file_name.to_string_lossy().into_owned();
                let size_str = if let Ok(meta) = entry.metadata() {
                  format!("{:.1} MB", meta.len() as f64 / (1024.0 * 1024.0))
                } else {
                  "0.0 MB".to_string()
                };
                
                let stream_url = format!("/api/stream-local?file={}", encode_uri_component(&name_str));
                
                list.push(serde_json::json!({
                  "name": name_str,
                  "size": size_str,
                  "duration": "0:15",
                  "path": stream_url
                }));
              }
            }
          }
        }
      }
    }
  }
  
  serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string())
}

fn read_http_request(stream: &mut std::net::TcpStream) -> Result<(String, Vec<u8>), std::io::Error> {
  let mut buffer = [0u8; 8192];
  let mut request_data = Vec::new();
  
  let n = stream.read(&mut buffer)?;
  if n == 0 {
    return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Empty request"));
  }
  request_data.extend_from_slice(&buffer[..n]);
  
  let mut header_len = 0;
  while header_len == 0 {
    if let Some(pos) = request_data.windows(4).position(|w| w == b"\r\n\r\n") {
      header_len = pos + 4;
      break;
    }
    let n = stream.read(&mut buffer)?;
    if n == 0 {
      break;
    }
    request_data.extend_from_slice(&buffer[..n]);
  }
  
  if header_len == 0 {
    return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "No HTTP headers found"));
  }
  
  let headers_part = String::from_utf8_lossy(&request_data[..header_len]).to_string();
  
  let mut content_length = 0;
  for line in headers_part.lines() {
    if line.to_lowercase().starts_with("content-length:") {
      if let Some(val_str) = line.split(':').nth(1) {
        if let Ok(len) = val_str.trim().parse::<usize>() {
          content_length = len;
        }
      }
    }
  }
  
  let body_received = request_data.len() - header_len;
  if body_received < content_length {
    let needed = content_length - body_received;
    let mut body_buf = vec![0u8; needed];
    stream.read_exact(&mut body_buf)?;
    request_data.extend_from_slice(&body_buf);
  }
  
  let body_part = request_data[header_len..header_len + content_length].to_vec();
  Ok((headers_part, body_part))
}

struct HttpRequest {
  method: String,
  path: String,
  query: String,
}

fn parse_request_line(headers: &str) -> Option<HttpRequest> {
  let first_line = headers.lines().next()?;
  let parts: Vec<&str> = first_line.split_whitespace().collect();
  if parts.len() < 2 {
    return None;
  }
  let method = parts[0].to_string();
  let full_path = parts[1].to_string();
  
  let (path, query) = if let Some(pos) = full_path.find('?') {
    (full_path[..pos].to_string(), full_path[pos + 1..].to_string())
  } else {
    (full_path, "".to_string())
  };
  
  Some(HttpRequest { method, path, query })
}

fn serve_json_response(stream: &mut std::net::TcpStream, status_code: u16, json_body: &str) {
  let status_text = match status_code {
    200 => "OK",
    400 => "Bad Request",
    404 => "Not Found",
    500 => "Internal Server Error",
    _ => "OK",
  };
  let response_headers = format!(
    "HTTP/1.1 {} {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
    status_code,
    status_text,
    json_body.len(),
    json_body
  );
  let _ = stream.write_all(response_headers.as_bytes());
}

fn handle_connection(stream: &mut std::net::TcpStream) -> Result<(), std::io::Error> {
  let (headers, body) = match read_http_request(stream) {
    Ok(res) => res,
    Err(e) => return Err(e),
  };
  
  let req = match parse_request_line(&headers) {
    Some(r) => r,
    None => {
      let response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
      let _ = stream.write_all(response.as_bytes());
      return Ok(());
    }
  };
  
  if req.method == "OPTIONS" {
    let response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(response.as_bytes());
    return Ok(());
  }
  
  let settings = load_or_init_settings();
  
  match (req.method.as_str(), req.path.as_str()) {
    ("GET", "/api/check-registered-token") | ("GET", "/check-registered-token") => {
      let mut token_guard = REGISTERED_OAUTH_TOKEN.lock().unwrap();
      let response_body = if let Some(ref t) = *token_guard {
        let res = format!("{{\"token\":\"{}\"}}", t);
        *token_guard = None;
        res
      } else {
        "{\"token\":null}".to_string()
      };
      serve_json_response(stream, 200, &response_body);
    }
    
    ("GET", "/api/register-token") | ("GET", "/register-token") => {
      let mut token: Option<String> = None;
      if let Some(pos) = req.query.find("token=") {
        let sub = &req.query[pos + 6..];
        let end = sub.find('&').unwrap_or(sub.len());
        token = Some(decode_uri_component(&sub[..end]));
      }
      
      if let Some(t) = token {
        let mut token_guard = REGISTERED_OAUTH_TOKEN.lock().unwrap();
        *token_guard = Some(t.clone());
        println!("Token successfully registered in Tauri Rust backend via GET: {}", t);
      }
      serve_json_response(stream, 200, "{\"success\":true}");
    }
    
    ("POST", "/api/register-token") | ("POST", "/register-token") => {
      let body_str = String::from_utf8_lossy(&body);
      let token = if let Some(start) = body_str.find("\"token\":\"") {
        let sub = &body_str[start + 9..];
        if let Some(end) = sub.find("\"") {
          Some(&sub[..end])
        } else {
          None
        }
      } else {
        None
      };
      
      if let Some(t) = token {
        let mut token_guard = REGISTERED_OAUTH_TOKEN.lock().unwrap();
        *token_guard = Some(t.to_string());
        println!("Token successfully registered in Tauri Rust backend.");
      }
      serve_json_response(stream, 200, "{\"success\":true}");
    }
    
    ("GET", "/api/oauth-callback") | ("GET", "/oauth-callback") => {
      let html_content = include_str!("oauth_callback.html");
      let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html_content.len(),
        html_content
      );
      let _ = stream.write_all(response.as_bytes());
    }
    
    ("POST", "/api/settings") => {
      if let Ok(new_settings) = serde_json::from_slice::<AppSettings>(&body) {
        save_settings_internal(new_settings);
        serve_json_response(stream, 200, "{\"success\":true}");
      } else {
        serve_json_response(stream, 400, "{\"error\":\"Invalid settings JSON\"}");
      }
    }
    
    ("GET", "/api/schedules") => {
      let sched_path = get_schedule_file_path(&settings);
      let content = if sched_path.exists() {
        std::fs::read_to_string(sched_path).unwrap_or_else(|_| "[]".to_string())
      } else {
        "[]".to_string()
      };
      serve_json_response(stream, 200, &content);
    }
    
    ("POST", "/api/schedules") => {
      let sched_path = get_schedule_file_path(&settings);
      if let Some(parent) = sched_path.parent() {
        let _ = std::fs::create_dir_all(parent);
      }
      if std::fs::write(&sched_path, &body).is_ok() {
        serve_json_response(stream, 200, "{\"success\":true}");
      } else {
        serve_json_response(stream, 500, "{\"error\":\"Failed to save schedules\"}");
      }
    }
    
    ("GET", "/api/logs") => {
      let log_path = get_log_file_path(&settings);
      let content = if log_path.exists() {
        std::fs::read_to_string(log_path).unwrap_or_else(|_| "[]".to_string())
      } else {
        "[]".to_string()
      };
      serve_json_response(stream, 200, &content);
    }
    
    ("POST", "/api/logs") => {
      let log_path = get_log_file_path(&settings);
      if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
      }
      if std::fs::write(&log_path, &body).is_ok() {
        serve_json_response(stream, 200, "{\"success\":true}");
      } else {
        serve_json_response(stream, 500, "{\"error\":\"Failed to save logs\"}");
      }
    }
    
    ("GET", "/api/local-mp3s") => {
      let content = list_local_mp3s(&settings);
      serve_json_response(stream, 200, &content);
    }
    
    ("GET", "/api/stream-local") => {
      let mut filename = String::new();
      if let Some(pos) = req.query.find("file=") {
        let sub = &req.query[pos + 5..];
        let end = sub.find('&').unwrap_or(sub.len());
        filename = decode_uri_component(&sub[..end]);
      }
      
      let folder_path_str = match settings.local_path_mp3s {
        Some(ref path_str) if !path_str.is_empty() => path_str,
        _ => {
          serve_json_response(stream, 404, "{\"error\":\"Local directory unconfigured\"}");
          return Ok(());
        }
      };
      
      let target_file_path = std::path::Path::new(folder_path_str).join(filename);
      if target_file_path.exists() && target_file_path.is_file() {
        if let Ok(file_bytes) = std::fs::read(&target_file_path) {
          let response_headers = format!(
            "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: audio/mpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            file_bytes.len()
          );
          let _ = stream.write_all(response_headers.as_bytes());
          let _ = stream.write_all(&file_bytes);
        } else {
          serve_json_response(stream, 500, "{\"error\":\"Failed to read audio file\"}");
        }
      } else {
        serve_json_response(stream, 404, "{\"error\":\"Audio file not found\"}");
      }
    }
    
    ("POST", "/api/check-local-paths") => {
      #[derive(serde::Deserialize)]
      struct CheckPathsRequest {
        #[serde(rename = "localPathMP3s")]
        mp3s: Option<String>,
        #[serde(rename = "localPathLogs")]
        logs: Option<String>,
        #[serde(rename = "localPathSchedules")]
        schedules: Option<String>,
      }
      
      if let Ok(paths) = serde_json::from_slice::<CheckPathsRequest>(&body) {
        let mp3_exists = paths.mp3s.as_deref().map(|p| p.is_empty() || std::path::Path::new(p).exists()).unwrap_or(true);
        let logs_exists = paths.logs.as_deref().map(|p| p.is_empty() || std::path::Path::new(p).exists()).unwrap_or(true);
        let sched_exists = paths.schedules.as_deref().map(|p| p.is_empty() || std::path::Path::new(p).exists()).unwrap_or(true);
        
        let response_body = serde_json::json!({
          "exists": mp3_exists && logs_exists && sched_exists,
          "mp3Exists": mp3_exists,
          "logsExists": logs_exists,
          "schedExists": sched_exists
        });
        serve_json_response(stream, 200, &response_body.to_string());
      } else {
        serve_json_response(stream, 400, "{\"error\":\"Invalid JSON\"}");
      }
    }
    
    ("POST", "/api/trigger-backup") => {
      serve_json_response(stream, 200, "{\"success\":true,\"archived\":true}");
    }
    
    _ => {
      let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
      let _ = stream.write_all(response.as_bytes());
    }
  }
  
  Ok(())
}

fn start_loopback_server() {
  thread::spawn(|| {
    let listener = match TcpListener::bind("127.0.0.1:3000") {
      Ok(l) => l,
      Err(e) => {
        eprintln!("Failed to bind loopback server on port 3000: {}", e);
        return;
      }
    };

    println!("Tauri background loopback server listening on 127.0.0.1:3000");

    for stream in listener.incoming() {
      if let Ok(mut stream) = stream {
        let _ = handle_connection(&mut stream);
      }
    }
  });
}

fn main() {
  start_loopback_server();

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_folder, open_url, browse_folder, check_local_paths])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
