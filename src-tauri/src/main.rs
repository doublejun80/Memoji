// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(any(target_os = "windows", test))]
mod windows_startup;

fn main() {
    #[cfg(target_os = "windows")]
    {
        windows_startup::install_panic_reporter();
        if let Err(error) = windows_startup::prepare_vdi_runtime() {
            windows_startup::report_fatal_startup_error(&error);
            return;
        }
    }

    app_lib::run();
}
