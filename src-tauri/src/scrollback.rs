//! Per-terminal scrollback snapshots, one file per terminal id in the app-data dir.

use std::{fs, io::Write, path::{Path, PathBuf}};

/// Maximum stored size; larger snapshots keep their most recent bytes.
pub const MAX_BYTES: usize = 5 * 1024 * 1024;

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

pub fn file_for(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("invalid terminal id".into());
    }
    Ok(dir.join(format!("{id}.txt")))
}

/// Keeps the tail of `data` within `max` bytes, cutting on a char boundary.
pub fn cap(data: &str, max: usize) -> &str {
    if data.len() <= max {
        return data;
    }
    let mut start = data.len() - max;
    while !data.is_char_boundary(start) {
        start += 1;
    }
    &data[start..]
}

pub fn save(dir: &Path, id: &str, data: &str) -> Result<(), String> {
    let path = file_for(dir, id)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("txt.tmp");
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(cap(data, MAX_BYTES).as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn load(dir: &Path, id: &str) -> Result<Option<String>, String> {
    let path = file_for(dir, id)?;
    match fs::read(&path) {
        Ok(b) => Ok(Some(String::from_utf8_lossy(&b).into_owned())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    let path = file_for(dir, id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids() {
        assert!(valid_id("3f2a-BC9"));
        assert!(!valid_id(""));
        assert!(!valid_id("../x"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("a.b"));
    }

    #[test]
    fn cap_char_boundary() {
        assert_eq!(cap("abc", 10), "abc");
        assert_eq!(cap("abcdef", 3), "def");
        assert_eq!(cap("a€b", 3), "b"); // would cut inside the euro sign
    }

    #[test]
    fn round_trip() {
        let dir = std::env::temp_dir().join(format!("kterm-sb-{}", uuid::Uuid::new_v4()));
        assert_eq!(load(&dir, "abc").unwrap(), None);
        save(&dir, "abc", "hello\x1b[31m").unwrap();
        assert_eq!(load(&dir, "abc").unwrap().as_deref(), Some("hello\x1b[31m"));
        assert!(save(&dir, "../evil", "x").is_err());
        delete(&dir, "abc").unwrap();
        delete(&dir, "abc").unwrap();
        assert_eq!(load(&dir, "abc").unwrap(), None);
        let _ = fs::remove_dir_all(dir);
    }
}
