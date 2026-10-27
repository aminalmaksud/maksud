// StreamHub, the Windows version of MusingsofMaksudTV: starts the bundled server (web/, packed into
// mmtv-server.exe) and shows it in a native window, with ffmpeg bundled so every file plays with sound.
// It does the same job as mac/main.cjs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, File};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

// Fixed ports so the window's saved state (watch history, My List, preferences) survives restarts.
const PORTS: [u16; 4] = [47913, 47914, 47915, 47916];
// wry's defaults (replaced when extra arguments are given) plus autoplay, like the Mac app.
const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// The running server. Its stdin stays open for as long as the app runs: when the app exits or
/// crashes, Windows closes it and the server quits too (see web/serve.js).
struct Server {
    child: Child,
    _stdin: Option<ChildStdin>,
}

struct State {
    server: Mutex<Option<Server>>,
    base: Mutex<String>,
}

fn free_port() -> Option<u16> {
    PORTS.into_iter().find(|&p| TcpListener::bind(("127.0.0.1", p)).is_ok())
}

fn start_server(app: &AppHandle, port: u16) -> Result<Server, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .ok_or("can't find the app folder")?;
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| data.join("Downloads"))
        .join("StreamHub");
    fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let log = File::create(data.join("server.log")).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(exe_dir.join("mmtv-server.exe"));
    cmd.env("PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("WEB_ROOT", &resources)
        .env("CONFIG_FILE", data.join("config.json"))
        .env("DOWNLOAD_DIR", downloads)
        .env("FFMPEG_PATH", exe_dir.join("ffmpeg.exe"))
        .env("FFPROBE_PATH", exe_dir.join("ffprobe.exe"))
        .env("MMTV_EXIT_WITH_PARENT", "1")
        .stdin(Stdio::piped())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start the server: {e}"))?;
    let stdin = child.stdin.take();
    Ok(Server { child, _stdin: stdin })
}

/// Waits until the server accepts connections, or fails if it exits or takes too long.
fn wait_for(server: &mut Server, port: u16) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return Ok(());
        }
        if let Ok(Some(status)) = server.child.try_wait() {
            return Err(format!("the server stopped ({status})"));
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Err("the server didn't start within 30 seconds".into())
}

/// Pages from the app itself (the startup screen, then the server); everything else opens in the browser.
fn is_own(app: &AppHandle, url: &Url) -> bool {
    let base = app.state::<State>().base.lock().unwrap().clone();
    url.host_str() == Some("tauri.localhost") || url.scheme() == "tauri" || (!base.is_empty() && url.as_str().starts_with(&base))
}

fn fail(app: &AppHandle, error: String) {
    let log: PathBuf = app.path().app_data_dir().map(|d| d.join("server.log")).unwrap_or_default();
    app.dialog()
        .message(format!("StreamHub couldn't start: {error}.\n\nDetails are in {}", log.display()))
        .title("StreamHub")
        .kind(MessageDialogKind::Error)
        .blocking_show();
    app.exit(1);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(State { server: Mutex::new(None), base: Mutex::new(String::new()) })
        .setup(|app| {
            let handle = app.handle().clone();
            let nav = handle.clone();
            let popup = handle.clone();
            // The window opens on a small startup screen right away, then moves to the server once it's up.
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("StreamHub")
                .inner_size(1320.0, 840.0)
                .min_inner_size(760.0, 500.0)
                .background_color(tauri::window::Color(0xf6, 0xef, 0xe4, 0xff))
                .additional_browser_args(BROWSER_ARGS)
                // Links (e.g. "get a TMDB key") open in the default browser, never inside the app.
                .on_navigation(move |url| {
                    if is_own(&nav, url) {
                        return true;
                    }
                    let _ = nav.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .on_new_window(move |url, _| {
                    let _ = popup.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .build()?;

            std::thread::spawn(move || {
                let Some(port) = free_port() else {
                    return fail(&handle, "ports 47913–47916 are all in use".into());
                };
                let mut server = match start_server(&handle, port) {
                    Ok(s) => s,
                    Err(e) => return fail(&handle, e),
                };
                let ready = wait_for(&mut server, port);
                *handle.state::<State>().server.lock().unwrap() = Some(server);
                if let Err(e) = ready {
                    return fail(&handle, e);
                }
                let base = format!("http://127.0.0.1:{port}/");
                *handle.state::<State>().base.lock().unwrap() = base.clone();
                let _ = window.navigate(Url::parse(&base).expect("valid url"));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building StreamHub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut server) = app.state::<State>().server.lock().unwrap().take() {
                    let _ = server.child.kill();
                }
            }
        });
}
