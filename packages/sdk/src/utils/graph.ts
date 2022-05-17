import { ethers } from 'ethers'
import fetch from 'node-fetch'

export const WHITELIST_CHAIN_ID: Array<number> = [1287, 1284]

export const GRAPH_API_URL: any = {
  1287: {
    rollup:
      'https://api.thegraph.com/subgraphs/name/bobanetwork/bobabase-rollup',
    // The process of syncing Lib_addressManager is super slow
    addressManager:
      'https://api.thegraph.com/subgraphs/name/bobanetwork/bobabase-address-manager',
  },
  1284: {
    rollup:
      'https://api.thegraph.com/subgraphs/name/bobanetwork/bobabeam-rollup',
    // The process of syncing Lib_addressManager is super slow
    addressManager:
      'https://api.thegraph.com/subgraphs/name/bobanetwork/bobabeam-address-manager',
  },
}

const intToBigNumber = (value: any): ethers.BigNumber => {
  return ethers.BigNumber.from(value)
}

const intToHex = (value: any): string => {
  return ethers.utils.hexlify(value)
}

const formatStateBatchAppendedEvent = (events: any): any => {
  // eslint-disable-next-line
  for (var i = 0; i < events.length; i++) {
    events[i]._batchIndex = intToBigNumber(events[i]._batchIndex)
    events[i]._batchSize = intToBigNumber(events[i]._batchSize)
    events[i]._prevTotalElements = intToBigNumber(events[i]._prevTotalElements)
    events[i].blockNumber = intToHex(intToBigNumber(events[i].blockNumber))
  }
  return events
}

const formatAddressSetEvent = (events: any): any => {
  // eslint-disable-next-line
  for (var i = 0; i < events.length; i++) {
    events[i].blockNumber = parseInt(events[i].blockNumber, 10)
  }
  return events
}

const addArgs = (events: any): any => {
  // eslint-disable-next-line
  for (var i = 0; i < events.length; i++) {
    events[i].args = { ...events[i] }
  }
  return events
}

const addEventMethods = (
  events: ethers.Event[],
  provider: ethers.providers.Provider
): ethers.Event[] => {
  // eslint-disable-next-line
  for (var i = 0; i < events.length; i++) {
    const event = events[i]
    events[i].getTransactionReceipt = async () => {
      const receipt = await provider.getTransactionReceipt(
        event.transactionHash
      )
      return receipt
    }
    events[i].getTransaction = async () => {
      const transaction = await provider.getTransaction(event.transactionHash)
      return transaction
    }
  }
  return events
}

export const getStateBatchAppendedEventByBatchIndexFromGraph = async (
  provider: ethers.providers.Provider,
  batchIndex: number
): Promise<ethers.Event[] | []> => {
  const chainID = (await provider.getNetwork()).chainId
  if (!GRAPH_API_URL[chainID]) {
    return []
  }
  const response = await fetch(GRAPH_API_URL[chainID].rollup, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query {
          stateBatchAppendedEntities(where: {
            _batchIndex: "${batchIndex}"
          }) {
            _batchIndex
            _batchRoot
            _batchSize
            _prevTotalElements
            _extraData
            transactionHash
            blockNumber
          }
        }
      `,
    }),
  })
  const data = await response.json()
  if (typeof data.data === 'undefined') {
    return []
  }
  let entity = formatStateBatchAppendedEvent(
    data.data.stateBatchAppendedEntities
  )
  if (entity.length === 0) {
    return []
  }
  entity = formatStateBatchAppendedEvent(data.data.stateBatchAppendedEntities)
  const events: ethers.Event[] = addEventMethods(addArgs(entity), provider)
  return events
}

export const getRelayedMessageEventsFromGraph = async (
  provider: ethers.providers.Provider,
  messageHash: string,
  fast: boolean
): Promise<ethers.Event[] | []> => {
  const chainID = (await provider.getNetwork()).chainId
  if (!GRAPH_API_URL[chainID]) {
    return []
  }
  const response = await fetch(GRAPH_API_URL[chainID].rollup, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query {
          ${
            fast ? 'relayedMessageFastEntities' : 'relayedMessageEntities'
          }(where: {
            msgHash: "${messageHash}"
          }) {
            msgHash
            transactionHash
            blockNumber
          }
        }
      `,
    }),
  })
  const data = await response.json()
  if (typeof data.data === 'undefined') {
    return []
  }
  let entity: any
  if (fast) {
    entity = data.data.fastRelayedMessageEntities
  } else {
    entity = data.data.relayedMessageEntities
  }
  if (entity.length === 0) {
    return []
  }
  const events: ethers.Event[] = addEventMethods(addArgs(entity), provider)
  return events
}

export const getFailedRelayedMessageEventsFromGraph = async (
  provider: ethers.providers.Provider,
  messageHash: string,
  fast: boolean
): Promise<ethers.Event[] | []> => {
  const chainID = (await provider.getNetwork()).chainId
  if (!GRAPH_API_URL[chainID]) {
    return []
  }
  const response = await fetch(GRAPH_API_URL[chainID].rollup, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query {
          ${
            fast
              ? 'failedRelayedMessageFastEntities'
              : 'failedRelayedMessageEntities'
          }(where: {
            msgHash: "${messageHash}"
          }) {
            msgHash
            transactionHash
            blockNumber
          }
        }
      `,
    }),
  })
  const data = await response.json()
  if (typeof data.data === 'undefined') {
    return []
  }
  let entity: any
  if (fast) {
    entity = data.data.fastRelayedMessageEntities
  } else {
    entity = data.data.relayedMessageEntities
  }
  if (entity.length === 0) {
    return []
  }
  const events: ethers.Event[] = addEventMethods(addArgs(entity), provider)
  return events
}

export const getAddressSetEventsFromGraph = async (
  provider: ethers.providers.Provider,
  name: string,
  fromBlock?: number,
  toBlock?: number
) => {
  const chainID = (await provider.getNetwork()).chainId
  if (!GRAPH_API_URL[chainID]) {
    return []
  }
  const response = await fetch(GRAPH_API_URL[chainID].addressManager, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query { addressSetEntities
          (
            orderBy: blockNumber
            orderDirection: desc
            first: 1
            where: {
              _name: "${name}"
              ${fromBlock != null ? `blockNumber_gte: ${fromBlock}` : ''}
              ${toBlock != null ? `blockNumber_lte: ${toBlock}` : ''}
            }
          )
          {
            _name
            _newAddress
            _oldAddress
            blockNumber
            transactionHash
          }
        }
      `,
    }),
  })
  const data = await response.json()
  if (typeof data.data === 'undefined') {
    return []
  }
  const entity = formatAddressSetEvent(data.data.addressSetEntities)
  if (entity.length === 0) {
    return []
  }
  const events: ethers.Event[] = addEventMethods(addArgs(entity), provider)
  return events
}

export const isChainIDForGraph = async (
  provider: ethers.providers.Provider
) => {
  const chainID = (await provider.getNetwork()).chainId
  return WHITELIST_CHAIN_ID.includes(chainID)
}
