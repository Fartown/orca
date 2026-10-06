/** One file the user chose to attach, readable a chunk at a time so it never sits whole in memory. */
export type PickedAttachmentFile = {
  /** The picker's own name, or one built from the type when the picker gives none. */
  readonly name: string
  readonly mimeType: string | undefined
  readonly byteLength: number
  /** A URI an `<Image>` can render, when this side has one. Images only. */
  readonly previewUri?: string
  /** Base64 of consecutive `chunkBytes` slices; every slice but the last is exactly that long. */
  readBase64Chunks(chunkBytes: number): AsyncIterable<string>
  /** Drops this side's staged copy. Best effort and idempotent. */
  release(): Promise<void>
}

export type FileAttachmentPicker = {
  /** The largest file this side can stage and read. An older web-shell build stages less. */
  readonly maxBytes: number
  /** Empty when the user cancels; rejects only for a real failure. */
  pickFiles(multiple: boolean): Promise<readonly PickedAttachmentFile[]>
}

export class FileAttachmentTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super('File is too large to attach')
    this.name = 'FileAttachmentTooLargeError'
  }
}

/** The web page runs on a shell that stages less than the host accepts. */
export class FileAttachmentShellLimitError extends Error {
  constructor(readonly limitBytes: number) {
    super('This app version cannot attach a file that large')
    this.name = 'FileAttachmentShellLimitError'
  }
}

/** The paired computer predates file uploads, and the file cannot ride the image channel. */
export class FileAttachmentHostUpdateRequiredError extends Error {
  constructor() {
    super('The computer running Orca needs an update to receive files')
    this.name = 'FileAttachmentHostUpdateRequiredError'
  }
}
