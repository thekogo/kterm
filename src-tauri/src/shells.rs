//! Shell discovery, shell-spec parsing and transparent OSC 7 (cwd) integration.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ShellInfo {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// A program plus arguments. `terminal_create`'s `shell` may be a plain path
/// or a command line such as `wsl.exe -d Ubuntu`.
#[derive(Debug, PartialEq, Clone)]
pub struct ShellSpec {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Kind {
    Bash,
    Zsh,
    Fish,
    PowerShell,
    Cmd,
    Wsl,
    Other,
}

/// Splits on whitespace honouring single/double quotes (no backslash escapes,
/// so Windows paths survive).
pub fn tokenize(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut has = false;
    let mut quote: Option<char> = None;
    for c in s.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '"' || c == '\'' => {
                quote = Some(c);
                has = true;
            }
            None if c.is_whitespace() => {
                if has || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    has = false;
                }
            }
            None => cur.push(c),
        }
    }
    if has || !cur.is_empty() {
        out.push(cur);
    }
    out
}

pub fn parse_spec(s: &str) -> ShellSpec {
    parse_spec_with(s, |p| Path::new(p).is_file())
}

pub fn parse_spec_with(s: &str, is_file: impl Fn(&str) -> bool) -> ShellSpec {
    let s = s.trim();
    if is_file(s) {
        return ShellSpec { program: s.to_string(), args: vec![] };
    }
    let mut t = tokenize(s);
    if t.is_empty() {
        return ShellSpec { program: s.to_string(), args: vec![] };
    }
    let program = t.remove(0);
    ShellSpec { program, args: t }
}

pub fn kind_of(program: &str) -> Kind {
    let base = program.rsplit(['/', '\\']).next().unwrap_or(program).to_ascii_lowercase();
    let stem = base.strip_suffix(".exe").unwrap_or(&base);
    match stem {
        "bash" => Kind::Bash,
        "zsh" => Kind::Zsh,
        "fish" => Kind::Fish,
        "powershell" | "pwsh" => Kind::PowerShell,
        "cmd" => Kind::Cmd,
        "wsl" => Kind::Wsl,
        _ => Kind::Other,
    }
}

// ---------------------------------------------------------------- wrappers

pub const PWSH_SCRIPT: &str = "$global:__kterm_op = $function:prompt; function global:prompt { $o=''; try { $l=$executionContext.SessionState.Path.CurrentLocation; if ($l.Provider.Name -eq 'FileSystem') { $p=$l.ProviderPath.Replace('\\','/'); if ($p -match '^[A-Za-z]:') { $p='/'+$p }; if ($p.StartsWith('/')) { $o=[string][char]27+']7;file://'+[Environment]::MachineName+[uri]::EscapeDataString($p).Replace('%2F','/').Replace('%3A',':')+[string][char]27+'\\' } } } catch {}; $o + (& $global:__kterm_op) }";

