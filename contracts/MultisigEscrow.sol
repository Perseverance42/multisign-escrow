pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/escrow/Escrow.sol)

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract MultisigEscrow{
    using Address for address payable;

    event Received(address indexed depositer, uint256 weiAmount);
    event Withdrawn(address indexed token, address indexed receiver, uint256 weiAmount);
    event Propose(address indexed token, address indexed receiver, uint256 weiAmount);
    
    address private _owner;

    address[] private _signers;
    uint private _proposalThreshold;

    Proposal private _activeProposal;
    uint256  private _n;
    
    struct Proposal {
        address token;
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
        require(_nonce==_n, 'Wrong nonce');
        if(tokenAddr == address(0)){
            require(address(this).balance>=amount,'Not enough in deposits');
        }else{
            IERC20 token = IERC20(tokenAddr);
            require(token.balanceOf(address(this))>=amount,'Not enough in deposits');
        }      
        _n = _n + 1;
        _activeProposal = Proposal(tokenAddr, receiver, amount, new bool[](_signers.length));
        emit Propose(tokenAddr, receiver, amount);
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
        if(tokenAddr == address(0)){
            return address(this).balance;
        }else{
            IERC20 token = IERC20(tokenAddr);
            return token.balanceOf(address(this));
        }
    }

    receive()  external payable {
        emit Received(msg.sender, msg.value);
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

    function activeProposal() public view returns(address token, address receiver, uint256 amount, bool[] memory approvals, uint256 n){
        return(_activeProposal.token, _activeProposal.receiver, _activeProposal.amount, _activeProposal.approvals, _n);
    }
 
    function executeProposal() public virtual {
        require(_activeProposal.approvals.length==_signers.length, 'No active proposal!');
        uint quorum = 0;
        for(uint i=0;i<_signers.length;i++){
            if(_activeProposal.approvals[i]){
                quorum = quorum + 1;
            }
        }
        require(quorum >= _proposalThreshold, 'Quorum not reached!');
        if(_activeProposal.token == address(0)){
            require(address(this).balance>=_activeProposal.amount,'Not enough deposited!');
            address payable to = payable(_activeProposal.receiver);
            to.transfer(_activeProposal.amount);
        }else{
            IERC20 erc20 = IERC20(_activeProposal.token);
            require( erc20.balanceOf(address(this))>=_activeProposal.amount,'Not enough deposited!');
            erc20.transfer(_activeProposal.receiver, _activeProposal.amount);
        }
        
        delete _activeProposal;
        emit Withdrawn(_activeProposal.token, _activeProposal.receiver, _activeProposal.amount);
    }
}