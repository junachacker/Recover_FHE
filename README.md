# Confidential Wallet Recovery

Confidential Wallet Recovery is a privacy-preserving application designed to ensure the secure restoration of wallets through the innovative capabilities of Zama's Fully Homomorphic Encryption (FHE) technology. With a focus on safeguarding sensitive information, this tool allows users to split their private keys into encrypted shards and share them with trusted friends. Only by collaborating and performing homomorphic computations can these shards be reassembled, ensuring that recovery remains confidential and secure.

## The Problem

In today's digital landscape, the security of personal assets is paramount. Traditional wallet recovery methods often compromise privacy; they require revealing sensitive cleartext data, which can be intercepted or exploited by malicious actors. The risk is particularly acute as it concerns financial assets, where unauthorized access could lead to significant losses. Cleartext data exposes private keys, leaving users vulnerable to theft, fraud, and irreversible loss of their assets. Confidential Wallet Recovery addresses this critical gap in privacy and security.

## The Zama FHE Solution

Zama's FHE technology revolutionizes how we handle sensitive data by enabling computation on encrypted data. This means that operations can be performed without ever exposing the underlying cleartext information. 

Using the fhevm as the processing engine, the Confidential Wallet Recovery application ensures that private keys can be split, encrypted, and managed securely throughout the recovery process. The absence of cleartext visibility protects users from potential security breaches while allowing trusted parties to contribute to the recovery process via homomorphic operations.

## Key Features

- 🔒 **Secure Key Splitting**: Split your private key into multiple encrypted shards, ensuring safety when sharing with trusted friends.
- 🤝 **Collaborative Recovery**: Only through the collective efforts of designated guardians can the wallet be restored, maintaining strict privacy.
- ⚙️ **Homomorphic Computations**: Perform calculations on encrypted data, guaranteeing that sensitive information never leaves the encryption.
- 🛡️ **Asset Security**: Keep your financial assets protected from unauthorized access through advanced cryptographic techniques.
- 🔑 **Guardian List Management**: Easily manage and update the list of trusted guardians involved in the recovery process.

## Technical Architecture & Stack

The Confidential Wallet Recovery leverages the following technologies:

- **Core Privacy Engine**: Zama’s FHE (fhevm)
- **Programming Language**: Solidity for smart contracts, Python for additional tools
- **Front-end Framework**: React for user interface components
- **Back-end Framework**: Node.js for server management
- **Database**: IPFS for decentralized storage of encrypted shards

## Smart Contract / Core Logic (Code Snippet)

Here’s a simple example of how the core wallet recovery logic might look in Solidity. This snippet illustrates splitting and encrypting the private key:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "tfhe.sol"; // Hypothetical import for illustration

contract ConfidentialWalletRecovery {
    mapping(address => bytes32) private encryptedShards;

    function createShard(address user, uint64 key) public {
        // Encrypt the key using homomorphic encryption
        bytes32 encryptedKey = TFHE.encrypt(key);
        encryptedShards[user] = encryptedKey;
    }

    function recoverKey(address[] memory guardians) public view returns (uint64) {
        bytes32 combinedShards = combineShards(guardians); // Homomorphic operation
        return TFHE.decrypt(combinedShards);
    }
}
```

## Directory Structure

The project is organized as follows:

```
/confidential-wallet-recovery
├── /contracts
│   └── ConfidentialWalletRecovery.sol
├── /scripts
│   └── main.py
├── /frontend
│   ├── /src
│   │   └── App.jsx
│   └── package.json
├── /backend
│   ├── index.js
│   └── package.json
└── README.md
```

## Installation & Setup

### Prerequisites

To get started, ensure you have the following installed:

- Node.js
- Python 3.x
- npm or pip package managers

### Install Dependencies

1. **For the Frontend**:
   Navigate to the frontend directory and install the required packages:

   ```bash
   cd frontend
   npm install
   npm install fhevm
   ```

2. **For the Backend**:
   Navigate to the backend directory and install the required packages:

   ```bash
   cd backend
   npm install
   ```

3. **For the Python scripts**:
   Install the necessary Python dependencies:

   ```bash
   pip install concrete-ml
   ```

## Build & Run

To run the application, follow these steps:

1. **Compile the Smart Contract**:
   Navigate to the contracts directory and compile the Solidity contract:

   ```bash
   npx hardhat compile
   ```

2. **Run the Backend Server**:
   In the backend directory, start the server:

   ```bash
   node index.js
   ```

3. **Run the Frontend Application**:
   In the frontend directory, start the React application:

   ```bash
   npm start
   ```

## Acknowledgements

This project leverages the powerful open-source FHE primitives provided by Zama, enabling us to create a secure and privacy-focused wallet recovery solution. Their dedication to advancing cryptographic technologies is integral to the success of this project.

