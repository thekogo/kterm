use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PinnedTerminal {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub renamed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SidebarItem {
    Terminal {
        terminal: PinnedTerminal,
    },
    Group {
        id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        shell: Option<String>,
        terminals: Vec<PinnedTerminal>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layout {
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell: Option<String>,
    pub items: Vec<SidebarItem>,
}

/// Returns None if the file is missing, unreadable, malformed or of an unknown version.
pub fn load_from(path: &Path) -> Option<Layout> {
    let text = fs::read_to_string(path).ok()?;
    let layout: Layout = serde_json::from_str(&text).ok()?;
    (layout.version == 1).then_some(layout)
}

/// Atomic write: temp file in the same directory, fsync, then rename.
pub fn save_to(path: &Path, layout: &Layout) -> Result<(), String> {
    let dir = path.parent().ok_or("invalid layout path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Layout {
        Layout {
            version: 1,
            shell: Some("/bin/zsh".into()),
            items: vec![
                SidebarItem::Terminal {
                    terminal: PinnedTerminal { id: "a".into(), name: "one".into(), cwd: None, renamed: false },
                },
                SidebarItem::Group {
                    id: "g".into(),
                    name: "grp".into(),
                    cwd: Some("/tmp".into()),
                    shell: None,
                    terminals: vec![PinnedTerminal {
                        id: "b".into(),
                        name: "two".into(),
                        cwd: Some("/home".into()),
                        renamed: true,
                    }],
                },
            ],
        }
    }

    #[test]
    fn round_trip() {
        let dir = std::env::temp_dir().join(format!("kterm-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join("layout.json");
        assert!(load_from(&path).is_none());
        save_to(&path, &sample()).unwrap();
        assert_eq!(load_from(&path), Some(sample()));
        assert!(!path.with_extension("json.tmp").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn contract_shape() {
        let v = serde_json::to_value(sample()).unwrap();
        assert_eq!(v["items"][0]["kind"], "terminal");
        assert_eq!(v["items"][1]["kind"], "group");
        assert!(v["items"][0]["terminal"].get("cwd").is_none());
    }

    #[test]
    fn bad_version_is_none() {
        let dir = std::env::temp_dir().join(format!("kterm-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("layout.json");
        fs::write(&p, r#"{"version":2,"items":[]}"#).unwrap();
        assert!(load_from(&p).is_none());
        let _ = fs::remove_dir_all(dir);
    }
}
