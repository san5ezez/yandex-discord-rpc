const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

// Автозапуск Windows может оставить старый bridge-процесс.
// Завершаем только node-процессы, в командной строке которых есть именно server.js.
if (process.platform === 'win32') {
  const scriptPath = path.join(__dirname, 'server.js').replace(/\\/g, '\\\\');
  const command = `$rows = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\"; ` +
    `foreach ($row in $rows) { if ($row.CommandLine -like '*${scriptPath}*' -or $row.CommandLine -like '*server.js*') { ` +
    `if ($row.ProcessId -ne ${process.pid}) { Stop-Process -Id $row.ProcessId -Force -ErrorAction SilentlyContinue } } }`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { stdio: 'ignore' });
  } catch {
    // Если старого процесса нет, продолжаем обычный запуск.
  }
}

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
