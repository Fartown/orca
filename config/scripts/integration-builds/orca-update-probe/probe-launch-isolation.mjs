export function disposableHomeBootstrap({ home, profile }, destination) {
  return `;(() => {
  const expectedHome = ${JSON.stringify(home)};
  const expectedProfile = ${JSON.stringify(profile)};
  if (process.env.ORCA_E2E_HOME_DIR !== expectedHome || process.env.ORCA_E2E_USER_DATA_DIR !== expectedProfile) {
    throw new Error('P2 launch isolation does not match this signed fixture');
  }
  const before = process.env.HOME;
  process.env.HOME = expectedHome;
  process.env.USERPROFILE = expectedHome;
  require('electron').app.commandLine.appendSwitch('use-mock-keychain');
  try { require('node:fs').appendFileSync(${JSON.stringify(destination)}, JSON.stringify({ pid: process.pid, event: 'P2-home-restored', before, after: process.env.HOME, nodeHome: require('node:os').homedir(), keychain: 'P2-only mock switch' }) + '\\n'); } catch {}
})();\n`
}
