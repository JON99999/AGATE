#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

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

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_folder])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