pub const BASH_RC: &str = r#"# kterm shell integration: source the user's rc, then emit OSC 7 on each prompt.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
__kterm_osc7() {
  local LC_ALL=C str i c out=""
  if [ -n "$MSYSTEM" ]; then str="/$(pwd -W 2>/dev/null || pwd)"; else str="$PWD"; fi
  for ((i = 0; i < ${#str}; i++)); do
    c="${str:i:1}"
    case "$c" in
      [a-zA-Z0-9/._~:-]) out+="$c" ;;
      *) printf -v c '%%%02X' "'$c"; out+="$c" ;;
    esac
  done
  printf '\033]7;file://%s%s\033\\' "${HOSTNAME:-}" "$out"
}
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=(__kterm_osc7 "${PROMPT_COMMAND[@]}")
else
  PROMPT_COMMAND="__kterm_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
"#;

fn zsh_forward(file: &str) -> String {
    format!(
        "# kterm shell integration\n[[ -f \"${{KTERM_ZDOTDIR:-$HOME}}/{file}\" ]] && source \"${{KTERM_ZDOTDIR:-$HOME}}/{file}\"\n"
    )
}

pub const ZSHRC: &str = r#"# kterm shell integration: restore ZDOTDIR, source the real .zshrc, add a precmd hook.
if [[ -n "$KTERM_ZDOTDIR" ]]; then export ZDOTDIR="$KTERM_ZDOTDIR"; else unset ZDOTDIR; fi
__kterm_real="${ZDOTDIR:-$HOME}"
unset KTERM_ZDOTDIR
[[ -f "$__kterm_real/.zshrc" ]] && source "$__kterm_real/.zshrc"
unset __kterm_real
__kterm_osc7() {
  local LC_ALL=C str="$PWD" c out="" i
  for ((i = 1; i <= ${#str}; i++)); do
    c="${str[i]}"
    case "$c" in
      [a-zA-Z0-9/._~:-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '\033]7;file://%s%s\033\\' "${HOST:-}" "$out"
}
precmd_functions+=(__kterm_osc7)
"#;

/// `(relative path, contents)` of every integration file.
pub fn wrapper_files() -> Vec<(&'static str, String)> {
    vec![
        ("bash/kterm.bashrc", BASH_RC.to_string()),
        ("zsh/.zshenv", zsh_forward(".zshenv")),
        ("zsh/.zprofile", zsh_forward(".zprofile")),
        ("zsh/.zshrc", ZSHRC.to_string()),
    ]
}

/// Creates (once per run) the wrapper directory and returns it.
pub fn integration_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let base = dirs::cache_dir().unwrap_or_else(std::env::temp_dir);
        let dir = base.join("kterm").join("shell-integration");
        for (rel, content) in wrapper_files() {
            let p = dir.join(rel);
            std::fs::create_dir_all(p.parent()?).ok()?;
            if std::fs::read_to_string(&p).ok().as_deref() != Some(content.as_str()) {
                std::fs::write(&p, content).ok()?;
            }
        }
        Some(dir)
    })
    .as_deref()
}

/// `C:\a\b` -> `/c/a/b` (Git Bash path syntax).
pub fn to_msys_path(p: &str) -> String {
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        let rest = p[2..].replace('\\', "/");
        let rest = rest.trim_start_matches('/');
        return format!("/{}/{}", (b[0] as char).to_ascii_lowercase(), rest);
    }
    p.replace('\\', "/")
}

#[derive(Debug, PartialEq)]
pub struct Launch {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

/// Decides how to start `spec` so that it emits cwd reports on each prompt.
/// `dir` is the wrapper directory (None disables integration). Pure.
pub fn plan(
    spec: &ShellSpec,
    dir: Option<&Path>,
    orig_zdotdir: Option<&str>,
    windows: bool,
    cmd_prompt: Option<&str>,
) -> Launch {
    let mut l = Launch { program: spec.program.clone(), args: spec.args.clone(), env: vec![] };
    let Some(dir) = dir else { return l };
    match kind_of(&spec.program) {
        Kind::Bash => {
            let rc = dir.join("bash").join("kterm.bashrc").to_string_lossy().into_owned();
            let rc = if windows { to_msys_path(&rc) } else { rc };
            let mut args = vec!["--rcfile".to_string(), rc];
            args.extend(spec.args.iter().cloned());
            l.args = args;
        }
        Kind::Zsh => {
            l.env.push(("KTERM_ZDOTDIR".into(), orig_zdotdir.unwrap_or("").into()));
            l.env.push(("ZDOTDIR".into(), dir.join("zsh").to_string_lossy().into_owned()));
        }
        Kind::PowerShell if spec.args.is_empty() => {
            l.args = vec!["-NoExit".into(), "-Command".into(), PWSH_SCRIPT.into()];
        }
        Kind::Cmd if spec.args.is_empty() => {
            let user = cmd_prompt.filter(|p| !p.is_empty()).unwrap_or("$P$G");
            l.env.push(("PROMPT".into(), format!("$E]9;9;$P$E\\{user}")));
        }
        _ => {}
    }
    l
}

/// True for a path that only makes sense inside Linux (what a WSL shell reports and expects).
pub fn is_linux_path(p: &str) -> bool {
    p.starts_with('/') || p == "~" || p.starts_with("~/")
}

/// Adapts a `wsl.exe` launch: a Linux `cwd` is passed with `--cd` (a Windows cwd would be mapped to
/// `/mnt/c/...`), and bash is asked to report its Linux cwd through OSC 7 via an imported
/// `PROMPT_COMMAND`. Returns true when `cwd` was consumed and must not be set on the Windows side.
pub fn apply_wsl(l: &mut Launch, cwd: Option<&str>, wslenv: Option<&str>) -> bool {
    if kind_of(&l.program) != Kind::Wsl {
        return false;
    }
    l.env.push((
        "PROMPT_COMMAND".into(),
        r#"printf '\033]7;file://%s%s\007' "$HOSTNAME" "${PWD// /%20}""#.into(),
    ));
    let prev = wslenv.filter(|w| !w.is_empty()).map(|w| format!("{w}:")).unwrap_or_default();
    l.env.push(("WSLENV".into(), format!("{prev}PROMPT_COMMAND/u")));
    match cwd {
        _ if l.args.iter().any(|a| a == "--cd" || a == "--cd=") => false,
        // A Windows (or missing) cwd would otherwise land in /mnt/c/...; start in the Linux home.
        c => {
            let dir = c.filter(|c| is_linux_path(c)).unwrap_or("~");
            l.args.splice(0..0, ["--cd".to_string(), dir.to_string()]);
            true
        }
    }
}

// --------------------------------------------------------------- discovery

#[cfg_attr(not(unix), allow(dead_code))]
pub fn parse_etc_shells(text: &str, exists: impl Fn(&str) -> bool) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || !l.starts_with('/') {
            continue;
        }
        if exists(l) && !out.iter().any(|o| o == l) {
            out.push(l.to_string());
        }
    }
    out
}

