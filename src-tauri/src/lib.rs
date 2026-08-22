use std::{
    process::{Child, Command},
    sync::Mutex,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{
        MouseButton,
        MouseButtonState,
        TrayIconBuilder,
        TrayIconEvent,
    },
    Manager,
    WindowEvent,
};

struct WorkerProcess(Mutex<Option<Child>>);

fn show_main_window(
    app: &tauri::AppHandle,
) {
    if let Some(window) =
        app.get_webview_window("main")
    {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(
    app: &tauri::AppHandle,
) {
    if let Some(window) =
        app.get_webview_window("main")
    {
        let _ = window.hide();
    }
}

#[tauri::command]
fn start_worker(
    app: tauri::AppHandle,
    access_token: String,
    refresh_token: String,
) -> Result<String, String> {
    let worker_state =
        app.state::<WorkerProcess>();

    let mut worker_guard =
        worker_state
            .0
            .lock()
            .map_err(|_| {
                "Unable to lock worker process state."
                    .to_string()
            })?;

    if worker_guard.is_some() {
        return Ok(
            "Worker already running."
                .to_string()
        );
    }

    let project_dir = std::path::PathBuf::from(
    env!("CARGO_MANIFEST_DIR")
)
.parent()
.ok_or_else(|| {
    "Unable to determine MIB project directory.".to_string()
})?
.to_path_buf();

let worker_path = project_dir
    .join("worker")
    .join("worker.mjs");

    if !worker_path.exists() {
        return Err(format!(
            "Worker file not found: {}",
            worker_path.display()
        ));
    }

    let mut command =
        Command::new("node");

    command
        .arg(&worker_path)
        .current_dir(&project_dir)
        .env(
            "MIB_WORKER_ACCESS_TOKEN",
            access_token,
        )
        .env(
            "MIB_WORKER_REFRESH_TOKEN",
            refresh_token,
        );

    let child =
        command.spawn().map_err(|error| {
            format!(
                "Failed to start MIB worker: {}",
                error
            )
        })?;

    let pid = child.id();

    *worker_guard = Some(child);

    println!(
        "MIB Desktop worker started. PID: {}",
        pid
    );

    Ok(format!(
        "Worker started successfully. PID: {}",
        pid
    ))
}

#[tauri::command]
fn stop_worker(
    app: tauri::AppHandle,
) -> Result<String, String> {
    let worker_state =
        app.state::<WorkerProcess>();

    let mut worker_guard =
        worker_state
            .0
            .lock()
            .map_err(|_| {
                "Unable to lock worker process state."
                    .to_string()
            })?;

    if let Some(mut child) =
        worker_guard.take()
    {
        let _ = child.kill();
        let _ = child.wait();

        println!(
            "MIB Desktop worker stopped."
        );

        return Ok(
            "Worker stopped successfully."
                .to_string()
        );
    }

    Ok(
        "Worker was not running."
            .to_string()
    )
}

pub fn run() {
    tauri::Builder::default()
        .manage(
            WorkerProcess(
                Mutex::new(None),
            ),
        )

        .plugin(
            tauri_plugin_single_instance::init(
                |app, _args, _cwd| {
                    show_main_window(app);
                },
            ),
        )

        .plugin(
            tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ),
        )

        // IMPORTANT:
        // Expose the Rust functions to the
        // React frontend through Tauri IPC.
        .invoke_handler(
            tauri::generate_handler![
                start_worker,
                stop_worker
            ],
        )

        .setup(|app| {
            let show =
                MenuItem::with_id(
                    app,
                    "show",
                    "Open MIB Desktop",
                    true,
                    None::<&str>,
                )?;

            let hide =
                MenuItem::with_id(
                    app,
                    "hide",
                    "Hide MIB Desktop",
                    true,
                    None::<&str>,
                )?;

            let quit =
                MenuItem::with_id(
                    app,
                    "quit",
                    "Exit MIB Desktop",
                    true,
                    None::<&str>,
                )?;

            let menu =
                Menu::with_items(
                    app,
                    &[&show, &hide, &quit],
                )?;

            TrayIconBuilder::with_id(
                "mib-desktop-tray",
            )
            .icon(
                app.default_window_icon()
                    .unwrap()
                    .clone(),
            )
            .tooltip(
                "MIB Desktop - Background Worker",
            )
            .menu(&menu)

            .show_menu_on_left_click(false)

            .on_menu_event(
                |app, event| {
                    match event
                        .id
                        .as_ref()
                    {
                        "show" => {
                            show_main_window(
                                app,
                            )
                        }

                        "hide" => {
                            hide_main_window(
                                app,
                            )
                        }

                        "quit" => {
                            let _ =
                                stop_worker(
                                    app.clone(),
                                );

                            app.exit(0);
                        }

                        _ => {}
                    }
                },
            )

            .on_tray_icon_event(
                |tray, event| {
                    if let TrayIconEvent::Click {
                        button:
                            MouseButton::Left,
                        button_state:
                            MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(
                            &tray.app_handle(),
                        );
                    }
                },
            )

            .build(app)?;

            #[cfg(not(debug_assertions))]
            {
                hide_main_window(
                    app.app_handle(),
                );

                use tauri_plugin_autostart::ManagerExt;

                let autostart_manager =
                    app.autolaunch();

                if !autostart_manager
                    .is_enabled()
                    .unwrap_or(false)
                {
                    let _ =
                        autostart_manager
                            .enable();
                }
            }

            Ok(())
        })

        .on_window_event(
            |window, event| {
                if let WindowEvent::CloseRequested {
                    api,
                    ..
                } = event
                {
                    api.prevent_close();

                    let _ =
                        window.hide();
                }
            },
        )

        .run(
            tauri::generate_context!(),
        )
        .expect(
            "error while running MIB Desktop",
        );
}