import { createSocket } from 'node:dgram'
import { isIPv4 } from 'node:net'
import { isVirtualBridgeInterface } from '../../../shared/pairing-address-auto-selection'
import { isTailnetIPv4Address } from '../../../shared/tailnet-address'
import {
  getPairingNetworkInterfaces,
  type NetworkInterface
} from '../../runtime/pairing-network-interfaces'

function isPrivateLanIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * Source address the OS would use for off-link traffic. A UDP connect only selects a route —
 * no packet is sent — so this works without a network round trip or a child process.
 */
export function readDefaultRouteIPv4(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    const finish = (address: string | null): void => {
      socket.close()
      resolve(address)
    }
    socket.once('error', () => finish(null))
    socket.connect(53, '192.0.2.1', () => {
      try {
        finish(socket.address().address)
      } catch {
        finish(null)
      }
    })
  })
}

// Why: a VPN client (full or split tunnel) captures the probe route and hands out a private
// address peers on the office LAN cannot reach; a link must never default to it.
const TUNNEL_INTERFACE_PATTERN =
  /^(?:utun|tun|tap|ppp|ipsec|wg|gif|stf|zt|tailscale|nordlynx)|VPN|TAP-Windows|WireGuard|Wintun|ZeroTier|AnyConnect|Zscaler|WARP/i

export function isTunnelInterface(name: string): boolean {
  return TUNNEL_INTERFACE_PATTERN.test(name)
}

/**
 * LAN share links favor private addresses on physical interfaces (the probed default route first),
 * then tailnet, then private addresses behind a VPN tunnel, then anything else.
 */
export function rankArtifactShareIpCandidates(
  interfaces: readonly NetworkInterface[],
  defaultRouteAddress: string | null
): string[] {
  const rank = ({ name, address, hasDefaultRoute }: NetworkInterface): number => {
    const bridgePenalty = isVirtualBridgeInterface(name, hasDefaultRoute) ? 10 : 0
    if (isTailnetIPv4Address(address)) {
      return 2 + bridgePenalty
    }
    const tunnel = isTunnelInterface(name)
    if (isPrivateLanIPv4(address) && !tunnel) {
      return (address === defaultRouteAddress ? 0 : 1) + bridgePenalty
    }
    if (isPrivateLanIPv4(address)) {
      return 3 + bridgePenalty
    }
    return 4 + bridgePenalty
  }
  const ranked = interfaces
    .filter((entry) => isIPv4(entry.address))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => rank(left.entry) - rank(right.entry) || left.index - right.index)
    .map(({ entry }) => entry.address)
  return [...new Set(ranked)]
}

export async function listArtifactShareIpCandidates(): Promise<string[]> {
  const [interfaces, defaultRouteAddress] = await Promise.all([
    getPairingNetworkInterfaces(),
    readDefaultRouteIPv4()
  ])
  return rankArtifactShareIpCandidates(interfaces, defaultRouteAddress)
}

/** `configured` is `auto` or a pinned address; a pinned address that left the machine falls back. */
export function chooseArtifactShareIp(
  candidates: readonly string[],
  configured: string
): string | null {
  if (configured !== 'auto' && candidates.includes(configured)) {
    return configured
  }
  return candidates[0] ?? null
}
