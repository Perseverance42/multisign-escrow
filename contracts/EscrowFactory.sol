// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './MultisigEscrow.sol';

contract EscrowFactory {

    MultisigEscrow[] public children;

    event EscrowCreated(address indexed creator, address escrow);

    function createEscrow(uint signersCount, uint signersThreshold) external {
        MultisigEscrow escrow = new MultisigEscrow(signersCount, signersThreshold);
        children.push(escrow);
        emit EscrowCreated(msg.sender, address(escrow));
    }
}