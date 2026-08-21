$ErrorActionPreference = "Stop"

$Project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Project

Write-Host ""
Write-Host "=== MIB Desktop Background Worker Setup ===" -ForegroundColor Cyan
Write-Host "Project: $Project" -ForegroundColor DarkGray
Write-Host ""

# Backups
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $Project ".mib-backup-$timestamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

if (Test-Path "src\App.tsx") {
    Copy-Item "src\App.tsx" (Join-Path $backupDir "App.tsx")
}
if (Test-Path "src-tauri\src\main.rs") {
    Copy-Item "src-tauri\src\main.rs" (Join-Path $backupDir "main.rs")
}

Write-Host "Backup created: $backupDir" -ForegroundColor Green

# Install official Tauri autostart plugin.
Write-Host ""
Write-Host "Installing Tauri autostart plugin..." -ForegroundColor Cyan
npm install @tauri-apps/plugin-autostart
if ($LASTEXITCODE -ne 0) { throw "npm install @tauri-apps/plugin-autostart failed." }

# Add autostart plugin to Tauri project/capabilities.
Write-Host "Adding autostart plugin to Tauri..." -ForegroundColor Cyan
npm run tauri add autostart
if ($LASTEXITCODE -ne 0) {
    Write-Host "Automatic tauri add failed. Falling back to Cargo..." -ForegroundColor Yellow
    Push-Location "src-tauri"
    cargo add tauri-plugin-autostart --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Could not add tauri-plugin-autostart." }
    Pop-Location
}

Write-Host "Adding single-instance protection..." -ForegroundColor Cyan
npm run tauri add single-instance
if ($LASTEXITCODE -ne 0) {
    Write-Host "Automatic tauri add failed. Falling back to Cargo..." -ForegroundColor Yellow
    Push-Location "src-tauri"
    cargo add tauri-plugin-single-instance --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Could not add tauri-plugin-single-instance." }
    Pop-Location
}

# Ensure the Tauri tray feature is enabled without replacing the existing dependency version.
Write-Host "Enabling Tauri tray feature..." -ForegroundColor Cyan
$cargoTomlPath = Join-Path $Project "src-tauri\Cargo.toml"
$cargoText = Get-Content $cargoTomlPath -Raw

if ($cargoText -match '(?m)^tauri\s*=\s*\{[^\r\n]*\}') {
    $oldLine = [regex]::Match($cargoText, '(?m)^tauri\s*=\s*\{[^\r\n]*\}').Value
    $newLine = $oldLine

    if ($oldLine -notmatch 'features\s*=') {
        $newLine = $oldLine -replace '\}\s*$', ', features = ["tray-icon"] }'
    }
    elseif ($oldLine -notmatch '"tray-icon"') {
        $newLine = $oldLine -replace 'features\s*=\s*\[', 'features = ["tray-icon", '
    }

    $cargoText = $cargoText.Replace($oldLine, $newLine)
    Set-Content -Path $cargoTomlPath -Value $cargoText -Encoding UTF8
}
else {
    Push-Location "src-tauri"
    cargo add tauri --features tray-icon
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Could not enable Tauri tray feature." }
    Pop-Location
}

# Full App.tsx
$app = @'
import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

const WORKER_NAME = "MIB Desktop";

type Job = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
};

