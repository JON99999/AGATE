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
fn browse_folder() -> Result<Option<String>, String> {
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
        let mut buffer = [0; 4096];
        if let Ok(bytes_read) = stream.read(&mut buffer) {
          let request = String::from_utf8_lossy(&buffer[..bytes_read]);
          
          if request.starts_with("GET /api/check-registered-token") || request.starts_with("GET /check-registered-token") {
            let mut token_guard = REGISTERED_OAUTH_TOKEN.lock().unwrap();
            let response_body = if let Some(ref t) = *token_guard {
              let res = format!("{{\"token\":\"{}\"}}", t);
              *token_guard = None; // consume token
              res
            } else {
              "{\"token\":null}".to_string()
            };
            
            let response = format!(
              "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              response_body.len(),
              response_body
            );
            let _ = stream.write_all(response.as_bytes());
          } else if request.starts_with("OPTIONS ") {
            let response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response.as_bytes());
          } else if request.starts_with("GET /api/register-token") || request.starts_with("GET /register-token") {
            let mut token: Option<String> = None;
            if let Some(pos) = request.find("token=") {
              let start = pos + 6;
              if let Some(sub) = request.get(start..) {
                let end = sub.find('&').or_else(|| sub.find(' ')).unwrap_or(sub.len());
                let raw_token = &sub[..end];
                let owned_token = raw_token.replace("%2F", "/").replace("%3D", "=").replace("%3F", "?").replace("%26", "&");
                token = Some(owned_token);
              }
            }
            
            if let Some(t) = token {
              let mut token_guard = REGISTERED_OAUTH_TOKEN.lock().unwrap();
              *token_guard = Some(t.clone());
              println!("Token successfully registered in Tauri Rust backend via GET: {}", t);
            }
            
            let response_body = "{\"success\":true}";
            let response = format!(
              "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              response_body.len(),
              response_body
            );
            let _ = stream.write_all(response.as_bytes());
          } else if request.starts_with("POST /api/register-token") || request.starts_with("POST /register-token") {
            // Find body
            let body = request.split("\r\n\r\n").nth(1).unwrap_or("");
            // Parse simple token from json: {"token":"..."}
            let token = if let Some(start) = body.find("\"token\":\"") {
              let sub = &body[start + 9..];
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
            
            let response_body = "{\"success\":true}";
            let response = format!(
              "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              response_body.len(),
              response_body
            );
            let _ = stream.write_all(response.as_bytes());
          } else if request.starts_with("GET /api/oauth-callback") || request.starts_with("GET /oauth-callback") {
            // Serve the nice dark theme auto-exchange page
            let html_content = include_str!("oauth_callback.html");
            let response = format!(
              "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              html_content.len(),
              html_content
            );
            let _ = stream.write_all(response.as_bytes());
          } else {
            // Unhandled
            let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response.as_bytes());
          }
        }
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
