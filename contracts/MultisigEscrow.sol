// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract MultisigEscrow{
    using Address for address payable;

    //triggered only when native token is send to contract addr
    event Received(address indexed depositer, uint256 weiAmount);
    //triggered for all successfull withdrawls
    event Withdrawn(address indexed token, address indexed receiver, uint256 weiAmount);
    //triggered for all successfull proposls
    event Propose(address indexed token, address indexed receiver, uint256 weiAmount);
    //triggered only once for every intance. Is triggered once all signer slots have been filled with addresses
    event Primed();
    //triggered for all changes in signatures, also for withrawing a prior approval
    event Signed(address indexed signer, bool approved, uint256 n);
    //triggered only once for every insance. Is triggered after cloning
    event Initialized(address owner);
    
    //owner is allowed to prime the instance
    address private _owner;
    //addresses which are allowed to approve withdrawls
    address[] private _signers;
    //minimum amount of approvals needed to enable withdrawls.
    uint16 private _proposalThreshold;

    //currently active proposed withdrawl.
    Proposal private _activeProposal;
    //current nonce
    uint256  private _n;
    
    struct Proposal {
        address token;
        address receiver;
        uint256 amount;
        bool[] approvals;
    }

    constructor(){
    }

    //only allow signers to access certain functions
    modifier signersOnly(){
        bool found = false;
        for(uint16 i=0;i<_signers.length;i++){
            if(_signers[i]==msg.sender){
                found = true;
            }
        }
        require(found, 'Only signers can do this!');
        _;
    }

    //only allow the instance creator to prime the instance
    //gets disabled permanently after instance is primed
    modifier onlyOwner(){
        require(_owner!=address(0),'This function is permanently deactivated!');
        require(msg.sender == _owner,'Only owner can do this!');
        _;
    }

    //initialization is needed as constructor does not get called for cloned instances
    //initializes the instance
    function initialize(address owner, uint16 signerCount, uint16 proposalThreshold) external{
        require(_n==0,'already initialized');
        require(signerCount>0);
        require(proposalThreshold<=signerCount);
        _owner = owner;
        _signers = new address[](signerCount);
        _proposalThreshold = proposalThreshold;
        _n = 1;
        emit Initialized(_owner);
    }
    /*    Receive native token hook    */
    receive()  external payable {
        emit Received(msg.sender, msg.value);
    }
    /*    Getters    */
    function depositsOf(address tokenAddr) public view returns (uint256) {
        if(tokenAddr == address(0)){
            return address(this).balance;
        }else{
            IERC20 token = IERC20(tokenAddr);
            return token.balanceOf(address(this));
        }
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

    /*    Setters    */

    //sets address as a signer.
    //once all signer slots are occupied the instance will be primed and this function becomes permanently deactivated.
    function setSigner(uint16 id, address signer) public onlyOwner() {
        _signers[id] = signer;
        bool primed = true;
        for(uint16 i=0;i<_signers.length;i++){
            if(_signers[i]==address(0)){
                primed = false;
            }
        }
        if(primed){
            _owner = address(0);
            emit Primed();
        }
    }

    //propose a new withdrawl request
    //if tokenAddr is set to nulladdress native token will be send.
    //nonce has to match the current nonce to ensure approvals are given to a known state.
    //nonce does increase whenever the proposal state does change.
    function proposeWithdrawl(uint256 _nonce, address tokenAddr, address receiver, uint256 amount ) public virtual signersOnly() {
        require(_nonce==_n, 'Wrong nonce');
        if(tokenAddr == address(0)){ //check native token balance
            require(address(this).balance>=amount,'Not enough in deposits');
        }else{ //check erc20 token balance
            IERC20 token = IERC20(tokenAddr);
            require(token.balanceOf(address(this))>=amount,'Not enough in deposits');
        }      
        _n = _n + 1;
        _activeProposal = Proposal(tokenAddr, receiver, amount, new bool[](_signers.length));
        emit Propose(tokenAddr, receiver, amount);
    }

    //sets approval to first fitting signer slot on currently active proposal
    function signProposal(uint256 _nonce, bool approve) public virtual signersOnly(){
        require(_nonce==_n, 'Wrong nonce');
        uint16 i;
        for(i=0;i<_signers.length;i++){
            if(msg.sender == _signers[i]){
                break;
            }
        }
        signProposalIndexed(_nonce, i, approve);
    }

    //sets approval to specific signer slot on currently active proposal
    function signProposalIndexed(uint256 _nonce, uint16 signerId, bool approve) public virtual signersOnly(){
        require(_nonce==_n, 'Wrong nonce');
        require(msg.sender == _signers[signerId], 'unauthorized index');
        _activeProposal.approvals[signerId] = approve;
        emit Signed(_signers[signerId], approve, _n);
        _n = _n + 1;
    }
 
    //executes proposal if approval threshold is reached.
    //anyone is allowed to execute this as quorum and parameters are controlled by signers.
    function executeProposal() public virtual {
        require(_activeProposal.approvals.length==_signers.length, 'No active proposal!');
        uint16 quorum = 0;
        for(uint16 i=0;i<_signers.length;i++){
            if(_activeProposal.approvals[i]){
                quorum = quorum + 1;
            }
        }
        require(quorum >= _proposalThreshold, 'Quorum not reached!');
        if(_activeProposal.token == address(0)){ //send native token
            require(address(this).balance>=_activeProposal.amount,'Not enough deposited!');
            address payable to = payable(_activeProposal.receiver);
            to.transfer(_activeProposal.amount);
        }else{ //send erc20 asset
            IERC20 erc20 = IERC20(_activeProposal.token);
            require( erc20.balanceOf(address(this))>=_activeProposal.amount,'Not enough deposited!');
            erc20.transfer(_activeProposal.receiver, _activeProposal.amount);
        }
        
        delete _activeProposal;
        emit Withdrawn(_activeProposal.token, _activeProposal.receiver, _activeProposal.amount);
    }
}