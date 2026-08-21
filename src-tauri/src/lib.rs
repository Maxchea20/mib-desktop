use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
    WindowEvent,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered before other plugins.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let show =
                MenuItem::with_id(app, "show", "Open MIB Desktop", true, None::<&str>)?;
            let hide =
                MenuItem::with_id(app, "hide", "Hide MIB Desktop", true, None::<&str>)?;
            let quit =
                MenuItem::with_id(app, "quit", "Exit MIB Desktop", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            TrayIconBuilder::with_id("mib-desktop-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("MIB Desktop - Background Worker")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle());
                    }
                })
                .build(app)?;

            // In development we keep the window visible for testing.
            // In a release build the worker starts hidden and runs from the tray.
            #[cfg(not(debug_assertions))]
            {
                hide_main_window(app.app_handle());

                use tauri_plugin_autostart::ManagerExt;

                let autostart_manager = app.autolaunch();

                if !autostart_manager.is_enabled().unwrap_or(false) {
                    let _ = autostart_manager.enable();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // X button hides MIB Desktop instead of killing the worker.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MIB Desktop");
}
