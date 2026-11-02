use serde::Serialize;
use std::time::Duration;
use tauri::{image::Image, menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct Bridge { token: String, client: reqwest::Client }
#[derive(Serialize)]
struct BridgeResponse { status: u16, body: String }

// Renderer cannot choose a hostname, headers, or arbitrary native operation.
#[tauri::command]
async fn backend_request(path: String, method: String, body: Option<String>, bridge: tauri::State<'_, Bridge>) -> Result<BridgeResponse, String> {
    let valid = (method == "GET" && (path == "/v1/health" || path == "/v1/providers")) ||
        ((method == "POST" || method == "DELETE") && (path == "/v1/providers/gemini" || path == "/v1/providers/grok")) ||
        (method == "POST" && path == "/v1/chat") ||
        (method == "POST" && path.len() == 52 && path.starts_with("/v1/chat/") && path.ends_with("/cancel") && {
            let id = &path[9..path.len() - 7];
            id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        });
    if !valid { return Err("Unsupported bridge operation".into()); }
    if body.as_ref().map_or(false, |b| b.len() > 65536) { return Err("Request too large".into()); }
    if bridge.token.len() < 32 { return Err("Start the desktop app with npm run desktop to connect the local bridge".into()); }
    let url = format!("http://127.0.0.1:8765{}", path);
    let verb = match method.as_str() { "GET" => reqwest::Method::GET, "DELETE" => reqwest::Method::DELETE, _ => reqwest::Method::POST };
    let mut request = bridge.client.request(verb, url).bearer_auth(&bridge.token);
    if let Some(json) = body { request = request.header("Content-Type", "application/json").body(json); }
    let response = request.send().await.map_err(|_| "Cannot reach the local bridge. Restart Misaki.")?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|_| "Cannot read bridge response")?;
    Ok(BridgeResponse { status, body })
}

fn recover(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.unminimize();
        // Center on explicit recovery, including after unplugging a monitor.
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn tray_image() -> Image<'static> {
    let size = 32usize;
    let mut rgba = vec![0u8; size * size * 4];
    for y in 0..size { for x in 0..size {
        let i = (y * size + x) * 4;
        let inside = (x as i32 - 16).pow(2) + (y as i32 - 16).pow(2) < 210;
        if inside { rgba[i..i+4].copy_from_slice(&[151, 126, 179, 255]); }
        if inside && (x == 8 || x == 9 || x == 23 || x == 24 || ((10..=16).contains(&x) && y == x + 3) || ((17..=22).contains(&x) && y == 35 - x)) && (10..=23).contains(&y) {
            rgba[i..i+4].copy_from_slice(&[255, 248, 255, 255]);
        }
    }}
    Image::new_owned(rgba, size as u32, size as u32)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
            if event.state() == ShortcutState::Pressed { recover(app); }
        }).build())
        .setup(|app| {
            app.manage(Bridge {
                token: std::env::var("MISAKI_SESSION_TOKEN").unwrap_or_default(),
                client: reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(135)).build()?,
            });
            let show = MenuItem::with_id(app, "show", "Show Misaki", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Misaki", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Misaki", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            TrayIconBuilder::new().icon(tray_image()).tooltip("Makoto Misaki · Ctrl+Shift+M to recover")
                .menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => recover(app),
                    "hide" => { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); } },
                    "quit" => app.exit(0),
                    _ => {},
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { recover(tray.app_handle()); }
                }).build(app)?;
            // Tray remains usable if another program has registered this hotkey.
            if let Err(error) = app.global_shortcut().register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM)) {
                eprintln!("Recovery shortcut unavailable; use the tray: {}", error);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_request])
        .run(tauri::generate_context!())
        .expect("Misaki could not start");
}
