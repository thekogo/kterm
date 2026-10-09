mod layout;
mod osc;
mod pty;
mod scrollback;
mod shells;

use tauri::{AppHandle, Manager};

fn layout_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("layout.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn layout_load(app: AppHandle) -> Result<Option<layout::Layout>, String> {
    Ok(layout::load_from(&layout_path(&app)?))
}

#[tauri::command]
fn layout_save(app: AppHandle, layout: layout::Layout) -> Result<(), String> {
    layout::save_to(&layout_path(&app)?, &layout)
}

fn scrollback_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("scrollback"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn scrollback_save(app: AppHandle, id: String, data: String) -> Result<(), String> {
    scrollback::save(&scrollback_dir(&app)?, &id, &data)
}

#[tauri::command]
fn scrollback_load(app: AppHandle, id: String) -> Result<Option<String>, String> {
    scrollback::load(&scrollback_dir(&app)?, &id)
}

#[tauri::command]
fn scrollback_delete(app: AppHandle, id: String) -> Result<(), String> {
    scrollback::delete(&scrollback_dir(&app)?, &id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(pty::Terminals::default())
        .invoke_handler(tauri::generate_handler![
            pty::terminal_create,
            pty::terminal_write,
            pty::terminal_resize,
            pty::terminal_close,
            pty::terminal_has_foreground_process,
            pty::default_shell,
            layout_load,
            layout_save,
            shells::list_shells,
            scrollback_save,
            scrollback_load,
            scrollback_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
