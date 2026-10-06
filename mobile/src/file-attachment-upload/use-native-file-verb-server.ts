import { useMemo } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { File as FsFile } from 'expo-file-system'
import { useMediaHandleRegistry } from '../mobile-web-shell/use-media-handle-registry'
import { discardStagedMedia, ownsStagedMediaUri } from '../platform/native-media-device'
import type { BridgeFileVerb } from './bridge-file-verbs'
import { createNativeFileVerbServer } from './native-file-verbs'

/** The shell's half of `native.file.*`, scoped to one page session like the media verbs. */
export function useNativeFileVerbServer(
  sessionId: string | null
): (verb: BridgeFileVerb, params: unknown) => Promise<unknown> {
  const registry = useMediaHandleRegistry({ sessionId, discard: discardStagedMedia })
  return useMemo(
    () =>
      createNativeFileVerbServer({
        registry,
        launchFiles: (multiple) =>
          DocumentPicker.getDocumentAsync({ type: '*/*', multiple, copyToCacheDirectory: true }),
        sizeOf: (uri) => new FsFile(uri).size,
        open: (uri) => new FsFile(uri).open(),
        ownsStagedUri: ownsStagedMediaUri,
        discard: discardStagedMedia
      }),
    [registry]
  )
}
