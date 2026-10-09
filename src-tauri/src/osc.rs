//! Incremental scanner for OSC sequences (7 = cwd, 0/2 = title) in a PTY byte stream.

#[derive(Debug, PartialEq)]
pub enum OscEvent {
    Cwd(String),
    Title(String),
}

#[derive(Default)]
pub struct OscScanner {
    buf: Vec<u8>,
    state: State,
}

#[derive(Default, PartialEq, Clone, Copy)]
enum State {
    #[default]
    Ground,
    Esc,
    Osc,
    OscEsc,
}

const MAX_OSC: usize = 8192;

impl OscScanner {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<OscEvent> {
        let mut out = Vec::new();
        for &b in bytes {
            match self.state {
                State::Ground => {
                    if b == 0x1b {
                        self.state = State::Esc;
                    }
                }
                State::Esc => {
                    if b == b']' {
                        self.buf.clear();
                        self.state = State::Osc;
                    } else if b == 0x1b {
                        // stay in Esc
                    } else {
                        self.state = State::Ground;
                    }
                }
                State::Osc => match b {
                    0x07 => self.finish(&mut out),
                    0x1b => self.state = State::OscEsc,
                    _ => {
                        self.buf.push(b);
                        if self.buf.len() > MAX_OSC {
                            self.buf.clear();
                            self.state = State::Ground;
                        }
                    }
                },
                State::OscEsc => {
                    if b == b'\\' {
                        self.finish(&mut out);
                    } else {
                        self.buf.clear();
                        self.state = if b == b']' { State::Osc } else { State::Ground };
                    }
                }
            }
        }
        out
    }

    fn finish(&mut self, out: &mut Vec<OscEvent>) {
        self.state = State::Ground;
        let body = String::from_utf8_lossy(&self.buf).into_owned();
        self.buf.clear();
        if let Some((code, rest)) = body.split_once(';') {
            match code {
                "7" => {
                    if let Some(p) = parse_osc7(rest) {
                        out.push(OscEvent::Cwd(p));
                    }
                }
                "9" => {
                    if let Some(p) = rest.strip_prefix("9;").and_then(parse_osc9_9) {
                        out.push(OscEvent::Cwd(p));
                    }
                }
                "0" | "2" => out.push(OscEvent::Title(rest.to_string())),
                _ => {}
            }
        }
    }
}

/// Parses the path of ConEmu's `OSC 9;9;<path>` (optionally quoted); backslashes become `/`
/// so the result matches what OSC 7 produces on Windows.
pub fn parse_osc9_9(path: &str) -> Option<String> {
    let p = path.trim().trim_matches('"');
    (!p.is_empty()).then(|| p.replace('\\', "/"))
}

/// Parses `file://host/path` (percent-encoded) into a filesystem path.
pub fn parse_osc7(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("file://")?;
    let path = &rest[rest.find('/')?..];
    let decoded = percent_decode(path);
    // Windows: /C:/Users/x -> C:/Users/x
    let b = decoded.as_bytes();
    if b.len() >= 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' {
        return Some(decoded[1..].to_string());
    }
    Some(decoded)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(c: u8) -> Option<u8> {
    (c as char).to_digit(16).map(|d| d as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn osc7_basic() {
        assert_eq!(parse_osc7("file://host/home/me/a%20b"), Some("/home/me/a b".into()));
        assert_eq!(parse_osc7("file:///tmp"), Some("/tmp".into()));
        assert_eq!(parse_osc7("file://h/C:/Users/x"), Some("C:/Users/x".into()));
        assert_eq!(parse_osc7("file://h/a%2"), Some("/a%2".into()));
        assert_eq!(parse_osc7("http://x/y"), None);
    }

    #[test]
    fn scanner_bel_and_st_split_chunks() {
        let mut s = OscScanner::default();
        assert!(s.feed(b"hello\x1b]7;file://h/ho").is_empty());
        let ev = s.feed(b"me/x\x07more\x1b]2;my title\x1b\\");
        assert_eq!(
            ev,
            vec![OscEvent::Cwd("/home/x".into()), OscEvent::Title("my title".into())]
        );
    }

    #[test]
    fn osc9_9_cwd() {
        assert_eq!(parse_osc9_9(r"C:\Users\me"), Some("C:/Users/me".into()));
        assert_eq!(parse_osc9_9(r#""C:\a b""#), Some("C:/a b".into()));
        assert_eq!(parse_osc9_9(""), None);
        let mut s = OscScanner::default();
        let ev = s.feed(b"\x1b]9;9;C:\\Users\\me\x1b\\\x1b]9;4;1;50\x07");
        assert_eq!(ev, vec![OscEvent::Cwd("C:/Users/me".into())]);
    }

    #[test]
    fn scanner_ignores_other() {
        let mut s = OscScanner::default();
        assert!(s.feed(b"\x1b]8;;http://x\x07\x1b[31mred").is_empty());
    }
}
