//! List OS printers and send silent ESC/POS jobs (receipt raster, test slip, cut).

use image::imageops::FilterType;
use image::{GenericImageView, ImageReader};
use serde::Serialize;
use std::io::Cursor;
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

fn require_printer_name(printer_name: &str) -> Result<&str, String> {
    let name = printer_name.trim();
    if name.is_empty() {
        return Err("Printer name is empty".into());
    }
    Ok(name)
}

/// 58 mm ≈ 384 dots, 80 mm ≈ 576 dots (203 dpi thermal).
fn dots_for_paper(paper_width: &str) -> u32 {
    if paper_width.trim().eq_ignore_ascii_case("MM_58") {
        384
    } else {
        576
    }
}

fn paper_label(paper_width: &str) -> &'static str {
    if paper_width.trim().eq_ignore_ascii_case("MM_58") {
        "58 mm"
    } else {
        "80 mm"
    }
}

/// ESC @ + GS v 0 raster (chunked) + ESC d 6 + GS V 0 full cut.
fn png_to_escpos(png: &[u8], width_dots: u32) -> Result<Vec<u8>, String> {
    let reader = ImageReader::new(Cursor::new(png))
        .with_guessed_format()
        .map_err(|error| format!("Could not read receipt image: {error}"))?;
    let image = reader
        .decode()
        .map_err(|error| format!("Could not decode receipt image: {error}"))?;
    let (src_w, src_h) = image.dimensions();
    if src_w == 0 || src_h == 0 {
        return Err("Receipt image is empty".into());
    }
    let target_w = width_dots.max(8);
    let target_h = ((src_h as u64 * target_w as u64) / src_w as u64).max(1) as u32;
    let resized = image.resize_exact(target_w, target_h, FilterType::Triangle);
    let rgba = resized.to_rgba8();
    let width_bytes = (target_w / 8) as usize;
    let mut raster = Vec::with_capacity(width_bytes * target_h as usize);
    for y in 0..target_h {
        for xb in 0..width_bytes {
            let mut byte = 0u8;
            for bit in 0..8 {
                let x = (xb * 8 + bit) as u32;
                let pixel = rgba.get_pixel(x, y);
                let alpha = pixel[3] as u16;
                let lum = (pixel[0] as u16 * 3 + pixel[1] as u16 * 6 + pixel[2] as u16) / 10;
                if alpha > 40 && lum < 190 {
                    byte |= 0x80 >> bit;
                }
            }
            raster.push(byte);
        }
    }

    let mut out = vec![0x1B, 0x40];
    let chunk_rows = 256u32;
    let mut y = 0u32;
    while y < target_h {
        let rows = (target_h - y).min(chunk_rows);
        let x_bytes = width_bytes as u16;
        out.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00]);
        out.push((x_bytes & 0xff) as u8);
        out.push((x_bytes >> 8) as u8);
        out.push((rows & 0xff) as u8);
        out.push(((rows >> 8) & 0xff) as u8);
        let start = y as usize * width_bytes;
        let end = start + rows as usize * width_bytes;
        out.extend_from_slice(&raster[start..end]);
        y += rows;
    }
    // Feed then full cut — same bytes as the XP-Q200II cutter.
    out.extend_from_slice(&[0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00]);
    Ok(out)
}

fn text_escpos(lines: &[&str]) -> Vec<u8> {
    let mut out = vec![0x1B, 0x40, 0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01];
    for line in lines {
        let ascii: String = line
            .chars()
            .filter(|ch| ch.is_ascii() && *ch != '\n')
            .collect();
        let text = if ascii.trim().is_empty() {
            "Dukan"
        } else {
            ascii.trim()
        };
        out.extend_from_slice(text.as_bytes());
        out.push(b'\n');
    }
    out.extend_from_slice(&[0x1B, 0x45, 0x00, 0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00]);
    out
}

fn send_raw(printer_name: &str, payload: &[u8]) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let mut child = Command::new("lp")
            .args(["-d", printer_name, "-o", "raw", "-n", "1"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start print job: {error}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload)
                .map_err(|error| format!("Could not send print job: {error}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Print job failed: {error}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Print job failed: {err}"));
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        send_raw_windows(printer_name, payload)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = (printer_name, payload);
        Err("Silent thermal print is not supported on this OS".into())
    }
}

