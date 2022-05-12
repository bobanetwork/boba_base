import { StateBatchAppended } from '../generated/StateCommitmentChain/StateCommitmentChain'
import { StateBatchAppendedEntity } from '../generated/schema'

export function handleStateCommitmentChain(event: StateBatchAppended): void {

  const id = event.transaction.hash.toHex()
  const entity = new StateBatchAppendedEntity(id)
  entity.id = id
  entity.batchIndex = event.params._batchIndex
  entity.batchRoot = event.params._batchRoot
  entity.batchSize = event.params._batchSize
  entity.prevTotalElements = event.params._prevTotalElements
  entity.extraData = event.params._extraData
  entity.blockNumber = event.block.number
  entity.transactionHash = event.transaction.hash

  entity.save()
}
