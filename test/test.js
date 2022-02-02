const { expect } = require("chai");
const { ethers } = require("hardhat");

const NULL_ADDR = "0x0000000000000000000000000000000000000000";

async function deployEscrow(){
  const [owner, addr1, addr2] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory("MultisigEscrow");
  const referenceEscrow = await Escrow.deploy();

  await referenceEscrow.deployed();

  const EscrowFactory  = await ethers.getContractFactory("EscrowFactory");
  const escrowFactory  = await EscrowFactory.deploy(referenceEscrow.address);
  const escrowAddr     = await escrowFactory.createEscrow(2,2);
  let receipt = await escrowAddr.wait();

  const MultisigEscrow = await ethers.getContractFactory("MultisigEscrow");
  const escrow         = await MultisigEscrow.attach(receipt.events[1].args.escrow);

  expect(await escrow.controller()).to.equals(owner.address);
  return escrow;
}

async function deployAndPrimeEscrow(signer1, signer2){
  const escrow = await deployEscrow();
  let tx = await escrow.setSigner(0,signer1);
  await tx.wait();
  tx = await escrow.setSigner(1,signer2);
  await expect(tx).to.emit(escrow, "Primed");

  const signers = await escrow.signers();
  expect(signers[0]).to.equals(signer1);
  expect(signers[1]).to.equals(signer2);
  expect(await escrow.controller()).to.equals(NULL_ADDR);
  return escrow;
}

async function deploySampleToken(){
  const SampleCoin = await ethers.getContractFactory("SampleCoin");
  const sampleCoin = await SampleCoin.deploy(1000000);

  await sampleCoin.deployed();
  return sampleCoin;
}

describe("Deployment and Priming", function () {
  it("Deployment gives back unprimed Escrow instance.", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    let escrow = await deployEscrow();

    let signers = await escrow.signers();
    expect(signers).to.length(2);
    expect(signers[0]).to.equals(NULL_ADDR);
    expect(signers[1]).to.equals(NULL_ADDR);
    expect(await escrow.controller()).to.equals(owner.address);

  });

  it("Escrow Instance is primable", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    let escrow = await deployEscrow();
  
    await escrow.setSigner(0, owner.address);
    let signers = await escrow.signers();
    expect(signers[0]).to.equals(owner.address);
    expect(signers[1]).to.equals(NULL_ADDR);
    
    await escrow.setSigner(1, addr1.address);
    signers = await escrow.signers();
    expect(signers[0]).to.equals(owner.address);
    expect(signers[1]).to.equals(addr1.address);
    expect(await escrow.controller()).to.equals(NULL_ADDR);
    await expect(escrow.setSigner(0, addr1.address)).to.be.revertedWith('This function is permanently deactivated!');
  
  });
});

