import { useMemo } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { File as FsFile } from 'expo-file-system'
import type { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { discardStagedMedia, ownsStagedMediaUri } from '../platform/native-media-device'
import { createNativeFileVerbServer } from './native-file-verbs'

/** The shell's half of `native.file.pick`, minting into the session's media registry. */
export function useNativeFileVerbServer(
  registry: MediaHandleRegistry
): (params: unknown) => Promise<unknown> {
  return useMemo(
    () =>
      createNativeFileVerbServer({
        registry,
        launchFiles: (multiple) =>
          DocumentPicker.getDocumentAsync({ type: '*/*', multiple, copyToCacheDirectory: true }),
        sizeOf: (uri) => new FsFile(uri).size,
        ownsStagedUri: ownsStagedMediaUri,
        discard: discardStagedMedia
      }),
    [registry]
  )
}
