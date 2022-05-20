/*
Copyright 2019-present OmiseGO Pte Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

import networkService from 'services/networkService'
import { createAction } from './createAction'

export function fetchBalances() {
  return createAction('BALANCE/GET', () => networkService.getBalances())
}

export function fetchGas() {
  return createAction('GAS/GET', () => networkService.getGas())
}

export function addTokenList() {
  console.log("addTokenList")
  return createAction('TOKENLIST/GET', () => networkService.addTokenList())
}

export function fetchTransactions() {
  return createAction('TRANSACTION/GETALL', () =>
    networkService.getTransactions()
  )
}

export function fetchSevens() {
  return createAction('SEVENS/GETALL', () =>
    networkService.getSevens()
  )
}

export function fetchExits() {
  return createAction('EXIT/GETALL', () => networkService.getExits())
}

export function exitBOBA(token, value) {
  return createAction('EXIT/CREATE', () =>
    networkService.exitBOBA(token, value)
  )
}

//CLASSIC DEPOSIT ETH
export function depositETHL2(value) {
  return createAction('DEPOSIT/CREATE', () => {
    return networkService.depositETHL2(value)
  }
  )
}

//DEPOSIT ERC20
export function depositErc20(value, currency, currencyL2) {
  return createAction('DEPOSIT/CREATE', () =>
    networkService.depositErc20(value, currency, currencyL2)
  )
}

export function approveERC20(
  value,
  currency,
  approveContractAddress,
  contractABI
) {
  return createAction('APPROVE/CREATE', () =>
    networkService.approveERC20(
      value,
      currency,
      approveContractAddress,
      contractABI
    )
  )
}

export function approveERC20_L2LP(
  value,
  currency,
) {
  return createAction('APPROVE/CREATE', () =>
    networkService.approveERC20_L2LP(
      value,
      currency,
    )
  )
}

export function approveERC20_L1LP(
  value,
  currency,
) {
  return createAction('APPROVE/CREATE', () =>
    networkService.approveERC20_L1LP(
      value,
      currency,
    )
  )
}

export function transfer(recipient, value, currency) {
  return createAction('TRANSFER/CREATE', () =>
    networkService.transfer(recipient, value, currency)
  )
}

export function transferEstimate(value_Wei_String, currency) {
  return createAction('TRANSFER_ESTIMATE/CREATE', () =>
    networkService.transferEstimate(value_Wei_String, currency)
  )
}

export function fetchLookUpPrice(params) {
  return createAction('PRICE/GET', () =>
    networkService.fetchLookUpPrice(params))
}

export function enableBrowserWallet(network) {
  return createAction('ENABLE/BROWSER/WALLET', () => networkService.enableBrowserWallet(network))
}

export function getAllAddresses() {
  return createAction('GET/ALL/ADDRESS', () => networkService.getAllAddresses())
}
