import {
  FailedRelayedMessage,
  RelayedMessage,
} from '../generated/L1CrossDomainMessenger/L1CrossDomainMessenger'
import { FastRelayedMessageEntity } from '../generated/schema'

export function handleFailedRelayedMessage(event: FailedRelayedMessage): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = FastRelayedMessageEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new FastRelayedMessageEntity(event.transaction.from.toHex())
  }

  entity.isSuccess = false
  entity.msgHash = event.params.msgHash
  entity.blockNumber = event.block.number

  entity.save()
}

export function handleRelayedMessage(event: RelayedMessage): void {
  let entity = FastRelayedMessageEntity.load(event.transaction.from.toHex())
  if (!entity) {
    entity = new FastRelayedMessageEntity(event.transaction.from.toHex())
  }

  entity.isSuccess = true
  entity.msgHash = event.params.msgHash
  entity.blockNumber = event.block.number

  entity.save()
}
