// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title Lib_PredeployAddresses
 */
library Lib_PredeployAddresses {
    // solhint-disable max-line-length
    address internal constant L2_TO_L1_MESSAGE_PASSER = 0x4200000000000000000000000000000000000000;
    address internal constant L1_MESSAGE_SENDER = 0x4200000000000000000000000000000000000001;
    address internal constant DEPLOYER_WHITELIST = 0x4200000000000000000000000000000000000002;

    // BOBA is the L2 native token
    address payable internal constant L2_BOBA = payable(0x4200000000000000000000000000000000000006);
    // L1 native token is a ERC20 token on L2
    address internal constant L1_NATIVE_TOKEN_L2_ADDRESS =
        0x4200000000000000000000000000000000000023;

    // solhint-disable-next-line max-line-length
    address internal constant L2_CROSS_DOMAIN_MESSENGER =
        0x4200000000000000000000000000000000000007;
    address internal constant LIB_ADDRESS_MANAGER = 0x4200000000000000000000000000000000000008;
    address internal constant PROXY_EOA = 0x4200000000000000000000000000000000000009;
    address internal constant L2_STANDARD_BRIDGE = 0x4200000000000000000000000000000000000010;
    address internal constant SEQUENCER_FEE_WALLET = 0x4200000000000000000000000000000000000011;
    address internal constant L2_STANDARD_TOKEN_FACTORY =
        0x4200000000000000000000000000000000000012;
    address internal constant L1_BLOCK_NUMBER = 0x4200000000000000000000000000000000000013;
    address internal constant OVM_GAS_PRICE_ORACLE = 0x420000000000000000000000000000000000000F;
    address internal constant PROXY__BOBA_TURING_PREPAY =
        0x4200000000000000000000000000000000000020;
    address internal constant BOBA_TURING_PREPAY = 0x4200000000000000000000000000000000000021;
    address internal constant BOBA_TURING_HELPER = 0x4200000000000000000000000000000000000022;
    address internal constant PROXY__BOBA_GAS_PRICE_ORACLE =
        0x4200000000000000000000000000000000000024;
    address internal constant BOBA_GAS_PRICE_ORACLE = 0x4200000000000000000000000000000000000025;
}