/// Decodes `wsl.exe -l -q` output (UTF-16LE, usually with BOM) into distro names.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_wsl_list(bytes: &[u8]) -> Vec<String> {
    let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let text = String::from_utf16_lossy(&units);
    text.lines()
        .map(|l| l.trim_matches(|c: char| c == '\u{feff}' || c == '\0' || c.is_whitespace()))
        .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
        .map(str::to_string)
        .collect()
}

fn info(id: &str, name: &str, path: &str) -> ShellInfo {
    ShellInfo { id: id.into(), name: name.into(), path: path.into() }
}

#[cfg(unix)]
pub fn detect() -> Vec<ShellInfo> {
    let mut paths: Vec<String> = Vec::new();
    if let Ok(s) = std::env::var("SHELL")
        && !s.is_empty()
        && Path::new(&s).is_file()
    {
        paths.push(s);
    }
    let text = std::fs::read_to_string("/etc/shells").unwrap_or_default();
    paths.extend(parse_etc_shells(&text, |p| Path::new(p).is_file()));
    let mut seen: Vec<PathBuf> = Vec::new();
    let mut out = Vec::new();
    for p in paths {
        let canon = std::fs::canonicalize(&p).unwrap_or_else(|_| PathBuf::from(&p));
        if seen.contains(&canon) {
            continue;
        }
        seen.push(canon);
        let name = p.rsplit('/').next().unwrap_or(&p).to_string();
        out.push(info(&p, &name, &p));
    }
    out
}

#[cfg(windows)]
fn on_path(exe: &str) -> bool {
    std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).any(|d| d.join(exe).is_file()))
        .unwrap_or(false)
}

#[cfg(windows)]
pub fn detect() -> Vec<ShellInfo> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut out = vec![info("powershell", "Windows PowerShell", "powershell.exe")];
    if on_path("pwsh.exe") {
        out.push(info("pwsh", "PowerShell", "pwsh.exe"));
    }
    out.push(info("cmd", "Command Prompt", "cmd.exe"));
    let git_bash = r"C:\Program Files\Git\bin\bash.exe";
    if Path::new(git_bash).is_file() {
        out.push(info("git-bash", "Git Bash", git_bash));
    }
    if let Ok(o) = std::process::Command::new("wsl.exe")
        .args(["-l", "-q"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        if o.status.success() {
            for d in parse_wsl_list(&o.stdout) {
                let cmd = if d.contains(char::is_whitespace) {
                    format!("wsl.exe -d \"{d}\"")
                } else {
                    format!("wsl.exe -d {d}")
                };
                out.push(info(&format!("wsl:{d}"), &format!("WSL: {d}"), &cmd));
            }
        }
    }
    out
}

#[cfg(not(any(unix, windows)))]
pub fn detect() -> Vec<ShellInfo> {
    vec![]
}

