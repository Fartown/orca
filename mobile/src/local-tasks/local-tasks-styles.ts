import { StyleSheet } from 'react-native'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

/** Shared by every local-tasks screen, so the list, the detail and the forms read as one page. */
export const localTaskStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    minHeight: 44
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  backLabel: { color: colors.textPrimary, fontSize: typography.bodySize },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  topBarSpacer: { flex: 1 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButtonActive: { backgroundColor: colors.bgRaised },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  heading: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    maxWidth: 220
  },
  chipText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  chipMeta: { color: colors.textMuted, fontSize: typography.metaSize },
  segmentRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionActionText: { color: colors.textSecondary, fontSize: typography.metaSize },
  card: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    overflow: 'hidden'
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  cardRowFirst: { borderTopWidth: 0 },
  rowLabel: { color: colors.textSecondary, fontSize: typography.bodySize, width: 72 },
  rowValue: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize },
  rowValueMuted: { flex: 1, color: colors.textMuted, fontSize: typography.bodySize },
  body: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 21 },
  meta: { color: colors.textMuted, fontSize: typography.metaSize },
  mono: {
    fontFamily: typography.monoFamily,
    color: colors.textSecondary,
    fontSize: typography.metaSize
  },
  hint: { color: colors.textMuted, fontSize: typography.metaSize, lineHeight: 18 },
  attentionStale: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  input: {
    color: colors.textPrimary,
    fontSize: TEXT_INPUT_FONT_SIZE,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bareInput: { color: colors.textPrimary, fontSize: TEXT_INPUT_FONT_SIZE, padding: 0 },
  titleInput: {
    color: colors.textPrimary,
    fontSize: Math.max(TEXT_INPUT_FONT_SIZE, typography.titleSize),
    fontWeight: '700',
    padding: 0
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceBright,
    borderRadius: radii.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md
  },
  primaryButtonText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgRaised,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4
  },
  smallButtonText: { color: colors.textPrimary, fontSize: typography.metaSize },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceBright,
    alignItems: 'center',
    justifyContent: 'center'
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  noticeText: { color: colors.textSecondary, fontSize: typography.metaSize, lineHeight: 18 },
  errorText: { color: colors.statusRed, fontSize: typography.metaSize, lineHeight: 18 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md
  },
  centeredTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    textAlign: 'center'
  },
  centeredText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    lineHeight: 18,
    textAlign: 'center'
  },
  label: {
    backgroundColor: colors.bgRaised,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  labelText: { color: colors.textSecondary, fontSize: 11 },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgBase
  }
})
