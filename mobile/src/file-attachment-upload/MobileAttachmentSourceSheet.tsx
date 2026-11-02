import { FileText, Image as ImageIcon } from 'lucide-react-native'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { AttachmentSourceSheetProps } from './use-mobile-file-attachments'

/** Photo or File, for both session inputs. Each choice closes the sheet before its picker opens. */
export function MobileAttachmentSourceSheet({
  visible,
  onPhoto,
  onFile,
  onClose
}: AttachmentSourceSheetProps): React.JSX.Element {
  const t = useMobileTranslation()
  return (
    <ActionSheetModal
      visible={visible}
      title={t('fileAttachmentUpload.sourceSheet.title', 'Attach')}
      onClose={onClose}
      actions={[
        {
          label: t('fileAttachmentUpload.sourceSheet.photo', 'Photo'),
          icon: ImageIcon,
          closeBeforePress: true,
          onPress: onPhoto
        },
        {
          label: t('fileAttachmentUpload.sourceSheet.file', 'File'),
          icon: FileText,
          closeBeforePress: true,
          onPress: onFile
        }
      ]}
    />
  )
}
