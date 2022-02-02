# Solidity Multisign Escrow

This project allowes one to create a escrow contract instance which can hold ERC20 tokens on behalf of multiple addresses and control spending.
An escrow instance has to be initialized with the number of signer addresses and the minimum approvals needed to allow the spending of held tokens (threshold).
Each escrow instance has to be primed by submitting addresses until all signer slots are occupied.
Signers and threshold of a primed escrow instance can not be changed.


## Deployed instances on public networks
  | Cronos testnet   |                                            |
  | ---------------- | ------------------------------------------ |
  | EscrowFactory:   | 0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8 |
  | MultisigEscrow: | 0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB |
