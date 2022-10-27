// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./Utils/Ownable.sol";
import "./Utils/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract Multisig is Ownable, ReentrancyGuard {

    uint256 public constant MINIMUM_DELAY = 3 days;
    uint256 public constant MAXIMUM_DELAY = 7 days;

    mapping(bytes32 => Transaction) public transactions;
    mapping(bytes32 => mapping(address => bool)) public confirmations;

    event Queued(bytes32 txId);

    struct Transaction {
        address to;
        bytes data;
        uint256 value;
        uint256 executionTimestamp;
        uint256 confirmationsCount;
    }

    function addTxToQueue(
        address to,
        bytes calldata data,
        uint256 value,
        uint256 executionTimestamp
    ) public onlyOwner {
        require(
            executionTimestamp > block.timestamp + MINIMUM_DELAY &&
                executionTimestamp < block.timestamp + MAXIMUM_DELAY,
            "invalid timestamp"
        );

        bytes32 txId = keccak256(
            abi.encodePacked(to, data, value, executionTimestamp)
        );

        require(!transactionExists(txId), "Transaction already in queue");

        transactions[txId] = Transaction({
            to: to,
            data: data,
            value: value,
            executionTimestamp: executionTimestamp,
            confirmationsCount: 0
        });

        emit Queued(txId);
    }

    function confirmTx(bytes32 txId) public onlyOwner {
        require(transactionExists(txId), "Not queued");
        require(!confirmations[txId][msg.sender], "Already confirmed");

        confirmations[txId][msg.sender] = true;
        transactions[txId].confirmationsCount++;
    }

    function cancelTxConfirmation(bytes32 txId) public onlyOwner {
        require(transactionExists(txId), "Not queued");
        require(confirmations[txId][msg.sender], "Not confirmed");

        confirmations[txId][msg.sender] = false;
        transactions[txId].confirmationsCount--;
    }

    function executeTx(bytes32 txId)
        public
        onlyOwner
        nonReentrant
        returns (bytes memory)
    {
        require(transactionExists(txId), "Tx doesnt exists");

        Transaction storage transaction = transactions[txId];

        require(
            transactions[txId].confirmationsCount == ownersCount,
            "Not enough confirmations"
        );

        (bool success, bytes memory returnData) = transaction.to.call{ value: transaction.value}(transaction.data);

        if (!success) {
            revertFromReturnedData(returnData);
        }

        delete transactions[txId];

        return returnData;
    }

    function revertFromReturnedData(bytes memory returnedData) internal pure {
        if (returnedData.length < 4) {
            // case 1: catch all
            revert("CallUtils: target revert()");
        } else {
            bytes4 errorSelector;
            assembly {
                errorSelector := mload(add(returnedData, 0x20))
            }
            if (
                errorSelector == bytes4(0x4e487b71) /* `seth sig "Panic(uint256)"` */
            ) {
                // case 2: Panic(uint256) (Defined since 0.8.0)
                // solhint-disable-next-line max-line-length
                // ref: https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require)
                string memory reason = "CallUtils: target panicked: 0x__";
                uint256 errorCode;
                assembly {
                    errorCode := mload(add(returnedData, 0x24))
                    let reasonWord := mload(add(reason, 0x20))
                    // [0..9] is converted to ['0'..'9']
                    // [0xa..0xf] is not correctly converted to ['a'..'f']
                    // but since panic code doesn't have those cases, we will ignore them for now!
                    let e1 := add(and(errorCode, 0xf), 0x30)
                    let e2 := shl(8, add(shr(4, and(errorCode, 0xf0)), 0x30))
                    reasonWord := or(
                        and(
                            reasonWord,
                            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000
                        ),
                        or(e2, e1)
                    )
                    mstore(add(reason, 0x20), reasonWord)
                }
                revert(reason);
            } else {
                // case 3: Error(string) (Defined at least since 0.7.0)
                // case 4: Custom errors (Defined since 0.8.0)
                uint256 len = returnedData.length;
                assembly {
                    revert(add(returnedData, 32), len)
                }
            }
        }
    }

    function transactionExists(bytes32 txId) public view returns (bool) {
        return transactions[txId].executionTimestamp != 0;
    }

    function getQueuedTx(bytes32 txId)
        public
        view
        returns (Transaction memory)
    {
        require(transactionExists(txId), "Transaction not found");

        return transactions[txId];
    }

    function getConfirmationsAmount(bytes32 txId)
        public
        view
        returns (uint256)
    {
        require(transactionExists(txId), "Transaction not found");

        return transactions[txId].confirmationsCount;
    }
}