function App() {
  const [status, setStatus] = useState("Connecting...");
  const [workerId, setWorkerId] = useState("");
  const [lastHeartbeat, setLastHeartbeat] = useState("");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobsReceived, setJobsReceived] = useState(0);
  const [error, setError] = useState("");
  const currentJobRef = useRef<Job | null>(null);

  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let jobTimer: ReturnType<typeof setInterval> | null = null;

    async function startWorker() {
      try {
        setStatus("Signing in...");
        setError("");

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const { data, error: signInError } =
            await supabase.auth.signInAnonymously();

          if (signInError) {
            throw signInError;
          }

          session = data.session;
        }

        if (!session?.user?.id) {
          throw new Error("Desktop worker authentication failed.");
        }

        const userId = session.user.id;

        setStatus("Registering desktop...");

        const { data: existingWorker, error: findError } =
          await supabase
            .from("desktop_workers")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (findError) {
          throw findError;
        }

        let currentWorkerId = existingWorker?.id;

        if (!currentWorkerId) {
          const { data: newWorker, error: insertError } =
            await supabase
              .from("desktop_workers")
              .insert({
                user_id: userId,
                worker_name: WORKER_NAME,
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .select("id")
              .single();

          if (insertError) {
            throw insertError;
          }

          currentWorkerId = newWorker.id;
        } else {
          const { error: updateError } =
            await supabase
              .from("desktop_workers")
              .update({
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .eq("id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        setWorkerId(currentWorkerId);
        setStatus("Online");
        setLastHeartbeat(new Date().toLocaleTimeString());

        async function finishJob(
          job: Job,
          status: "completed" | "failed",
          errorMessage: string | null = null
        ) {
          const updatePayload: Record<string, unknown> = {
            status,
            completed_at: new Date().toISOString(),
          };

          if (errorMessage) {
            updatePayload.error = errorMessage;
          }

          const { error: updateError } =
            await supabase
              .from("desktop_jobs")
              .update(updatePayload)
              .eq("id", job.id)
              .eq("worker_id", currentWorkerId);

          if (updateError) {
            throw updateError;
          }
        }

        async function executeJob(job: Job) {
          try {
            console.log("MIB Desktop executing background job:", job);

            switch (job.job_type) {
              case "background_test":
              case "test_job":
                // Development-only handlers. These prove the background
                // worker can claim, execute and finish jobs without the UI.
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await finishJob(job, "completed");
                break;

              default:
                // Never leave an unsupported job stuck in processing.
                await finishJob(
                  job,
                  "failed",
                  `No desktop handler registered for job_type: ${job.job_type}`
                );
                break;
            }

            currentJobRef.current = null;
            setCurrentJob(null);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "Unknown desktop job error.";

            console.error("MIB Desktop job failed:", message);

            try {
              await finishJob(job, "failed", message);
            } catch (finishError) {
              console.error(
                "MIB Desktop could not record job failure:",
                finishError
              );
            }

            currentJobRef.current = null;
            setCurrentJob(null);
            setError(message);
          }
        }

        async function heartbeat() {
          const { error: heartbeatError } =
            await supabase
              .from("desktop_workers")
              .update({
                status: "online",
                last_seen: new Date().toISOString(),
              })
              .eq("id", currentWorkerId);

          if (heartbeatError) {
            console.error("Worker heartbeat error:", heartbeatError);
            setStatus("Connection problem");
            setError(heartbeatError.message);
            return;
          }

          setStatus("Online");
          setLastHeartbeat(new Date().toLocaleTimeString());
        }

        async function checkForJob() {
          if (currentJobRef.current !== null) {
            return;
          }

          const { data, error: jobError } =
            await supabase.rpc("claim_next_desktop_job", {
              p_worker_id: currentWorkerId,
            });

          if (jobError) {
            console.error("Job check error:", jobError);
            setError(jobError.message);
            return;
          }

          if (!data || data.length === 0) {
            return;
          }

          const receivedJob = data[0] as Job;

          console.log("MIB Desktop received job:", receivedJob);

          currentJobRef.current = receivedJob;
          setCurrentJob(receivedJob);
          setJobsReceived((count) => count + 1);

          await executeJob(receivedJob);
        }

        heartbeatTimer = setInterval(heartbeat, 30000);
        jobTimer = setInterval(checkForJob, 5000);

        await checkForJob();
      } catch (err) {
        console.error("Desktop worker startup error:", err);

        setStatus("Connection failed");

        setError(
          err instanceof Error ? err.message : "Unknown worker error."
        );
      }
    }

    startWorker();

    return () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      if (jobTimer) {
        clearInterval(jobTimer);
      }
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        padding: "40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "650px",
          background: "#1e293b",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "700",
            marginBottom: "8px",
          }}
        >
          MIB Desktop
        </h1>

        <p
          style={{
            color: "#94a3b8",
            marginBottom: "30px",
          }}
        >
          Background Worker
        </p>

        <div
          style={{
            background: "#0f172a",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "8px",
            }}
          >
            Worker Status
          </div>

          <div
            style={{
              fontSize: "22px",
              fontWeight: "600",
              color:
                status === "Online"
                  ? "#22c55e"
                  : status === "Connection failed" ||
                    status === "Connection problem"
                  ? "#ef4444"
                  : "#facc15",
            }}
          >
            {status === "Online" && "🟢 "}
            {status === "Connection failed" && "🔴 "}
            {status === "Connection problem" && "🔴 "}
            {status !== "Online" &&
              status !== "Connection failed" &&
              status !== "Connection problem" &&
              "🟡 "}
            {status}
          </div>

          {workerId && (
            <div
              style={{
                marginTop: "20px",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              Worker ID
              <div
                style={{
                  color: "#e2e8f0",
                  marginTop: "4px",
                  wordBreak: "break-all",
                }}
              >
                {workerId}
              </div>
            </div>
          )}

          {lastHeartbeat && (
            <div
              style={{
                marginTop: "14px",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              Last heartbeat:{" "}
              <span style={{ color: "#e2e8f0" }}>
                {lastHeartbeat}
              </span>
            </div>
          )}

          <div
            style={{
              marginTop: "14px",
              fontSize: "13px",
              color: "#94a3b8",
            }}
          >
            Jobs received:{" "}
            <span style={{ color: "#e2e8f0" }}>
              {jobsReceived}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            background: "#0f172a",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "12px",
            }}
          >
            Current Job
          </div>

          {currentJob ? (
            <>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#60a5fa",
                }}
              >
                ⚙️ {currentJob.job_type}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#94a3b8",
                  wordBreak: "break-all",
                }}
              >
                Job ID: {currentJob.id}
              </div>

              <pre
                style={{
                  marginTop: "14px",
                  padding: "12px",
                  background: "#1e293b",
                  borderRadius: "8px",
                  color: "#cbd5e1",
                  fontSize: "12px",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(currentJob.payload, null, 2)}
              </pre>

              <div
                style={{
                  marginTop: "14px",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                Worker is processing this job in the background.
              </div>
            </>
          ) : (
            <div
              style={{
                color: "#64748b",
                fontSize: "15px",
              }}
            >
              ⏳ Waiting for jobs...
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: "20px",
              padding: "12px",
              background: "#450a0a",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "14px",
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: "20px",
            color: "#64748b",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          MIB Desktop keeps running from the Windows system tray.
        </div>
      </div>
    </main>
  );
}

export default App;
'@

Set-Content -Path "src\App.tsx" -Value $app -Encoding UTF8

# Full Tauri background entrypoint.
# Tauri v2 projects may use src-tauri/src/lib.rs or src-tauri/src/main.rs.
$rustCode = @'
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
'@

if (Test-Path "src-tauri\src\lib.rs") {
    # Tauri v2's default structure normally uses lib.rs as the app entrypoint.
    Set-Content -Path "src-tauri\src\lib.rs" -Value $rustCode -Encoding UTF8
    Write-Host "Updated src-tauri\src\lib.rs" -ForegroundColor Green
}
else {
    $mainCode = @'
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_background;

fn main() {
    app_background::run();
}
'@
    Set-Content -Path "src-tauri\src\app_background.rs" -Value $rustCode -Encoding UTF8
    Set-Content -Path "src-tauri\src\main.rs" -Value $mainCode -Encoding UTF8
    Write-Host "Updated src-tauri\src\main.rs + app_background.rs" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed. Backup is at $backupDir"
}

Write-Host ""
Write-Host "Checking Rust/Tauri..." -ForegroundColor Cyan
Push-Location "src-tauri"
cargo check
$rustExit = $LASTEXITCODE
Pop-Location

if ($rustExit -ne 0) {
    throw "Rust/Tauri check failed. Backup is at $backupDir"
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "MIB Desktop background worker setup COMPLETE." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Features:" -ForegroundColor Cyan
Write-Host "  - System tray"
Write-Host "  - Close button hides instead of exiting"
Write-Host "  - Release build starts hidden"
Write-Host "  - Release build enables Windows autostart"
Write-Host "  - Supabase heartbeat continues"
Write-Host "  - Supabase job polling continues"
Write-Host "  - Existing worker/job architecture preserved"
Write-Host ""
Write-Host "Run:" -ForegroundColor Cyan
Write-Host "  npm run tauri dev"
Write-Host ""