#[tauri::command]
pub fn list_shells() -> Vec<ShellInfo> {
    detect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_quotes() {
        assert_eq!(tokenize("wsl.exe -d Ubuntu"), ["wsl.exe", "-d", "Ubuntu"]);
        assert_eq!(tokenize(r#"wsl.exe -d "Ubuntu 22""#), ["wsl.exe", "-d", "Ubuntu 22"]);
        assert_eq!(tokenize(r#""C:\Program Files\Git\bin\bash.exe" -l"#), [r"C:\Program Files\Git\bin\bash.exe", "-l"]);
        assert!(tokenize("  ").is_empty());
    }

    #[test]
    fn spec_parsing() {
        let s = parse_spec_with("/bin/zsh", |_| false);
        assert_eq!(s, ShellSpec { program: "/bin/zsh".into(), args: vec![] });
        let s = parse_spec_with("wsl.exe -d Ubuntu", |_| false);
        assert_eq!(s.program, "wsl.exe");
        assert_eq!(s.args, ["-d", "Ubuntu"]);
        // an existing file with spaces is taken verbatim
        let p = r"C:\Program Files\Git\bin\bash.exe";
        let s = parse_spec_with(p, |x| x == p);
        assert_eq!(s, ShellSpec { program: p.into(), args: vec![] });
    }

    #[test]
    fn kinds() {
        assert_eq!(kind_of("/usr/bin/zsh"), Kind::Zsh);
        assert_eq!(kind_of(r"C:\Program Files\Git\bin\BASH.EXE"), Kind::Bash);
        assert_eq!(kind_of("pwsh.exe"), Kind::PowerShell);
        assert_eq!(kind_of("CMD.exe"), Kind::Cmd);
        assert_eq!(kind_of("/usr/bin/fish"), Kind::Fish);
        assert_eq!(kind_of("wsl.exe"), Kind::Wsl);
    }

    #[test]
    fn wsl_linux_cwd_uses_cd() {
        let mut l = plan(&parse_spec_with("wsl.exe -d Ubuntu", |_| false), None, None, true, None);
        assert!(apply_wsl(&mut l, Some("/home/me/proj"), Some("A/p")));
        assert_eq!(l.args, ["--cd", "/home/me/proj", "-d", "Ubuntu"]);
        assert!(l.env.contains(&("WSLENV".into(), "A/p:PROMPT_COMMAND/u".into())));
        let mut l = plan(&parse_spec_with("wsl.exe", |_| false), None, None, true, None);
        assert!(apply_wsl(&mut l, Some("C:/Users/me"), None));
        assert_eq!(l.args, ["--cd", "~"]);
        let mut l = plan(&parse_spec_with("/bin/bash", |_| false), None, None, false, None);
        assert!(!apply_wsl(&mut l, Some("/tmp"), None));
    }

    #[test]
    fn plan_bash_zsh() {
        let d = Path::new("/c/k");
        let l = plan(&parse_spec_with("/bin/bash", |_| false), Some(d), None, false, None);
        // Path::join uses the host separator, so compare with separators normalised.
        let norm = |s: &str| s.replace('\\', "/");
        assert_eq!(l.args.iter().map(|a| norm(a)).collect::<Vec<_>>(), ["--rcfile", "/c/k/bash/kterm.bashrc"]);
        let l = plan(&parse_spec_with("/bin/zsh", |_| false), Some(d), Some("/my/z"), false, None);
        assert!(l.env.contains(&("KTERM_ZDOTDIR".into(), "/my/z".into())));
        assert!(l.env.iter().any(|(k, v)| k == "ZDOTDIR" && norm(v) == "/c/k/zsh"));
        let l = plan(&parse_spec_with("/bin/zsh", |_| false), Some(d), None, false, None);
        assert!(l.env.contains(&("KTERM_ZDOTDIR".into(), "".into())));
        let l = plan(&parse_spec_with("/bin/fish", |_| false), Some(d), None, false, None);
        assert!(l.args.is_empty() && l.env.is_empty());
        let l = plan(&parse_spec_with("/bin/bash", |_| false), None, None, false, None);
        assert!(l.args.is_empty());
    }

    #[test]
    fn plan_windows_shells() {
        let d = Path::new(r"C:\Users\me\AppData\Local\kterm\shell-integration");
        let l = plan(&parse_spec_with("pwsh.exe", |_| false), Some(d), None, true, None);
        assert_eq!(l.args[..2], ["-NoExit", "-Command"]);
        assert!(l.args[2].contains("]7;file://"));
        let l = plan(&parse_spec_with("cmd.exe", |_| false), Some(d), None, true, None);
        assert_eq!(l.env, [("PROMPT".to_string(), "$E]9;9;$P$E\\$P$G".to_string())]);
        let l = plan(&parse_spec_with("cmd.exe", |_| false), Some(d), None, true, Some("$P$_$G"));
        assert!(l.env[0].1.ends_with("$E\\$P$_$G"));
        let b = r"C:\Program Files\Git\bin\bash.exe";
        let l = plan(&parse_spec_with(b, |x| x == b), Some(d), None, true, None);
        assert_eq!(l.args[1], "/c/Users/me/AppData/Local/kterm/shell-integration/bash/kterm.bashrc");
        // user-supplied args disable powershell/cmd injection
        let l = plan(&parse_spec_with("pwsh.exe -NoProfile", |_| false), Some(d), None, true, None);
        assert_eq!(l.args, ["-NoProfile"]);
    }

    #[test]
    fn msys() {
        assert_eq!(to_msys_path(r"C:\a\b"), "/c/a/b");
        assert_eq!(to_msys_path("/x/y"), "/x/y");
    }

    #[test]
    fn wrappers_generated() {
        let f = wrapper_files();
        assert!(f.iter().any(|(p, c)| *p == "bash/kterm.bashrc" && c.contains("PROMPT_COMMAND") && c.contains(".bashrc")));
        let z = f.iter().find(|(p, _)| *p == "zsh/.zshenv").unwrap();
        assert!(z.1.contains("KTERM_ZDOTDIR") && z.1.contains(".zshenv"));
        let r = f.iter().find(|(p, _)| *p == "zsh/.zshrc").unwrap();
        assert!(r.1.contains("precmd_functions") && r.1.contains("unset ZDOTDIR"));
        assert!(!PWSH_SCRIPT.contains('"') && !PWSH_SCRIPT.contains('\n'));
    }

    #[test]
    fn etc_shells() {
        let t = "# comment\n/bin/sh\n/bin/bash\n\n/usr/bin/nologin\n/bin/bash\nrbash\n";
        let v = parse_etc_shells(t, |p| p != "/usr/bin/nologin");
        assert_eq!(v, ["/bin/sh", "/bin/bash"]);
    }

    #[test]
    fn wsl_list() {
        let s = "\u{feff}Ubuntu\r\ndocker-desktop\r\nDebian\r\n";
        let bytes: Vec<u8> = s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(parse_wsl_list(&bytes), ["Ubuntu", "Debian"]);
        assert!(parse_wsl_list(&[]).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn wrappers_run_in_real_shells() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let root = std::env::temp_dir().join(format!("kt-{}", uuid::Uuid::new_v4()));
        for (rel, content) in wrapper_files() {
            let p = root.join("int").join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, content).unwrap();
        }
        let home = root.join("home");
        std::fs::create_dir_all(home.join("my dir")).unwrap();
        std::fs::write(home.join(".bashrc"), "PS1='$ '\n").unwrap();
        std::fs::write(home.join(".zshrc"), "PS1='$ '\n").unwrap();
        let int = root.join("int");
        for sh in ["bash", "zsh"] {
            let spec = parse_spec_with(sh, |_| false);
            let l = plan(&spec, Some(&int), None, false, None);
            let mut c = Command::new(sh);
            c.args(&l.args).arg("-i").env("HOME", &home).env_remove("ZDOTDIR").current_dir(home.join("my dir"));
            for (k, v) in &l.env {
                c.env(k, v);
            }
            let Ok(mut child) = c.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn() else { continue };
            child.stdin.take().unwrap().write_all(b"echo hi\nexit\n").unwrap();
            let o = child.wait_with_output().unwrap();
            let out = String::from_utf8_lossy(&o.stdout);
            assert!(out.contains("\x1b]7;file://"), "{sh}: {out:?}");
            assert!(out.contains("/home/my%20dir\x1b\\"), "{sh}: {out:?}");
        }
        let _ = std::fs::remove_dir_all(root);
    }
}
