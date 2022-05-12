import { StateBatchAppended } from '../generated/StateCommitmentChain/StateCommitmentChain'
import { StateBatchAppendedEntity } from '../generated/schema'

export function handleStateCommitmentChain(event: StateBatchAppended): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = StateBatchAppendedEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new StateBatchAppendedEntity(event.transaction.from.toHex())
  }

  entity.batchIndex = event.params._batchIndex
  entity.batchRoot = event.params._batchRoot
  entity.batchSize = event.params._batchSize
  entity.prevTotalElements = event.params._prevTotalElements
  entity.extraData = event.params._extraData
  entity.blockNumber = event.block.number
  entity.transactionHash = event.transaction.hash

  entity.save()
}
