pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/escrow/Escrow.sol)

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MultisigEscrow{
    using Address for address payable;

    event Withdrawn(address indexed token, address indexed receiver, uint256 weiAmount);
    event Propose(address indexed token, address indexed receiver, uint256 weiAmount, uint256 nonce);

    address private _owner;

    address[] private _signers;
    uint private _proposalThreshold;

    Proposal private _activeProposal;
    uint256  private _n;
    
    struct Proposal {
        ERC20 token;
        address receiver;
        uint256 amount;
        bool[] approvals;
    }

    constructor(uint signerCount, uint proposalThreshold ){
        require(signerCount>0);
        require(proposalThreshold<=signerCount);
        _owner = msg.sender;
        _signers = new address[](signerCount);
        _proposalThreshold = proposalThreshold;
        _n = 1;
    }

    function setSigner(uint id, address signer) public onlyOwner() {
        _signers[id] = signer;
        bool primed = true;
        for(uint i=0;i<_signers.length;i++){
            if(_signers[i]==address(0)){
                primed = false;
            }
        }
        if(primed){
            _owner = address(0);
        }
    }

    modifier signersOnly(){
        bool found = false;
        for(uint i=0;i<_signers.length;i++){
            if(_signers[i]==msg.sender){
                found = true;
            }
        }
        require(found, 'Only signers can do this!');
        _;
    }

    modifier onlyOwner(){
        require(_owner!=address(0),'This function is permanently deactivated!');
        require(msg.sender == _owner,'Only owner can do this!');
        _;
    }

    function proposeWithdrawl(uint256 _nonce, address tokenAddr, address receiver, uint256 amount ) public virtual signersOnly() {
        ERC20 token = ERC20(tokenAddr);
        require(_nonce==_n, 'Wrong nonce');
        require(token.balanceOf(address(this))>=amount,'Not enough in deposits');
        _n = _n + 1;
        _activeProposal = Proposal(token, receiver, amount, new bool[](_signers.length));
        emit Propose(tokenAddr, receiver, amount, _n);
    }

    function signProposal(uint256 _nonce, bool approve) public virtual signersOnly(){
        require(_nonce==_n, 'Wrong nonce');
        uint256 i;
        for(i=0;i<_signers.length;i++){
            if(msg.sender == _signers[i]){
                break;
            }
        }
        _activeProposal.approvals[i] = approve;
        _n = _n + 1;
    }

    function depositsOf(address tokenAddr) public view returns (uint256) {
        ERC20 token = ERC20(tokenAddr);
        return token.balanceOf(address(this));
    }

    function signers() public view returns(address[] memory){
        return _signers;
    }

    function controller() public view returns (address){
        return _owner;
    }

    function nonce() public view returns(uint256){
        return _n;
    }

    function activeProposal() public view returns(Proposal memory){
        return _activeProposal;
    }
 
    function executeProposal() public virtual {
        uint quorum = 0;
        for(uint i=0;i<_signers.length;i++){
            if(_activeProposal.approvals[i]){
                quorum = quorum + 1;
            }
        }
        require(quorum >= _proposalThreshold, 'Quorum not reached!');
        _activeProposal.token.transfer(_activeProposal.receiver, _activeProposal.amount);
        delete _activeProposal;
        emit Withdrawn(address(_activeProposal.token), _activeProposal.receiver, _activeProposal.amount);
    }
}