describe("Authorizations", function () {
  it("Controller access control is restrictive", async function(){
    const [owner, addr1, addr2] = await ethers.getSigners();

    const escrow = await deployEscrow();    

    await expect(escrow.connect(addr1).setSigner(0,owner.address)).to.be.revertedWith('Only owner can do this!');
    let signers = await escrow.signers();
    expect(signers[0]).to.equals(NULL_ADDR);
    expect(signers[1]).to.equals(NULL_ADDR);

    await escrow.setSigner(0,addr1.address);
    signers = await escrow.signers();
    expect(signers[0]).to.equals(addr1.address);
    expect(signers[1]).to.equals(NULL_ADDR);
    expect(await escrow.controller()).to.equals(owner.address);

    //test if overriding signers works
    await escrow.setSigner(0, owner.address);
    signers = await escrow.signers();
    expect(signers[0]).to.equals(owner.address);
    expect(signers[1]).to.equals(NULL_ADDR);
    expect(await escrow.controller()).to.equals(owner.address);

    await escrow.setSigner(1,addr2.address);

    signers = await escrow.signers();
    expect(signers[0]).to.equals(owner.address);
    expect(signers[1]).to.equals(addr2.address);
    expect(await escrow.controller()).to.equals(NULL_ADDR);

    //we should no longer have access to setting signers!
    expect(escrow.setSigner(0,addr1.address)).to.be.revertedWith('This function is permanently deactivated!');
    expect(await escrow.controller()).to.equals(NULL_ADDR);
  });

  it("Proposal control is restrictive", async function(){
    const [owner, addr1, addr2] = await ethers.getSigners();
    const escrow = await deployAndPrimeEscrow(addr1.address, addr2.address);
    const coin = await deploySampleToken();

    //owner should not be allowed to sign
    let nonce = await escrow.nonce();
    await expect(escrow.proposeWithdrawl(nonce, coin.address, coin.address, 10)).to.be.revertedWith('Only signers can do this!');
    
    //addr1 should be allowed
    nonce = await escrow.nonce();
    await escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr1.address, 0);
    
    let proposal = await escrow.activeProposal();
    expect(proposal.token).to.equals(coin.address);
    expect(proposal.amount).to.equals(0);

    //addr1 should not be allowed to override with wrong nonce
    nonce = await escrow.nonce();
    await expect(escrow.connect(addr1).proposeWithdrawl(nonce-1, coin.address, addr1.address, 0)).to.be.revertedWith('Wrong nonce');

    //submitting proposals for invalid amounts is forbidden
    await expect(escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr1.address, 100)).to.be.revertedWith('Not enough in deposits');

    //submitting a non contract token should break things
    await expect(escrow.connect(addr1).proposeWithdrawl(nonce, owner.address, addr1.address, 0)).to.be.reverted;

    //addr2 should be allowed to override with correct nonce
    nonce = await escrow.nonce();
    await escrow.connect(addr2).proposeWithdrawl(nonce, coin.address, addr2.address, 0);
    proposal = await escrow.activeProposal();
    expect(proposal.receiver).to.equals(addr2.address);
    expect(proposal.amount).to.equals(0);
  });

  it("Signing is restrictive", async function(){
    const [owner, addr1, addr2] = await ethers.getSigners();
    const escrow = await deployAndPrimeEscrow(addr1.address, addr2.address);
    const coin = await deploySampleToken();

    //prepare proposal
    let nonce = await escrow.nonce();
    await escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr1.address, 0);

    let proposal = await escrow.activeProposal();
    expect(proposal.token).to.equals(coin.address);
    expect(proposal.receiver).to.equals(addr1.address);

    nonce = await escrow.nonce();
    
    //owner should not be allowed to sign
    await expect(escrow.signProposal(nonce, true)).to.be.revertedWith('Only signers can do this!');

    //addr1 should be allowed
    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, true);
    proposal = await escrow.activeProposal();
    expect(proposal.approvals[0]).to.equals(true);
    expect(proposal.approvals[1]).to.equals(false);

    //addr1 should not be allowed to sign for addr2
    nonce = await escrow.nonce();
    await expect(escrow.connect(addr1).signProposalIndexed(nonce, 1, true)).to.be.revertedWith('unauthorized index');
    proposal = await escrow.activeProposal();
    expect(proposal.approvals[0]).to.equals(true);
    expect(proposal.approvals[1]).to.equals(false);    

    //addr1 should be allowed to withdraw approval
    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, false);
    proposal = await escrow.activeProposal();
    expect(proposal.approvals[0]).to.equals(false);
    expect(proposal.approvals[1]).to.equals(false);

    //addr2 should be allowed
    nonce = await escrow.nonce();
    await escrow.connect(addr2).signProposal(nonce, true);
    proposal = await escrow.activeProposal();
    expect(proposal.approvals[1]).to.equals(true);
    expect(proposal.approvals[1]).to.equals(true);
    
  });

  it("Valid nonce is enforced", async function(){
    const [owner, addr1, addr2] = await ethers.getSigners();
    const escrow = await deployAndPrimeEscrow(addr1.address, addr2.address);
    const coin = await deploySampleToken();

    //prepare proposal
    let nonce = await escrow.nonce();
    await expect(escrow.connect(addr1).proposeWithdrawl(nonce+1, coin.address, addr1.address, 0)).to.be.revertedWith("Wrong nonce");
    await expect(escrow.connect(addr1).proposeWithdrawl(10000000000, coin.address, addr1.address, 0)).to.be.revertedWith("Wrong nonce");

    //check if nonce has not changed
    expect(await escrow.nonce()).to.equals(nonce);

    await escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr1.address, 0);
    let proposal = await escrow.activeProposal();

    //check if nonce increased
    new_nonce = await escrow.nonce();
    expect(new_nonce.toNumber()).to.greaterThan(nonce.toNumber());
    nonce = new_nonce;

    expect(proposal.token).to.equals(coin.address);
    expect(proposal.receiver).to.equals(addr1.address);
    
    //nonce shall be enforced on signing
    await expect(escrow.connect(addr1).signProposal(nonce-1, true)).to.be.revertedWith('Wrong nonce');
    expect(await escrow.nonce()).to.equals(nonce);

    //addr1 should be allowed
    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, true);
    proposal = await escrow.activeProposal();
    expect(proposal.approvals[0]).to.equals(true);
    expect(proposal.approvals[1]).to.equals(false);

    //check if nonce increased
    new_nonce = await escrow.nonce();
    expect(new_nonce.toNumber()).to.greaterThan(nonce.toNumber());
    nonce = new_nonce;

    //addr2 should be allowed
    nonce = await escrow.nonce();

    //nonce shall be enforced on signing
    await expect(escrow.connect(addr2).signProposal(nonce+1, true)).to.be.revertedWith('Wrong nonce');
    expect(await escrow.nonce()).to.equals(nonce);

    await escrow.connect(addr2).signProposal(nonce, true);

    new_nonce = await escrow.nonce();
    expect(new_nonce.toNumber()).to.greaterThan(nonce.toNumber());
    nonce = new_nonce;

    proposal = await escrow.activeProposal();
    expect(proposal.approvals[1]).to.equals(true);
    expect(proposal.approvals[1]).to.equals(true);
    
  });
});

