// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/* Library Imports */
import { Lib_PredeployAddresses } from "../../libraries/constants/Lib_PredeployAddresses.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/* Contract Imports */
import { L2StandardBridge } from "../messaging/L2StandardBridge.sol";
import { L2_L1NativeToken } from "./L2_L1NativeToken.sol";
import { OVM_GasPriceOracle } from "./OVM_GasPriceOracle.sol";


/* Contract Imports */
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Boba_GasPriceOracle
 */
contract Boba_GasPriceOracle {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /*************
     * Constants *
     *************/

    // Minimum BOBA balance that can be withdrawn in a single withdrawal.
    uint256 public constant MIN_WITHDRAWAL_AMOUNT = 10e18;

    /*************
     * Variables *
     *************/

    // Owner address
    address private _owner;

    // Address that will hold the fees once withdrawn. Dynamically initialized within l2geth.
    address public feeWallet;

    // L1 native token token L2 address
    address public l1NativeTokenL2Address = Lib_PredeployAddresses.L1_NATIVE_TOKEN_L2_ADDRESS;

    // The maximum price ratio of BOBA and BOBA
    uint256 public maxPriceRatio = 5000;

    // The minimum price ratio of native token and BOBA
    uint256 public minPriceRatio = 500;

    // The price ratio of native token and BOBA
    // This price ratio considers the saving percentage of using BOBA as the fee token
    uint256 public priceRatio;

    // Gas price oracle address
    address public gasPriceOracleAddress = 0x420000000000000000000000000000000000000F;

    // Record the wallet address that wants to use boba as fee token
    mapping(address => bool) public l1NativeTokenFeeTokenUsers;

    // swap fee for the meta transaction
    uint256 public metaTransactionFee = 1e15;

    // Received BOBA amount for the swap 2 BOBA
    uint256 public receivedBOBAAmount = 2e18;

    // Price ratio without discount
    uint256 public marketPriceRatio;

    // Need to consider which token price is higher
    // If boba price is higher, then price ratio = boba price / native token price
    // If native token price is higher, then price ratio = native token price / boba price
    // We can add decimals to the price ratio to avoid rounding errors
    bool public isBobaTokenPriceHigh = false;

    // Decimals of the price ratio
    uint256 public decimals = 0;

    // 10 ** decimals
    uint256 public multiplier = 10 ** decimals;

    /*************
     *  Events   *
     *************/

    event TransferOwnership(address, address);
    event UseBobaAsFeeToken(address);
    event SwapBOBAForETHMetaTransaction(address);
    event UseL1NativeTokenAsFeeToken(address);
    event UpdatePriceRatio(address, uint256, uint256, bool);
    event UpdateMaxPriceRatio(address, uint256);
    event UpdateMinPriceRatio(address, uint256);
    event UpdateGasPriceOracleAddress(address, address);
    event UpdateMetaTransactionFee(address, uint256);
    event UpdateReceivedBOBAAmount(address, uint256);
    event UpdateDecimals(address, uint256);
    event WithdrawBOBA(address, address);
    event WithdrawL1NativeToken(address, address);

    /**********************
     * Function Modifiers *
     **********************/

    modifier onlyNotInitialized() {
        require(address(feeWallet) == address(0), "Contract has been initialized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "caller is not the owner");
        _;
    }

    /********************
     * Fall back Functions *
     ********************/

    /**
     * Receive ETH
     */
    receive() external payable {}

    /********************
     * Public Functions *
     ********************/

    /**
     * transfer ownership
     * @param _newOwner new owner address
     */
    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "Ownable: new owner is the zero address");
        address oldOwner = _owner;
        _owner = _newOwner;
        emit TransferOwnership(oldOwner, _newOwner);
    }

    /**
     * Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * Initialize feeWallet and l2BobaAddress.
     */
    function initialize(address payable _feeWallet, address _l2BobaAddress)
        public
        onlyNotInitialized
    {
        require(_feeWallet != address(0) && _l2BobaAddress != address(0));
        feeWallet = _feeWallet;
        l1NativeTokenL2Address = _l2BobaAddress;

        // Initialize the parameters
        _owner = msg.sender;
        gasPriceOracleAddress = 0x420000000000000000000000000000000000000F;
        metaTransactionFee = 3e15;
        maxPriceRatio = 5000;
        priceRatio = 2000;
        minPriceRatio = 500;
        marketPriceRatio = 2000;
        isBobaTokenPriceHigh = false;
        decimals = 0;
        multiplier = 10 ** decimals;
    }

    /**
     * Add the users that want to use BOBA as the fee token
     */
    function useBobaAsFeeToken() public {
        require(!Address.isContract(msg.sender), "Account not EOA");
        // Users should have more than 3 BOBA
        require(address(msg.sender).balance >= 3e18, "Insufficient BOBA balance");
        l1NativeTokenFeeTokenUsers[msg.sender] = false;
        emit UseBobaAsFeeToken(msg.sender);
    }

    /**
     * Swap native token for BOBA
     */
    function swapNativeTokenForBOBAMetaTransaction(
        address tokenOwner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(!Address.isContract(tokenOwner), "Account not EOA");
        require(spender == address(this), "Spender is not this contract");
        uint256 totalCost;
        if (isBobaTokenPriceHigh) {
            // marketPriceRatio = boba price / native token price
            totalCost = receivedBOBAAmount.mul(marketPriceRatio).div(multiplier).add(metaTransactionFee);
        } else {
            // marketPriceRatio = native token price / boba price
            totalCost = receivedBOBAAmount.div(marketPriceRatio).div(multiplier).add(metaTransactionFee);
        }
        require(value >= totalCost, "Value is not enough");
        L2_L1NativeToken l1NativeTokenOnL2 = L2_L1NativeToken(l1NativeTokenL2Address);
        l1NativeTokenOnL2.permit(tokenOwner, spender, value, deadline, v, r, s);
        IERC20(l1NativeTokenOnL2).safeTransferFrom(tokenOwner, address(this), totalCost);
        (bool sent, ) = address(tokenOwner).call{ value: receivedBOBAAmount }("");
        require(sent, "Failed to send ETH");
        emit SwapBOBAForETHMetaTransaction(tokenOwner);
    }

    /**
     * Add the users that want to use ETH as the fee token
     */
    function useL1NativeTokenAsFeeToken() public {
        require(!Address.isContract(msg.sender), "Account not EOA");
        // Users should have more than 0.002 l1 native token
        require(
            L2_L1NativeToken(l1NativeTokenL2Address).balanceOf(msg.sender) >= 2e18,
            "Insufficient Boba balance"
        );
        l1NativeTokenFeeTokenUsers[msg.sender] = true;
        l1NativeTokenFeeTokenUsers[msg.sender] = false;
        emit UseL1NativeTokenAsFeeToken(msg.sender);
    }

    /**
     * Update the price ratio of ETH and BOBA
     * @param _priceRatio the price ratio of ETH and BOBA
     * @param _marketPriceRatio tha market price ratio of ETH and BOBA
     */
    function updatePriceRatio(uint256 _priceRatio, uint256 _marketPriceRatio, bool _isBobaTokenPriceHigh) public onlyOwner {
        require(_priceRatio <= maxPriceRatio && _priceRatio >= minPriceRatio);
        require(_marketPriceRatio <= maxPriceRatio && _marketPriceRatio >= minPriceRatio);
        priceRatio = _priceRatio;
        marketPriceRatio = _marketPriceRatio;
        isBobaTokenPriceHigh = _isBobaTokenPriceHigh;
        emit UpdatePriceRatio(owner(), _priceRatio, _marketPriceRatio, _isBobaTokenPriceHigh);
    }

    /**
     * Update the maximum price ratio of ETH and BOBA
     * @param _maxPriceRatio the maximum price ratio of ETH and BOBA
     */
    function updateMaxPriceRatio(uint256 _maxPriceRatio) public onlyOwner {
        require(_maxPriceRatio >= minPriceRatio && _maxPriceRatio > 0);
        maxPriceRatio = _maxPriceRatio;
        emit UpdateMaxPriceRatio(owner(), _maxPriceRatio);
    }

    /**
     * Update the minimum price ratio of ETH and BOBA
     * @param _minPriceRatio the minimum price ratio of ETH and BOBA
     */
    function updateMinPriceRatio(uint256 _minPriceRatio) public onlyOwner {
        require(_minPriceRatio <= maxPriceRatio && _minPriceRatio > 0);
        minPriceRatio = _minPriceRatio;
        emit UpdateMinPriceRatio(owner(), _minPriceRatio);
    }

    /**
     * Update the gas oracle address
     * @param _gasPriceOracleAddress gas oracle address
     */
    function updateGasPriceOracleAddress(address _gasPriceOracleAddress) public onlyOwner {
        require(Address.isContract(_gasPriceOracleAddress), "Account is EOA");
        require(_gasPriceOracleAddress != address(0));
        gasPriceOracleAddress = _gasPriceOracleAddress;
        emit UpdateGasPriceOracleAddress(owner(), _gasPriceOracleAddress);
    }

    /**
     * Update the fee for the meta transaction
     * @param _metaTransactionFee the fee for the meta transaction
     */
    function updateMetaTransactionFee(uint256 _metaTransactionFee) public onlyOwner {
        require(_metaTransactionFee > 0);
        metaTransactionFee = _metaTransactionFee;
        emit UpdateMetaTransactionFee(owner(), _metaTransactionFee);
    }

    /**
     * Update the received BOBA amount
     * @param _receivedBOBAAmount the received BOBA amount
     */
    function updateReceivedBOBAAmount(uint256 _receivedBOBAAmount) public onlyOwner {
        require(_receivedBOBAAmount > 1e15 && _receivedBOBAAmount < 10e18);
        receivedBOBAAmount = _receivedBOBAAmount;
        emit UpdateReceivedBOBAAmount(owner(), _receivedBOBAAmount);
    }

    /**
     * Update the decimal places for price ratio
     * @param _decimals the diciimal places for price ratio
     */
    function updateDecimals(uint256 _decimals) public onlyOwner {
        require(_decimals < 5);
        decimals = _decimals;
        multiplier = 10 ** _decimals;
        emit UpdateDecimals(owner(), _decimals);
    }

    /**
     * Get the price for swapping l1 native token for BOBA
     */
    function getL1NativeTokenForSwap() public view returns (uint256) {
        if (isBobaTokenPriceHigh) {
            // marketPriceRatio = boba price / native token price
            return receivedBOBAAmount.mul(marketPriceRatio).div(multiplier).add(metaTransactionFee);
        }
        // marketPriceRatio = native token price / boba price
        return receivedBOBAAmount.div(marketPriceRatio).div(multiplier).add(metaTransactionFee);
    }

    /**
     * Get L1 native token fee for fee estimation
     * @param _txData the data payload
     */
    function getL1NativeTokenFee(bytes memory _txData) public view returns (uint256) {
        OVM_GasPriceOracle gasPriceOracleContract = OVM_GasPriceOracle(gasPriceOracleAddress);
        if (isBobaTokenPriceHigh) {
        return gasPriceOracleContract.getL1Fee(_txData).mul(priceRatio);
        }
        return gasPriceOracleContract.getL1Fee(_txData).div(priceRatio);
    }

    /**
     * withdraw l1 native token to l1 fee wallet
     */
    function withdrawL1NativeToken() public {
        require(
            L2_L1NativeToken(l1NativeTokenL2Address).balanceOf(address(this)) >= MIN_WITHDRAWAL_AMOUNT,
            // solhint-disable-next-line max-line-length
            "Boba_GasPriceOracle: withdrawal amount must be greater than minimum withdrawal amount"
        );

        L2StandardBridge(Lib_PredeployAddresses.L2_STANDARD_BRIDGE).withdrawTo(
            l1NativeTokenL2Address,
            feeWallet,
            L2_L1NativeToken(l1NativeTokenL2Address).balanceOf(address(this)),
            0,
            bytes("")
        );
        emit WithdrawL1NativeToken(owner(), feeWallet);
    }

    /**
     * withdraw BOBA tokens to l2 fee wallet
     */
    function withdrawBOBA() public onlyOwner {
        (bool sent, ) = feeWallet.call{ value: address(this).balance }("");
        require(sent, "Failed to send ETH to fee wallet");
        emit WithdrawBOBA(owner(), feeWallet);
    }
}
