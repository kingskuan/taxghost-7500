# TaxGhost — Privacy-First Tax Tool

A decentralized, privacy-preserving tax compliance platform leveraging zero-knowledge proofs and encrypted storage to enable secure tax reporting without exposing sensitive financial data.

## Description

TaxGhost combines modern cryptography, blockchain technology, and privacy-first principles to revolutionize tax compliance. Using zero-knowledge proofs (via Circom and Noir), users can prove tax compliance without revealing underlying financial information. Integration with IPFS ensures immutable, distributed storage of tax records, while the Liquify API enables seamless financial data aggregation.

## Features

- **Zero-Knowledge Proofs**: Prove tax compliance without exposing sensitive financial details
- **Privacy-First Architecture**: End-to-end encrypted data handling
- **Decentralized Storage**: IPFS integration for immutable, distributed tax records
- **Multi-Proof System**: Support for both Circom and Noir proof circuits
- **Automated Financial Aggregation**: Liquify API integration for real-time data synchronization
- **Web3-Ready**: Built on Next.js with blockchain connectivity
- **Audit Trail**: Cryptographically verifiable transaction history

## Project Structure

```
taxghost/
├── pages/              # Next.js pages and API routes
├── components/         # React components (UI, forms, dashboards)
├── lib/
│   ├── proofs/        # Circom and Noir circuit definitions
│   ├── crypto/        # Encryption and ZK proof utilities
│   ├── ipfs/          # IPFS client and storage handlers
│   ├── liquify/       # Liquify API integration
│   └── types/         # TypeScript type definitions
├── circuits/          # Circom circuit files (.circom)
├── public/            # Static assets
├── styles/            # CSS modules and globals
├── .env.local         # Environment variables (local)
├── next.config.js     # Next.js configuration
├── package.json       # Dependencies
└── README.md          # This file
```

## Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Git
- Circom and snarkjs (for proof compilation)
- IPFS node or Infura/Pinata API keys

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/taxghost.git
   cd taxghost
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_LIQUIFY_API_KEY=your_liquify_api_key
   IPFS_API_URL=https://ipfs.infura.io:5001
   IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
   NOIR_PROVER_BACKEND=barretenberg
   CIRCOM_PTAU_PATH=./ptau/powersOfTau28_hez_final_12.ptau
   ```

4. **Setup Circom circuits** (if needed)
   ```bash
   npm run circuits:build
   ```

5. **Generate proving keys**
   ```bash
   npm run proofs:generate
   ```

## Usage

### Development

Start the development server:
```bash
npm run dev
