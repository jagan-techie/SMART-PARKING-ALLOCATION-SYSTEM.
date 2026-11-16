# ==============================================================================
# Smart College Parking Space Allocation Optimization System
# Single-File Dependency Installer, Dataset Generator, Test Runner & Launcher
# ==============================================================================
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

# ------------------------------------------------------------------------------
# 1. All Backend Python Dependencies (single list)
# ------------------------------------------------------------------------------
$PythonDependencies = @(
    "Flask==3.1.2",
    "numpy==2.2.6",
    "pandas==3.0.2",
    "scipy==1.17.1",
    "SQLAlchemy==2.1.8",
    "pytest==9.2.0"
)

# ------------------------------------------------------------------------------
# 2. All Frontend Node.js Dependencies (single list)
# ------------------------------------------------------------------------------
$NpmDependencies = @(
    "axios@^1.7.7",
    "chart.js@^4.4.6",
    "lucide-react@^0.460.0",
    "react@^18.3.1",
    "react-chartjs-2@^5.2.0",
    "react-dom@^18.3.1"
)

$NpmDevDependencies = @(
    "@vitejs/plugin-react@^4.3.3",
    "autoprefixer@^10.4.20",
    "postcss@^8.4.49",
    "tailwindcss@^3.4.15",
    "vite@^5.4.11"
)

Write-Host "`n[1/5] Setting up Python virtual environment and installing backend dependencies..." -ForegroundColor Cyan
Set-Location $BackendDir
if (-not (Test-Path "venv")) {
    python -m venv --system-site-packages venv
}
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"
$PipExe = Join-Path $BackendDir "venv\Scripts\pip.exe"

& $PipExe install @PythonDependencies

Write-Host "`n[2/5] Generating synthetic datasets (seed=42)..." -ForegroundColor Cyan
& $PythonExe "dataset\generate_dataset.py"

Write-Host "`n[3/5] Running Operations Research & API validation tests..." -ForegroundColor Cyan
& $PythonExe -m pytest -v "tests\test_optimization.py"

Write-Host "`n[4/5] Installing frontend Node.js dependencies ($($NpmDependencies.Count + $NpmDevDependencies.Count) packages)..." -ForegroundColor Cyan
Set-Location $FrontendDir
npm install

Write-Host "`n[5/5] Starting Flask Backend (port 5000) and Vite Frontend (port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BackendDir'; & '$PythonExe' app.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$FrontendDir'; npm run dev"
Set-Location $RootDir

Write-Host "`nBoth servers launched!" -ForegroundColor Green
Write-Host "Frontend Dashboard : http://localhost:5173"
Write-Host "Backend Flask API  : http://127.0.0.1:5000/api/health"

