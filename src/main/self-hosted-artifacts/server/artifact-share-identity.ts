// Why a module of its own: the relay probes this identity, and must not load the HTTP handler's
// main-process dependencies to do it.
export const ARTIFACT_SHARE_SERVICE_NAME = 'orca-artifact-share'
export const ARTIFACT_SHARE_PROTOCOL = 1
