
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

import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { openError, openAlert } from 'actions/uiAction'

import {
  selectAccountEnabled,
  selectBobaFeeChoice,
  selectLayer,
  selectNetwork,
  selectMonster
} from 'selectors/setupSelector'

import { selectlayer2Balance } from 'selectors/balanceSelector'

import { switchFee } from 'actions/setupAction.js'
import { Typography } from '@mui/material'

import * as S from './FeeSwitcher.styles.js'
import Select from 'components/select/Select'
import Tooltip from 'components/tooltip/Tooltip.js'
import { isEqual } from 'lodash'

import BN from 'bignumber.js'
import { logAmount } from 'util/amountConvert.js'
import { HelpOutline } from '@mui/icons-material'

function FeeSwitcher() {

  const dispatch = useDispatch()
  const accountEnabled = useSelector(selectAccountEnabled())
  const feeUseBoba = useSelector(selectBobaFeeChoice())
  const network = useSelector(selectNetwork())
  const monsterNumber = useSelector(selectMonster())

  const layer = useSelector(selectLayer())

  const l2Balances = useSelector(selectlayer2Balance, isEqual)

  const l2BalanceGLMR = l2Balances.filter((i) => i.symbol === 'GLMR')
  const balanceGLMR = l2BalanceGLMR[0]

  const l2BalanceBOBA = l2Balances.filter((i) => i.symbol === 'BOBA')
  const balanceBOBA = l2BalanceBOBA[0]

  const dispatchSwitchFee = useCallback(async (targetFee) => {

    //console.log("balanceBOBA:",balanceBOBA)
    //console.log("balanceGLMR:",balanceGLMR)

    let tooSmallGLMR = false
    let tooSmallBOBA = false

    if(typeof(balanceBOBA) === 'undefined') {
      tooSmallBOBA = true
    } else {
      //check actual balance
      tooSmallBOBA = new BN(logAmount(balanceBOBA.balance, 18)).lt(new BN(1))
    }

    if(typeof(balanceGLMR) === 'undefined') {
      tooSmallGLMR = true
    } else {
      //check actual balance
      tooSmallGLMR = new BN(logAmount(balanceGLMR.balance, 18)).lt(new BN(0.5))
    }

    if (!balanceBOBA && !balanceGLMR) {
      dispatch(openError('Wallet empty - please bridge in GLMR or BOBA from L1'))
      return
    }

    let res

    if (feeUseBoba && targetFee === 'GLMR') {
      // do nothing - already set to BOBA
    }
    else if ( !feeUseBoba && targetFee === 'BOBA' ) {
      // do nothing - already set to ETH
    }
    else if ( !feeUseBoba && targetFee === 'GLMR' ) {
      // change to BOBA
      if( tooSmallBOBA ) {
        dispatch(openError(`You cannot change the fee token to BOBA since your BOBA balance is below 1 GMLR.
          If you change fee token now, you might get stuck. Please swap some BOBA for GLMR first.`))
      } else {
        res = await dispatch(switchFee(targetFee))
      }
    }
    else if (feeUseBoba && targetFee === 'BOBA') {
      // change to ETH
      if( tooSmallGLMR ) {
        dispatch(openError(`You cannot change the fee token to BOBA since your BOBA balance is below 1 BOBA.
          If you change fee token now, you might get stuck. Please swap some GLMR for BOBA first.`))
      } else {
        res = await dispatch(switchFee(targetFee))
      }
    }

    if (res) {
      dispatch(openAlert(`Successfully changed fee to ${targetFee}`))
    }

  }, [ dispatch, feeUseBoba, balanceGLMR, balanceBOBA ])

  if (!accountEnabled) {
    return null
  }

  if (layer !== 'L2') {
    return null
  }

  // enable fee switcher for everyone
  // if (network === 'mainnet' && monsterNumber < 1) {
  //   return null
  // }

  return (
    <S.FeeSwitcherWrapper>
      <Tooltip title={'BOBA or GLMR will be used across Boba according to your choice.'}>
        <HelpOutline sx={{ opacity: 0.65 }} fontSize="small" />
      </Tooltip>
      <Typography variant="body2">Fee</Typography>
      <Select
        onSelect={(e, d) => {
          dispatchSwitchFee(e.target.value)
        }}
        value={!feeUseBoba ? "BOBA" : 'GLMR'}
        options={[ {
          value: 'BOBA',
          title: 'BOBA',
        },
        {
          value: 'GLMR',
          title: 'GLMR',
        }
        ]}
      />
    </S.FeeSwitcherWrapper>
  )

}

export default FeeSwitcher
