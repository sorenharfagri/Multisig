//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Utils/Context.sol";


contract Ownable is Context {
    mapping(address => bool) owners;
    uint256 ownersCount = 1;

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        address msgSender = _msgSender();
        owners[msgSender] = true;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function isOwner(address account) public view returns (bool) {
        return owners[account];
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(
            isOwner(_msgSender()) == true,
            "Ownable: caller is not the owner"
        );
        _;
    }
    
    modifier onlySelf() {
        require(
            _msgSender() == address(this),
            "Ownable: caller is not self contract"
        );
        _;
    }

    function addOwner(address account) public virtual onlySelf {

        owners[account] = true;
        ownersCount++;
    }

    function removeOwner(address account) public virtual onlySelf {

        owners[account] = false;
        ownersCount--;
    }
}
