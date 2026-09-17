import { describe, expect, it } from 'vitest'
import {
  chooseArtifactShareIp,
  isTunnelInterface,
  rankArtifactShareIpCandidates
} from './artifact-share-lan-ip'

describe('artifact share link address', () => {
  it('ignores a VPN tunnel that captured the default route probe', () => {
    // Shape seen on a developer Mac: a full-tunnel VPN routes every public probe through utun4.
    const interfaces = [
      { name: 'en0', address: '192.168.1.20' },
      { name: 'en1', address: '10.0.0.20' },
      { name: 'utun4', address: '10.200.0.5' }
    ]

    expect(rankArtifactShareIpCandidates(interfaces, '10.200.0.5')).toEqual([
      '192.168.1.20',
      '10.0.0.20',
      '10.200.0.5'
    ])
  })

  it('prefers the probed default route among physical interfaces', () => {
    const interfaces = [
      { name: 'en0', address: '192.168.1.20' },
      { name: 'en7', address: '10.0.0.8' }
    ]

    expect(rankArtifactShareIpCandidates(interfaces, '10.0.0.8')).toEqual([
      '10.0.0.8',
      '192.168.1.20'
    ])
  })

  it('ranks tailnet after the LAN, bridges and public addresses last', () => {
    const interfaces = [
      { name: 'utun3', address: '100.101.102.103' },
      { name: 'docker0', address: '172.17.0.1' },
      { name: 'en0', address: '203.0.113.9' },
      { name: 'en1', address: '192.168.50.2' },
      { name: 'en1', address: 'fe80::1' }
    ]

    expect(rankArtifactShareIpCandidates(interfaces, null)).toEqual([
      '192.168.50.2',
      '100.101.102.103',
      '203.0.113.9',
      '172.17.0.1'
    ])
  })

  it('recognizes VPN adapters on macOS, Linux and Windows', () => {
    for (const name of [
      'utun4',
      'tun0',
      'wg0',
      'ppp0',
      'OpenVPN TAP-Windows6',
      'WireGuard Tunnel'
    ]) {
      expect(isTunnelInterface(name)).toBe(true)
    }
    for (const name of ['en0', 'eth0', 'wlan0', 'Ethernet 2', 'Wi-Fi']) {
      expect(isTunnelInterface(name)).toBe(false)
    }
  })

  it('keeps a pinned address only while this computer still has it', () => {
    const candidates = ['192.168.1.20', '10.0.0.20']

    expect(chooseArtifactShareIp(candidates, '10.0.0.20')).toBe('10.0.0.20')
    expect(chooseArtifactShareIp(candidates, '10.9.9.9')).toBe('192.168.1.20')
    expect(chooseArtifactShareIp(candidates, 'auto')).toBe('192.168.1.20')
    expect(chooseArtifactShareIp([], 'auto')).toBeNull()
  })
})
