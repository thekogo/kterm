use crate::shells;
use crate::osc::{OscEvent, OscScanner};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Mutex,
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    shell_pid: Option<u32>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);

#[derive(Serialize, Clone)]
struct Output {
    id: String,
    data: String,
}
#[derive(Serialize, Clone)]
struct Exit {
    id: String,
    code: Option<u32>,
}
#[derive(Serialize, Clone)]
struct Cwd {
    id: String,
    cwd: String,
}
#[derive(Serialize, Clone)]
struct Title {
    id: String,
    title: String,
}

pub fn default_shell_path() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/bin/sh".into())
    }
    #[cfg(windows)]
    {
        "powershell.exe".into()
    }
}

#[tauri::command]
pub fn default_shell() -> String {
    default_shell_path()
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    state: State<'_, Terminals>,
    id: String,
    cwd: Option<String>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;
    let shell = shell.filter(|s| !s.is_empty()).unwrap_or_else(default_shell_path);
    let spec = shells::parse_spec(&shell);
    let launch = shells::plan(
        &spec,
        shells::integration_dir(),
        std::env::var("ZDOTDIR").ok().filter(|z| !z.is_empty()).as_deref(),
        cfg!(windows),
        std::env::var("PROMPT").ok().as_deref(),
    );
    let mut launch = launch;
    let wsl_cwd = shells::apply_wsl(&mut launch, cwd.as_deref(), std::env::var("WSLENV").ok().as_deref());
    let mut cmd = CommandBuilder::new(&launch.program);
    cmd.args(&launch.args);
    for (k, v) in &launch.env {
        cmd.env(k, v);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let dir = cwd
        .filter(|_| !wsl_cwd)
        .filter(|c| std::path::Path::new(c).is_dir())
        .map(std::path::PathBuf::from)
        .or_else(dirs::home_dir);
    if let Some(d) = dir {
        cmd.cwd(d);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let shell_pid = child.process_id();

    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&id) {
            return Err(format!("terminal {id} already exists"));
        }
        map.insert(id.clone(), Session { master: pair.master, writer, child, shell_pid });
    }

    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        let mut osc = OscScanner::default();
        loop {
            let n = match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            for ev in osc.feed(&buf[..n]) {
                match ev {
                    OscEvent::Cwd(cwd) => {
                        let _ = app.emit("terminal://cwd", Cwd { id: id.clone(), cwd });
                    }
                    OscEvent::Title(title) => {
                        let _ = app.emit("terminal://title", Title { id: id.clone(), title });
                    }
                }
            }
            pending.extend_from_slice(&buf[..n]);
            let data = take_valid_utf8(&mut pending);
            if !data.is_empty() {
                let _ = app.emit("terminal://output", Output { id: id.clone(), data });
            }
        }
        if !pending.is_empty() {
            let data = String::from_utf8_lossy(&pending).into_owned();
            let _ = app.emit("terminal://output", Output { id: id.clone(), data });
        }
        // If the session is still registered the process exited on its own;
        // if terminal_close removed it, stay silent.
        let session = app.state::<Terminals>().0.lock().ok().and_then(|mut m| m.remove(&id));
        if let Some(mut s) = session {
            let code = s.child.wait().ok().map(|st| st.exit_code());
            let _ = app.emit("terminal://exit", Exit { id, code });
        }
    });
    Ok(())
}

/// Drains the longest valid UTF-8 prefix of `pending`; an incomplete trailing
/// sequence is kept for the next chunk, invalid bytes are replaced lossily.
pub fn take_valid_utf8(pending: &mut Vec<u8>) -> String {
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(s) => {
                out.push_str(s);
                pending.clear();
                return out;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&pending[..valid]).unwrap());
                match e.error_len() {
                    Some(bad) => {
                        out.push('\u{FFFD}');
                        pending.drain(..valid + bad);
                    }
                    None => {
                        pending.drain(..valid);
                        return out;
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn terminal_write(state: State<'_, Terminals>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or("no such terminal")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(state: State<'_, Terminals>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let s = map.get(&id).ok_or("no such terminal")?;
    s.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_close(state: State<'_, Terminals>, id: String) -> Result<(), String> {
    let session = state.0.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(mut s) = session {
        let _ = s.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_has_foreground_process(state: State<'_, Terminals>, id: String) -> Result<bool, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let s = map.get(&id).ok_or("no such terminal")?;
    // Unix: tcgetpgrp on the master fd (via portable-pty) vs the shell's pid
    // (the shell is a session leader, so its pgid equals its pid).
    #[cfg(unix)]
    {
        Ok(match (s.master.process_group_leader(), s.shell_pid) {
            (Some(fg), Some(shell)) if fg > 0 => fg as u32 != shell,
            _ => false,
        })
    }
    // Windows has no foreground process group: the shell counts as busy when it has a live child.
    #[cfg(windows)]
    {
        Ok(s.shell_pid.map(has_live_child).unwrap_or(false))
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = s;
        Ok(false)
    }
}

/// True if any process currently lists `parent` as its parent (toolhelp snapshot).
#[cfg(windows)]
fn has_live_child(parent: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    // SAFETY: plain Win32 calls; the entry is zero-initialised with dwSize set, and the
    // snapshot handle is closed before returning.
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = false;
        let mut ok = Process32FirstW(snap, &mut entry);
        while ok != 0 {
            if entry.th32ParentProcessID == parent && entry.th32ProcessID != parent {
                found = true;
                break;
            }
            ok = Process32NextW(snap, &mut entry);
        }
        CloseHandle(snap);
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_split() {
        let mut p = "a€".as_bytes()[..2].to_vec();
        assert_eq!(take_valid_utf8(&mut p), "a");
        p.extend_from_slice(&"€".as_bytes()[1..]);
        assert_eq!(take_valid_utf8(&mut p), "€");
        assert!(p.is_empty());
        let mut bad = vec![b'x', 0xff, b'y'];
        assert_eq!(take_valid_utf8(&mut bad), "x\u{FFFD}y");
    }
}
