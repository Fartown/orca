function assertPublisherRequirement(requirement, fingerprint) {
  const normalized = requirement.trim().replace(/^(?:#\s*)?designated\s*=>\s*/, '')
  const match =
    /^identifier "[^"\n]+" and (?:anchor|certificate root =)\s+H"([a-f0-9]{40})"$/i.exec(normalized)
  if (!match || match[1].toLowerCase() !== fingerprint.toLowerCase()) {
    throw new Error(`App requirement is not pinned to the publisher certificate: ${normalized}`)
  }
  return normalized
}

module.exports = { assertPublisherRequirement }
