//! List OS printers and send silent ESC/POS jobs (receipt raster, test slip, cut).

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader};
use serde::Serialize;
use std::io::Cursor;
use std::process::Command;
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

static PRINT_JOB_LOCK: Mutex<()> = Mutex::new(());

#[cfg(target_os = "windows")]
fn hidden_powershell() -> Command {
    // This helper talks to the Windows RAW print spooler. In a GUI app,
    // launching it without CREATE_NO_WINDOW flashes a console over the POS.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("powershell.exe");
    command.creation_flags(CREATE_NO_WINDOW);
    command.arg("-NonInteractive");
    command
}

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
pub async fn list_system_printers() -> Result<Vec<SystemPrinter>, String> {
    tauri::async_runtime::spawn_blocking(list_system_printers_blocking)
        .await
        .map_err(|error| format!("Could not list printers: {error}"))?
}

fn list_system_printers_blocking() -> Result<Vec<SystemPrinter>, String> {
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
    use std::collections::BTreeMap;

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

    // Merge several lpstat views — some printers only show in -e / -p, not -a.
    let mut names = BTreeMap::<String, ()>::new();
    let push_name = |map: &mut BTreeMap<String, ()>, raw: &str| {
        let name = raw.trim();
        if !name.is_empty() {
            map.insert(name.to_owned(), ());
        }
    };

    if let Ok(output) = Command::new("lpstat").arg("-e").output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                push_name(&mut names, line);
            }
        }
    }

    if let Ok(output) = Command::new("lpstat").arg("-p").output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("printer ") {
                    if let Some(name) = rest.split_whitespace().next() {
                        push_name(&mut names, name);
                    }
                }
            }
        }
    }

    if let Ok(output) = Command::new("lpstat").arg("-a").output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if let Some(name) = line.split_whitespace().next() {
                    push_name(&mut names, name);
                }
            }
        }
    }

    Ok(names
        .into_keys()
        .map(|name| SystemPrinter {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
        })
        .collect())
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
    let output = hidden_powershell()
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

/// ~24 mm at 203 dpi. Leave enough paper between the last footer line and
/// the cutter, which is farther from the printhead on some thermal printers.
const CUTTER_FEED_DOTS: u8 = 192;

fn pixel_is_ink(pixel: &image::Rgba<u8>) -> bool {
    let alpha = pixel[3] as u16;
    let lum = (pixel[0] as u16 * 3 + pixel[1] as u16 * 6 + pixel[2] as u16) / 10;
    alpha > 40 && lum < 190
}

/// Drop blank rows above the first ink and below the last so the raster
/// starts and ends on the receipt content.
fn trim_vertical_whitespace(image: DynamicImage) -> DynamicImage {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return image;
    }
    let blank = |y: u32| (0..width).all(|x| !pixel_is_ink(rgba.get_pixel(x, y)));
    let mut top = 0u32;
    while top < height && blank(top) {
        top += 1;
    }
    let mut bottom = height;
    while bottom > top && blank(bottom - 1) {
        bottom -= 1;
    }
    if top == 0 && bottom == height {
        return image;
    }
    if bottom <= top {
        return image;
    }
    image.crop_imm(0, top, width, bottom - top)
}

/// ESC @ + GS v 0 raster (chunked) + a short feed + GS V 0 full cut.
fn png_to_escpos(png: &[u8], width_dots: u32) -> Result<Vec<u8>, String> {
    let reader = ImageReader::new(Cursor::new(png))
        .with_guessed_format()
        .map_err(|error| format!("Could not read receipt image: {error}"))?;
    let decoded = reader
        .decode()
        .map_err(|error| format!("Could not decode receipt image: {error}"))?;
    let image = trim_vertical_whitespace(decoded);
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
                if pixel_is_ink(pixel) {
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
    // Feed past the cutter before cutting so the footer is not sliced off.
    out.extend_from_slice(&[0x1B, 0x4A, CUTTER_FEED_DOTS, 0x1D, 0x56, 0x00]);
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

fn receipt_batch_payload(
    png_pages: &[Vec<u8>],
    width_dots: u32,
    copies: u8,
) -> Result<Vec<u8>, String> {
    if png_pages.is_empty() || png_pages.len() > 32 {
        return Err("A print job needs between 1 and 32 pages".into());
    }
    if !(1..=9).contains(&copies) {
        return Err("A print job needs between 1 and 9 copies".into());
    }
    let pages = png_pages
        .iter()
        .map(|png| png_to_escpos(png, width_dots))
        .collect::<Result<Vec<_>, _>>()?;
    let capacity = pages.iter().map(Vec::len).sum::<usize>() * copies as usize;
    let mut payload = Vec::with_capacity(capacity);
    for _ in 0..copies {
        for page in &pages {
            payload.extend_from_slice(page);
        }
    }
    Ok(payload)
}

fn send_raw(printer_name: &str, payload: &[u8]) -> Result<(), String> {
    let _guard = PRINT_JOB_LOCK
        .lock()
        .map_err(|_| "Printer queue is unavailable".to_owned())?;
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
    let job_id = uuid::Uuid::new_v4();
    let bin_path = dir.join(format!("dukan-thermal-{job_id}.bin"));
    let script_path = dir.join(format!("dukan-thermal-{job_id}.ps1"));
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
    bool ok = true;
    int offset = 0;
    while (offset < bytes.Length) {
      IntPtr chunk = IntPtr.Add(buffer, offset);
      if (!WritePrinter(handle, chunk, bytes.Length - offset, out written) || written <= 0) {
        ok = false;
        break;
      }
      offset += written;
    }
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
    let output = hidden_powershell()
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
pub async fn cut_thermal_paper(printer_name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = require_printer_name(&printer_name)?;
        let payload: &[u8] = &[0x1B, 0x40, 0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00];
        send_raw(name, payload)
    })
    .await
    .map_err(|error| format!("Printer task failed: {error}"))?
}

/// Silent receipt: PNG of one slip page → ESC/POS raster + cut. No print dialog.
#[tauri::command]
pub async fn print_thermal_receipt(
    printer_name: String,
    png_base64: String,
    paper_width: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = require_printer_name(&printer_name)?;
        let bytes = base64_decode(png_base64.trim())?;
        let payload = png_to_escpos(&bytes, dots_for_paper(&paper_width))?;
        send_raw(name, &payload)
    })
    .await
    .map_err(|error| format!("Printer task failed: {error}"))?
}

