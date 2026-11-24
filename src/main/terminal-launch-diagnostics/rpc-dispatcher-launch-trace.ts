import type { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { traceTerminalLaunchRpc, traceTerminalStreamingLaunchRpc } from './launch-trace'

type LaunchTracedDispatcher = Pick<RpcDispatcher, 'dispatch' | 'dispatchStreamingObjects'>

/** Records every unary and streaming entry, including rejected requests, without reshaping the dispatcher. */
export function traceTerminalLaunchRpcDispatch(dispatcher: LaunchTracedDispatcher): void {
  const dispatch = dispatcher.dispatch.bind(dispatcher)
  const dispatchStreamingObjects = dispatcher.dispatchStreamingObjects.bind(dispatcher)
  dispatcher.dispatch = (request, options) =>
    traceTerminalLaunchRpc(request, options, () => dispatch(request, options))
  // dispatchStreaming delegates here, so string and object transports are both covered.
  dispatcher.dispatchStreamingObjects = (request, reply, options) =>
    traceTerminalStreamingLaunchRpc(request, options, reply, (recordedReply) =>
      dispatchStreamingObjects(request, recordedReply, options)
    )
}