#[cfg(target_os = "windows")]
fn send_raw_windows(printer_name: &str, payload: &[u8]) -> Result<(), String> {
    use std::fs;
    let dir = std::env::temp_dir();
    let bin_path = dir.join("dukan-thermal-job.bin");
    let script_path = dir.join("dukan-thermal-job.ps1");
    fs::write(&bin_path, payload)
        .map_err(|error| format!("Could not write print file: {error}"))?;
    let script = r#"
param([string]$PrinterName, [string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DukanRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr handle, int level, [In] DocInfo doc);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);
  public static void Send(string printer, byte[] bytes) {
    IntPtr handle;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception();
    var doc = new DocInfo { pDocName = "Dukan", pDataType = "RAW" };
    if (!StartDocPrinter(handle, 1, doc)) { ClosePrinter(handle); throw new System.ComponentModel.Win32Exception(); }
    if (!StartPagePrinter(handle)) { EndDocPrinter(handle); ClosePrinter(handle); throw new System.ComponentModel.Win32Exception(); }
    IntPtr buffer = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, buffer, bytes.Length);
    int written;
    bool ok = WritePrinter(handle, buffer, bytes.Length, out written);
    Marshal.FreeCoTaskMem(buffer);
    EndPagePrinter(handle);
    EndDocPrinter(handle);
    ClosePrinter(handle);
    if (!ok) throw new System.ComponentModel.Win32Exception();
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($Path)
[DukanRawPrinter]::Send($PrinterName, $bytes)
"#;
    fs::write(&script_path, script)
        .map_err(|error| format!("Could not write print script: {error}"))?;
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.display().to_string(),
            "-PrinterName",
            printer_name,
            "-Path",
            &bin_path.display().to_string(),
        ])
        .output();
    let _ = fs::remove_file(&bin_path);
    let _ = fs::remove_file(&script_path);
    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            Err(format!("Print job failed: {err}{stdout}"))
        }
        Err(error) => Err(format!("Print job failed: {error}")),
    }
}

/// Feed a few lines then full-cut (ESC/POS).
#[tauri::command]
pub fn cut_thermal_paper(printer_name: String) -> Result<(), String> {
    let name = require_printer_name(&printer_name)?;
    let payload: &[u8] = &[0x1B, 0x40, 0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00];
    send_raw(name, payload)
}

/// Silent receipt: PNG of one slip page → ESC/POS raster + cut. No print dialog.
#[tauri::command]
pub fn print_thermal_receipt(
    printer_name: String,
    png_base64: String,
    paper_width: String,
) -> Result<(), String> {
    let name = require_printer_name(&printer_name)?;
    let bytes = base64_decode(png_base64.trim())?;
    let payload = png_to_escpos(&bytes, dots_for_paper(&paper_width))?;
    send_raw(name, &payload)
}

/// Short text slip so Settings can confirm the saved printer without a dialog.
#[tauri::command]
pub fn print_thermal_test(
    printer_name: String,
    paper_width: String,
    shop_name: String,
) -> Result<(), String> {
    let name = require_printer_name(&printer_name)?;
    let shop = shop_name.trim();
    let payload = text_escpos(&[
        if shop.is_empty() { "Dukan" } else { shop },
        "Test print",
        paper_label(&paper_width),
    ]);
    send_raw(name, &payload)
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn val(byte: u8) -> Result<u8, String> {
        match byte {
            b'A'..=b'Z' => Ok(byte - b'A'),
            b'a'..=b'z' => Ok(byte - b'a' + 26),
            b'0'..=b'9' => Ok(byte - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err("Receipt image was not valid".into()),
        }
    }
    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    if !cleaned.len().is_multiple_of(4) {
        return Err("Receipt image was not valid".into());
    }
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let pad = chunk.iter().filter(|byte| **byte == b'=').count();
        let a = val(chunk[0])?;
        let b = val(chunk[1])?;
        let c = if chunk[2] == b'=' { 0 } else { val(chunk[2])? };
        let d = if chunk[3] == b'=' { 0 } else { val(chunk[3])? };
        out.push((a << 2) | (b >> 4));
        if pad < 2 {
            out.push((b << 4) | (c >> 2));
        }
        if pad < 1 {
            out.push((c << 6) | d);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{dots_for_paper, png_to_escpos};
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
    use std::io::Cursor;

    #[test]
    fn raster_includes_gs_v_and_cut() {
        let mut image = RgbaImage::new(16, 8);
        for pixel in image.pixels_mut() {
            *pixel = Rgba([0, 0, 0, 255]);
        }
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .unwrap();
        let payload = png_to_escpos(&png, dots_for_paper("MM_58")).unwrap();
        assert!(payload.starts_with(&[0x1B, 0x40]));
        assert!(payload
            .windows(4)
            .any(|bytes| bytes == [0x1D, 0x76, 0x30, 0x00]));
        assert!(payload.ends_with(&[0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00]));
        assert_eq!(dots_for_paper("MM_80"), 576);
    }
}
