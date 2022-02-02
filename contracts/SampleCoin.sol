pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract SampleCoin is ERC20{
    constructor(uint256 totalSupply) ERC20('Coin', 'COIN'){
        _mint(msg.sender, totalSupply);
    }
}