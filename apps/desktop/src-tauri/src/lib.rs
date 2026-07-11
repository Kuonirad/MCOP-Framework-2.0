use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{path::BaseDirectory, Manager, WebviewWindow};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use url::Url;

#[derive(Default)]
struct RuntimeState {
    child: Mutex<Option<CommandChild>>,
    port: Mutex<Option<u16>>,
}

fn view_from_args(args: &[String]) -> &'static str {
    for argument in args {
        if !argument.starts_with("mcop://") {
            continue;
        }
        if let Ok(url) = Url::parse(argument) {
            let candidate = url
                .host_str()
                .or_else(|| url.path_segments().and_then(|mut parts| parts.next()))
                .unwrap_or_default();
            return match candidate {
                "dialectical" => "dialectical",
                "showcase" => "showcase",
                _ => "home",
            };
        }
    }
    "home"
}

fn navigate(window: &WebviewWindow, port: u16, view: &str) -> Result<(), String> {
    let target = Url::parse(&format!("http://127.0.0.1:{port}/desktop?view={view}"))
        .map_err(|error| error.to_string())?;
    window.navigate(target).map_err(|error| error.to_string())?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn reserve_loopback_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| error.to_string())
}

fn wait_for_server(port: u16, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    while started.elapsed() < timeout {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "Next standalone server did not bind 127.0.0.1:{port} within {timeout:?}"
    ))
}

/// Next standalone entrypoint relative to the staged server resource root.
///
/// Must stay relative (no drive letters or path separators). Absolute Windows
/// paths under install dirs with spaces (NSIS current-user: `MCOP Desktop`)
/// were split by the shell sidecar layer so Node resolved `C:` and exited
/// with `EISDIR` before the loopback server bound.
const NODE_SERVER_ENTRY: &str = "server.js";

fn server_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("resources/server", BaseDirectory::Resource)
        .map_err(|error| error.to_string())
}

fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<CommandChild, String> {
    let root = server_root(app)?;
    let server = root.join(NODE_SERVER_ENTRY);
    if !server.is_file() {
        return Err(format!(
            "Bundled Next entrypoint is missing: {}",
            server.display()
        ));
    }

    let command = app
        .shell()
        .sidecar("node")
        .map_err(|error| error.to_string())?
        .arg(NODE_SERVER_ENTRY)
        .current_dir(&root)
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("PORT", port.to_string());
    let (mut events, child) = command.spawn().map_err(|error| error.to_string())?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[mcop-next] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[mcop-next] terminated: {payload:?}");
                }
                _ => {}
            }
        }
    });
    Ok(child)
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let view = view_from_args(&argv);
            let state = app.state::<RuntimeState>();
            let port = state.port.lock().ok().and_then(|value| *value);
            if let (Some(window), Some(port)) = (app.get_webview_window("main"), port) {
                let _ = navigate(&window, port, view);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main desktop window is missing".to_string())?;

            if cfg!(debug_assertions) {
                *app.state::<RuntimeState>()
                    .port
                    .lock()
                    .map_err(|_| "runtime port lock poisoned")? = Some(3000);
                let _ = window.show();
                return Ok(());
            }

            let port = reserve_loopback_port()?;
            *app.state::<RuntimeState>()
                .port
                .lock()
                .map_err(|_| "runtime port lock poisoned")? = Some(port);
            let child = spawn_server(app.handle(), port)?;
            *app.state::<RuntimeState>()
                .child
                .lock()
                .map_err(|_| "runtime child lock poisoned")? = Some(child);
            wait_for_server(port, Duration::from_secs(20))?;

            let args = std::env::args().collect::<Vec<_>>();
            navigate(&window, port, view_from_args(&args))?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut child) = window.state::<RuntimeState>().child.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build MCOP desktop runtime");

    app.run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::{view_from_args, NODE_SERVER_ENTRY};

    #[test]
    fn deep_links_select_only_product_routes() {
        assert_eq!(
            view_from_args(&["mcop://dialectical".into()]),
            "dialectical"
        );
        assert_eq!(view_from_args(&["mcop://showcase".into()]), "showcase");
        assert_eq!(view_from_args(&["mcop://unknown".into()]), "home");
    }

    #[test]
    fn node_server_entry_is_space_safe_relative() {
        assert_eq!(NODE_SERVER_ENTRY, "server.js");
        assert!(
            !NODE_SERVER_ENTRY.contains(['/', '\\', ':', ' ']),
            "sidecar entry must be a single relative basename (got {NODE_SERVER_ENTRY:?})"
        );
    }
}
