//! List OS printers + send thermal paper-cut for Settings → Printer / POS print.

use serde::Serialize;
use std::process::Command;

#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::io::Write;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::process::Stdio;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPrinter {
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_system_printers() -> Result<Vec<SystemPrinter>, String> {
    #[cfg(target_os = "macos")]
    {
        list_cups_printers()
    }
    #[cfg(target_os = "linux")]
    {
        list_cups_printers()
    }
    #[cfg(target_os = "windows")]
    {
        list_windows_printers()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn list_cups_printers() -> Result<Vec<SystemPrinter>, String> {
    let default_name = Command::new("lpstat")
        .arg("-d")
        .output()
        .ok()
        .and_then(|out| {
            let text = String::from_utf8_lossy(&out.stdout);
            text.split(':')
                .nth(1)
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        });

    let output = Command::new("lpstat")
        .arg("-a")
        .output()
        .map_err(|error| format!("Could not list printers: {error}"))?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    for line in text.lines() {
        let name = line.split_whitespace().next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        printers.push(SystemPrinter {
            is_default: default_name.as_deref() == Some(name),
            name: name.to_owned(),
        });
    }
    Ok(printers)
}

#[cfg(target_os = "windows")]
fn list_windows_printers() -> Result<Vec<SystemPrinter>, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$default = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
Get-CimInstance Win32_Printer | ForEach-Object {
  $isDefault = if ($default -and $_.Name -eq $default) { '1' } else { '0' }
  Write-Output ($isDefault + "`t" + $_.Name)
}
"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|error| format!("Could not list printers: {error}"))?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    for line in text.lines() {
        let mut parts = line.splitn(2, '\t');
        let flag = parts.next().unwrap_or("0").trim();
        let name = parts.next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        printers.push(SystemPrinter {
            name: name.to_owned(),
            is_default: flag == "1",
        });
    }
    Ok(printers)
}

/// Feed a few lines then full-cut (ESC/POS). Used after HTML receipt print.
#[tauri::command]
pub fn cut_thermal_paper(printer_name: String) -> Result<(), String> {
    let name = printer_name.trim();
    if name.is_empty() {
        return Err("Printer name is empty".into());
    }
    // Xprinter XP-Q200II: ESC @ init, ESC d 6 feed, GS V 0 full cut (1B 40 1B 64 06 1D 56 00).
    // Init helps after HTML/raster jobs so the cutter command is not ignored.
    let payload: &[u8] = &[0x1B, 0x40, 0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00];

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let mut child = Command::new("lp")
            .args(["-d", name, "-o", "raw", "-n", "1"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start print job: {error}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload)
                .map_err(|error| format!("Could not send cut command: {error}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Cut job failed: {error}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Cut job failed: {err}"));
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        use std::fs;
        use std::path::PathBuf;
        let path: PathBuf = std::env::temp_dir().join("dukan-thermal-cut.bin");
        fs::write(&path, payload).map_err(|error| format!("Could not write cut file: {error}"))?;
        let share = format!("\\\\localhost\\{}", name.replace('"', ""));
        let copy = Command::new("cmd")
            .args(["/C", "copy", "/B", &path.display().to_string(), &share])
            .output();
        let _ = fs::remove_file(&path);
        match copy {
            Ok(out) if out.status.success() => Ok(()),
            Ok(out) => Err(format!(
                "Cut job failed: {}",
                String::from_utf8_lossy(&out.stderr)
            )),
            Err(error) => Err(format!("Cut job failed: {error}")),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = payload;
        Err("Paper cut is not supported on this OS".into())
    }
}
