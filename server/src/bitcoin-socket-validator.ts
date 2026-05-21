export const bitcoinSocketValidatorScript = `const net = require('net');
const fs = require('fs');

const socketPath = process.argv[1];
const timeoutMs = Number(process.argv[2] || 1000);
const displayPath = process.argv[3] || socketPath;

const socket = net.createConnection({ path: socketPath });

let settled = false;

function finish(ok, message) {
  if (settled) {
    return;
  }

  settled = true;
  socket.destroy();

  if (!ok && message) {
    console.error(message);
  }

  process.exit(ok ? 0 : 1);
}

socket.setTimeout(timeoutMs + 500); // Add buffer to timeout

socket.once('connect', () => {
  socket.end();
});

socket.once('data', (chunk) => {
  const response = chunk.toString('utf8');
  if (/peer disconnected/i.test(response)) {
    finish(true);
    return;
  }
  finish(false, 'Socket responded but did not look like Bitcoin Core IPC.');
});

socket.once('timeout', () => {
  finish(
    false,
    'Timed out connecting to socket at ' +
    displayPath +
    '. Make sure Bitcoin Core is running with IPC enabled.'
  );
});

socket.once('error', (err) => {
  switch (err.code) {
    case 'ENOENT':
      finish(
        false,
        'Socket not found at ' +
        displayPath +
        '. Make sure Bitcoin Core is running with IPC enabled.'
      );
      break;

    case 'ECONNREFUSED':
      finish(
        false,
        'Socket file exists at ' +
        displayPath +
        ' but nothing is listening. Bitcoin Core may have crashed or been stopped.'
      );
      break;

    case 'EACCES':
      finish(
        false,
        'Permission denied for ' +
        displayPath +
        '. Check that the sv2-ui process can access this socket.'
      );
      break;

    case 'ENOTSOCK':
      finish(
        false,
        'Path ' + displayPath + ' is not a Unix socket.'
      );
      break;

    case 'ENOTSUP':
      finish(
        false,
        'Unix sockets are not supported for ' + displayPath
      );
      break;

    default:
      finish(
        false,
        err.message || 'Unknown error connecting to socket'
      );
  }
});

// Fallback: ensure we always exit explicitly
setTimeout(() => {
  if (!settled) {
    finish(false, 'Socket validation timed out. Make sure Bitcoin Core is running with IPC enabled.');
  }
}, timeoutMs + 2000);`;