describe("Functionallity", function () {
  it("basic-path eth", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    const escrow = await deployAndPrimeEscrow(addr1.address, addr2.address);
    
    let tx = await owner.sendTransaction({
      to: escrow.address,
      value: 10, // Sends exactly 1.0 ether
    });
    
    expect(await escrow.depositsOf(NULL_ADDR)).to.equals(10);
  
    let nonce = await escrow.nonce();
    await escrow.connect(addr1).proposeWithdrawl(nonce, NULL_ADDR, "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", 10);

    let activeProposal = await escrow.activeProposal();
    expect(activeProposal.receiver).to.equals("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B");
    expect(activeProposal.amount).to.equals(10);
    expect(activeProposal.approvals[0]).to.equals(false);
    expect(activeProposal.approvals[1]).to.equals(false);

    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(false);
    
    nonce = await escrow.nonce();
    await escrow.connect(addr2).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(true);

    //anyone can execute this
    const receipt = await escrow.executeProposal();
    activeProposal = await escrow.activeProposal();

    //check if proposal was reset properly
    expect(activeProposal.token).to.equals(NULL_ADDR);
    expect(activeProposal.receiver).to.equals(NULL_ADDR);
    expect(activeProposal.amount).to.equals(0);
    expect(activeProposal.approvals).to.empty;

    //check if token transfer has actually happened
    expect(await escrow.depositsOf(NULL_ADDR)).to.equals(0);
    expect(await ethers.provider.getBalance(escrow.address)).to.equals(0);
    expect(await ethers.provider.getBalance("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B")).to.equals(10);
 
  });

  it("complex-path erc20", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    const escrow = await deployAndPrimeEscrow(addr1.address, addr2.address);
    const coin = await deploySampleToken();
    
    await coin.transfer(escrow.address, 100);
    expect(await escrow.depositsOf(coin.address)).to.equals(100);
    expect(await coin.balanceOf(escrow.address)).to.equals(100);

    //try executing with no proposal
    await expect(escrow.executeProposal()).to.be.revertedWith('No active proposal!');

    let nonce = await escrow.nonce();
    await escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr1.address, 50);

    let activeProposal = await escrow.activeProposal();
    expect(activeProposal.receiver).to.equals(addr1.address);
    expect(activeProposal.amount).to.equals(50);
    expect(activeProposal.approvals[0]).to.equals(false);
    expect(activeProposal.approvals[1]).to.equals(false);

    //try executing with no signatures
    await expect(escrow.executeProposal()).to.be.revertedWith('Quorum not reached!');

    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(false);

    //try executing with to few signatures
    await expect(escrow.executeProposal()).to.be.revertedWith('Quorum not reached!');
    
    nonce = await escrow.nonce();
    await escrow.connect(addr2).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(true);

    //anyone can execute this
    await escrow.executeProposal();
    activeProposal = await escrow.activeProposal();

    //check if proposal was reset properly
    expect(activeProposal.token).to.equals(NULL_ADDR);
    expect(activeProposal.receiver).to.equals(NULL_ADDR);
    expect(activeProposal.amount).to.equals(0);
    expect(activeProposal.approvals).to.empty;

    //try executing with no proposal
    await expect(escrow.executeProposal()).to.be.revertedWith('No active proposal!');

    //check if token transfer has actually happened
    expect(await escrow.depositsOf(coin.address)).to.equals(50);
    expect(await coin.balanceOf(escrow.address)).to.equals(50);
    expect(await coin.balanceOf(addr1.address)).to.equals(50);    
    expect(await coin.balanceOf(addr2.address)).to.equals(0);

    //////////////////////////////////
    //propose withdrawl of second half
    //////////////////////////////////

    nonce = await escrow.nonce();
    await escrow.connect(addr1).proposeWithdrawl(nonce, coin.address, addr2.address, 50);

    activeProposal = await escrow.activeProposal();
    expect(activeProposal.receiver).to.equals(addr2.address);
    expect(activeProposal.amount).to.equals(50);
    expect(activeProposal.approvals[0]).to.equals(false);
    expect(activeProposal.approvals[1]).to.equals(false);

    //try executing with no signatures
    await expect(escrow.executeProposal()).to.be.revertedWith('Quorum not reached!');

    nonce = await escrow.nonce();
    await escrow.connect(addr1).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(false);

    //try executing with to few signatures
    await expect(escrow.executeProposal()).to.be.revertedWith('Quorum not reached!');
    
    nonce = await escrow.nonce();
    await escrow.connect(addr2).signProposal(nonce, true);
    activeProposal = await escrow.activeProposal();
    expect(activeProposal.approvals[0]).to.equals(true);
    expect(activeProposal.approvals[1]).to.equals(true);

    //anyone can execute this
    await escrow.executeProposal();
    activeProposal = await escrow.activeProposal();

    //check if proposal was reset properly
    expect(activeProposal.token).to.equals(NULL_ADDR);
    expect(activeProposal.receiver).to.equals(NULL_ADDR);
    expect(activeProposal.amount).to.equals(0);
    expect(activeProposal.approvals).to.empty;

    //try executing with no proposal
    await expect(escrow.executeProposal()).to.be.revertedWith('No active proposal!');

    //check if token transfer has actually happened
    expect(await escrow.depositsOf(coin.address)).to.equals(0);
    expect(await coin.balanceOf(escrow.address)).to.equals(0);
    expect(await coin.balanceOf(addr1.address)).to.equals(50);    
    expect(await coin.balanceOf(addr2.address)).to.equals(50);
  });
});


