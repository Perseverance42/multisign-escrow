// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './MultisigEscrow.sol';
import "@openzeppelin/contracts/proxy/Clones.sol";

contract EscrowFactory {

    address immutable refrerenceImplementation;
    MultisigEscrow[] public children;

    event EscrowCreated(address indexed creator, address escrow);

    constructor(address payable referenceAddr){
        refrerenceImplementation = address(MultisigEscrow(referenceAddr));
    }

    function createEscrow(uint16 signersCount, uint16 signersThreshold) external {
        address clone = Clones.clone(refrerenceImplementation);
        MultisigEscrow escrow = MultisigEscrow(payable(clone));
        escrow.initialize(msg.sender, signersCount, signersThreshold);
        children.push(escrow);
        emit EscrowCreated(msg.sender, address(escrow));
    }
}