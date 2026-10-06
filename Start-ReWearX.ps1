$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskEnv = Get-Content (Join-Path $taskRoot 'server\.env')
$taskHost = (($taskEnv | Where-Object { $_ -match '^DB_HOST=' } | Select-Object -Last 1) -split '=',2)[1].Trim().Trim('"').Trim("'")
$taskMode = (($taskEnv | Where-Object { $_ -match '^NODE_ENV=' } | Select-Object -Last 1) -split '=',2)[1].Trim()
if ($taskHost -notin @('localhost','127.0.0.1','::1') -or $taskMode -ne 'development') { throw 'This launcher is restricted to local development.' }
if (($env:DB_HOST -and $env:DB_HOST -notin @('localhost','127.0.0.1','::1')) -or ($env:NODE_ENV -and $env:NODE_ENV -ne 'development')) { throw 'Inherited environment is not local development.' }
$env:DB_SYNC = ''
if (-not $env:IMAGE_LEARNING_ENABLED) { $env:IMAGE_LEARNING_ENABLED = 'false' }
if (-not $env:IMAGE_RETRAIN_THRESHOLD) { $env:IMAGE_RETRAIN_THRESHOLD = '3' }
if (-not $env:IMAGE_MODEL_REGISTRY_DIR) { $env:IMAGE_MODEL_REGISTRY_DIR = Join-Path $taskRoot 'ai-service\feature_extraction\runtime\learning' }
$taskLogs = Join-Path $taskRoot 'artifacts\stage4_local'
New-Item -ItemType Directory -Force -Path $taskLogs,(Join-Path $taskLogs 'private\runtime-temp') | Out-Null
$env:HF_HOME = Join-Path $taskRoot 'ai-service\.cache\huggingface'
$env:HF_HUB_CACHE = Join-Path $env:HF_HOME 'hub'
$env:HUGGINGFACE_HUB_CACHE = $env:HF_HUB_CACHE
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
$env:TEMP = Join-Path $taskLogs 'private\runtime-temp'
$env:TMP = $env:TEMP
$taskNode = (Get-Command node).Source
$taskPython = Join-Path $taskRoot 'ai-service\.venv\Scripts\python.exe'
function Start-LocalService($name,$port,$executable,$arguments,$directory) {
 $tcp = [System.Net.Sockets.TcpClient]::new()
 try { $tcp.Connect('127.0.0.1',$port); Write-Output "$name port $port already listening; no duplicate started"; return } catch {} finally { $tcp.Dispose() }
 $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
 $process = Start-Process $executable -ArgumentList $arguments -WorkingDirectory (Join-Path $taskRoot $directory) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs "$name`_$stamp.log") -RedirectStandardError (Join-Path $taskLogs "$name`_$stamp`_error.log") -PassThru
 Write-Output "$name port $port launched (PID $($process.Id)); see logs for readiness"
}
Start-LocalService 'backend' 4000 $taskNode 'server.js' 'server'
Start-LocalService 'client' 3000 $taskNode 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000 --strictPort' 'client'
Start-LocalService 'admin' 3001 $taskNode 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3001 --strictPort' 'admin'
Start-LocalService 'nlp' 5000 $taskPython '-B app.py' 'ai-service'
Start-LocalService 'image' 5001 $taskPython '-B -m feature_extraction.app' 'ai-service'
