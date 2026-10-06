import { FileText, Image as ImageIcon } from 'lucide-react-native'
import { ActionSheetModal } from '../components/ActionSheetModal'
import type { AttachmentSourceSheetProps } from './use-mobile-file-attachments'

/** Photo or File, for both session inputs. Each choice closes the sheet before its picker opens. */
export function MobileAttachmentSourceSheet({
  visible,
  onPhoto,
  onFile,
  onClose
}: AttachmentSourceSheetProps): React.JSX.Element {
  return (
    <ActionSheetModal
      visible={visible}
      title="Attach"
      onClose={onClose}
      actions={[
        { label: 'Photo', icon: ImageIcon, closeBeforePress: true, onPress: onPhoto },
        { label: 'File', icon: FileText, closeBeforePress: true, onPress: onFile }
      ]}
    />
  )
}
