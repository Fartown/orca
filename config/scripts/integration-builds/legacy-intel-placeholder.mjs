import { crc32 } from 'node:zlib'

// Integration apps built before Intel packages were dropped only treat a release as complete
// when it also lists this ZIP, so each release ships a small note under the old name.
export const LEGACY_INTEL_PLACEHOLDER = 'orca-integration-macos-x64.zip'

const README = `Intel (x64) integration builds were discontinued on 2026-09-17.
This archive is not an app. It only lets integration apps built before then
recognise the release as complete, so Apple Silicon Macs keep updating.
Install orca-integration-macos-arm64.dmg instead.
`

/** A valid ZIP holding README.txt, stored without compression. */
export function legacyIntelPlaceholder() {
  const name = Buffer.from('README.txt')
  const data = Buffer.from(README)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x21, 12)
  local.writeUInt32LE(crc32(data), 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x21, 14)
  central.writeUInt32LE(crc32(data), 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(local.length + name.length + data.length, 16)
  return Buffer.concat([local, name, data, central, name, end])
}