/// Send all split pages and copies as one raw spool job.
#[tauri::command]
pub async fn print_thermal_receipt_batch(
    printer_name: String,
    png_base64_pages: Vec<String>,
    paper_width: String,
    copies: u8,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = require_printer_name(&printer_name)?;
        let png_pages = png_base64_pages
            .iter()
            .map(|page| base64_decode(page.trim()))
            .collect::<Result<Vec<_>, _>>()?;
        let payload = receipt_batch_payload(&png_pages, dots_for_paper(&paper_width), copies)?;
        send_raw(name, &payload)
    })
    .await
    .map_err(|error| format!("Printer task failed: {error}"))?
}

/// Short text slip so Settings can confirm the saved printer without a dialog.
#[tauri::command]
pub async fn print_thermal_test(
    printer_name: String,
    paper_width: String,
    shop_name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = require_printer_name(&printer_name)?;
        let shop = shop_name.trim();
        let payload = text_escpos(&[
            if shop.is_empty() { "Dukan" } else { shop },
            "Test print",
            paper_label(&paper_width),
        ]);
        send_raw(name, &payload)
    })
    .await
    .map_err(|error| format!("Printer task failed: {error}"))?
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
    use super::{dots_for_paper, png_to_escpos, receipt_batch_payload};
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
        assert!(payload.ends_with(&[0x1B, 0x4A, 192, 0x1D, 0x56, 0x00]));
        assert_eq!(dots_for_paper("MM_80"), 576);
    }

    #[test]
    fn raster_drops_blank_rows_above_and_below_the_ink() {
        let mut image = RgbaImage::new(16, 20);
        for pixel in image.pixels_mut() {
            *pixel = Rgba([255, 255, 255, 255]);
        }
        for y in 5..15 {
            for x in 0..16 {
                image.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .unwrap();
        let payload = png_to_escpos(&png, 16).unwrap();
        // GS v 0 header: rows are the two bytes after the width word.
        let marker = payload
            .windows(8)
            .find(|bytes| bytes[..4] == [0x1D, 0x76, 0x30, 0x00])
            .unwrap();
        let rows = u16::from_le_bytes([marker[6], marker[7]]);
        assert_eq!(rows, 10);
    }

    #[test]
    fn raster_keeps_footer_at_end_of_tall_receipt() {
        let mut image = RgbaImage::from_pixel(16, 600, Rgba([255, 255, 255, 255]));
        for x in 0..16 {
            image.put_pixel(x, 0, Rgba([0, 0, 0, 255]));
            image.put_pixel(x, 599, Rgba([0, 0, 0, 255]));
        }
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .unwrap();
        let payload = png_to_escpos(&png, 16).unwrap();
        let mut cursor = 2; // ESC @
        let mut printed_rows = 0;
        let mut last_row = &[][..];
        while payload[cursor..].starts_with(&[0x1D, 0x76, 0x30, 0x00]) {
            let width_bytes =
                u16::from_le_bytes([payload[cursor + 4], payload[cursor + 5]]) as usize;
            let rows = u16::from_le_bytes([payload[cursor + 6], payload[cursor + 7]]) as usize;
            let raster_start = cursor + 8;
            let raster_end = raster_start + width_bytes * rows;
            last_row = &payload[raster_end - width_bytes..raster_end];
            printed_rows += rows;
            cursor = raster_end;
        }
        assert_eq!(printed_rows, 600);
        assert!(last_row.iter().all(|byte| *byte == 0xff));
        assert_eq!(&payload[cursor..], &[0x1B, 0x4A, 192, 0x1D, 0x56, 0x00]);
    }

    #[test]
    fn batch_prints_each_page_in_order_for_each_copy() {
        let first = RgbaImage::from_pixel(8, 1, Rgba([0, 0, 0, 255]));
        let second = RgbaImage::from_pixel(8, 1, Rgba([255, 255, 255, 255]));
        let encode = |image| {
            let mut png = Vec::new();
            DynamicImage::ImageRgba8(image)
                .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
                .unwrap();
            png
        };
        let pages = vec![encode(first), encode(second)];
        let first_payload = png_to_escpos(&pages[0], 8).unwrap();
        let second_payload = png_to_escpos(&pages[1], 8).unwrap();
        let batch = receipt_batch_payload(&pages, 8, 2).unwrap();
        assert_eq!(
            batch,
            [
                first_payload.as_slice(),
                second_payload.as_slice(),
                first_payload.as_slice(),
                second_payload.as_slice(),
            ]
            .concat()
        );
        assert!(receipt_batch_payload(&[], 8, 1).is_err());
        assert!(receipt_batch_payload(&pages, 8, 0).is_err());
    }
}
