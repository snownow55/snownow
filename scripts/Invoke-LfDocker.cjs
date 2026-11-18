// Package helper. No network or image pulls; Docker receives UTF-8/LF shell bytes.
'use strict';
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] !== 'run' || !args.includes('--pull=never') || !args.includes('--read-only') ||
    args[args.indexOf('--network') + 1] !== 'none' ||
    args.includes('-p') || args.includes('--publish') || args.includes('--privileged')) {
  console.log(JSON.stringify({code:'OFFLINE_DOCKER_ARGUMENTS_REQUIRED'}));
  process.exitCode = 1;
} else {
  const program = fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd() + '\n';
  const result = spawnSync('docker', args, {input:Buffer.from(program, 'utf8'), encoding:'utf8', windowsHide:true, timeout:180000, maxBuffer:8*1024*1024});
  if (result.error || result.status !== 0) {
    console.log(JSON.stringify({code:'OFFLINE_GIT_IMPORT_FAILED',exit_code:result.status,process_error:result.error?.code || null}));
    process.exitCode = 1;
  } else process.stdout.write(result.stdout || '');
}
