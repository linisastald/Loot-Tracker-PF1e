/**
 * Detect the Docker host address (process.env.HOST_IP, used to build the
 * broker callback URL). Linux containers only; always returns an address.
 */
const { execSync } = require('child_process');

const FALLBACK_IP = '127.0.0.1';

// First whitespace-separated token of the command output, or '' on any failure.
const firstToken = (exec, command) => {
  try {
    return String(exec(command)).trim().split(/\s+/)[0] || '';
  } catch (_err) {
    return '';
  }
};

/**
 * @param {Function} [exec] - Runs a shell command and returns its stdout (injectable for tests)
 * @returns {string}
 */
const detectHostIp = (exec = (command) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })) =>
  firstToken(exec, 'getent hosts host.docker.internal')
  || firstToken(exec, 'hostname -i')
  || FALLBACK_IP;

module.exports = { detectHostIp };
