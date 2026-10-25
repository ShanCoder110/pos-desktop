//! Native Windows spooler access. No shell, temporary script, or runtime compiler.
use std::ffi::c_void;
use std::ptr::{null, null_mut};

type Handle = *mut c_void;

#[repr(C)]
struct DocInfo {
    name: *const u16,
    output: *const u16,
    data_type: *const u16,
}

#[repr(C)]
struct PrinterInfo4 {
    name: *const u16,
    server: *const u16,
    attributes: u32,
}

#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterW(name: *const u16, handle: *mut Handle, defaults: *const c_void) -> i32;
    fn ClosePrinter(handle: Handle) -> i32;
    fn StartDocPrinterW(handle: Handle, level: u32, info: *const DocInfo) -> u32;
    fn StartPagePrinter(handle: Handle) -> i32;
    fn WritePrinter(handle: Handle, bytes: *const u8, count: u32, written: *mut u32) -> i32;
    fn EndPagePrinter(handle: Handle) -> i32;
    fn EndDocPrinter(handle: Handle) -> i32;
    fn AbortPrinter(handle: Handle) -> i32;
    fn EnumPrintersW(
        flags: u32,
        name: *const u16,
        level: u32,
        buffer: *mut u8,
        size: u32,
        needed: *mut u32,
        returned: *mut u32,
    ) -> i32;
    fn GetDefaultPrinterW(buffer: *mut u16, size: *mut u32) -> i32;
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn last_error(operation: &str) -> String {
    format!("{operation}: {}", std::io::Error::last_os_error())
}

struct PrinterJob {
    handle: Handle,
    started: bool,
}

impl Drop for PrinterJob {
    fn drop(&mut self) {
        // SAFETY: the handle belongs to this job and is closed exactly once.
        unsafe {
            if self.started {
                AbortPrinter(self.handle);
            }
            ClosePrinter(self.handle);
        }
    }
}

pub(crate) fn send_raw(name: &str, payload: &[u8]) -> Result<(), String> {
    if name.contains('\0') || name.trim().is_empty() {
        return Err("Select a valid Windows printer name in Settings → Printer.".into());
    }
    let printer_name = wide(name);
    let document_name = wide("Dukan receipt");
    let raw = wide("RAW");
    let mut handle = null_mut();
    // SAFETY: strings are NUL-terminated UTF-16; buffers and handle remain alive
    // throughout each synchronous call. All return values are checked before use.
    unsafe {
        if OpenPrinterW(printer_name.as_ptr(), &mut handle, null()) == 0 {
            return Err(last_error("Could not open the selected printer"));
        }
        let mut job = PrinterJob {
            handle,
            started: false,
        };
        let info = DocInfo {
            name: document_name.as_ptr(),
            output: null(),
            data_type: raw.as_ptr(),
        };
        let job_id = StartDocPrinterW(handle, 1, &info);
        if job_id == 0 {
            return Err(last_error("Could not start the receipt job"));
        }
        job.started = true;
        if StartPagePrinter(handle) == 0 {
            return Err(last_error("Could not start the receipt page"));
        }
        let mut offset = 0;
        while offset < payload.len() {
            let count = (payload.len() - offset).min(64 * 1024) as u32;
            let mut written = 0;
            if WritePrinter(handle, payload.as_ptr().add(offset), count, &mut written) == 0 {
                return Err(last_error("Could not send receipt data"));
            }
            if written == 0 || written > count {
                return Err("Windows did not accept the complete receipt data.".into());
            }
            offset += written as usize;
        }
        if EndPagePrinter(handle) == 0 {
            return Err(last_error("Could not finish the receipt page"));
        }
        if EndDocPrinter(handle) == 0 {
            return Err(last_error(
                "Could not submit the receipt to the printer queue",
            ));
        }
        job.started = false;
    }
    Ok(())
}

pub(crate) fn list_printers() -> Result<Vec<(String, bool)>, String> {
    const FLAGS: u32 = 2 | 4; // PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
    let mut needed = 0;
    let mut returned = 0;
    // SAFETY: the first call requests the buffer size. The second writes into an
    // aligned allocation of at least that size. Returned strings live in it.
    unsafe {
        let ok = EnumPrintersW(FLAGS, null(), 4, null_mut(), 0, &mut needed, &mut returned);
        if ok == 0 && std::io::Error::last_os_error().raw_os_error() != Some(122) {
            return Err(last_error("Could not list Windows printers"));
        }
        if needed == 0 {
            return Ok(Vec::new());
        }
        let size = needed;
        let mut buffer = vec![0usize; (size as usize).div_ceil(std::mem::size_of::<usize>())];
        if EnumPrintersW(
            FLAGS,
            null(),
            4,
            buffer.as_mut_ptr().cast(),
            size,
            &mut needed,
            &mut returned,
        ) == 0
        {
            return Err(last_error("Could not list Windows printers"));
        }
        if returned as usize > size as usize / std::mem::size_of::<PrinterInfo4>() {
            return Err("Windows returned an invalid printer list.".into());
        }
        let mut default_size = 0;
        GetDefaultPrinterW(null_mut(), &mut default_size);
        let mut default_buffer = vec![0u16; default_size as usize];
        let default = if default_size > 0
            && GetDefaultPrinterW(default_buffer.as_mut_ptr(), &mut default_size) != 0
        {
            String::from_utf16_lossy(
                &default_buffer[..default_buffer
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(default_buffer.len())],
            )
        } else {
            String::new()
        };
        let rows =
            std::slice::from_raw_parts(buffer.as_ptr().cast::<PrinterInfo4>(), returned as usize);
        let mut printers = Vec::new();
        for row in rows {
            if row.name.is_null() {
                continue;
            }
            let mut length = 0;
            while *row.name.add(length) != 0 {
                length += 1;
            }
            let name = String::from_utf16_lossy(std::slice::from_raw_parts(row.name, length));
            if !name.is_empty() {
                let is_default = name == default;
                printers.push((name, is_default));
            }
        }
        Ok(printers)
    }
}
