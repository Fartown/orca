import { useState } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

/**
 * A multiline input as tall as its text. Why the measured height: a browser textarea keeps its first
 * height, so a long title showed one line and a half and hid the rest.
 */
export function LocalTaskGrowingInput(props: TextInputProps & { minHeight: number }) {
  const { minHeight, style, onContentSizeChange, ...rest } = props
  const [height, setHeight] = useState(minHeight)
  return (
    <TextInput
      {...rest}
      multiline
      scrollEnabled={false}
      style={[style, { minHeight, height: Math.max(minHeight, height) }]}
      onContentSizeChange={(event) => {
        setHeight(Math.ceil(event.nativeEvent.contentSize.height))
        onContentSizeChange?.(event)
      }}
    />
  )
}
